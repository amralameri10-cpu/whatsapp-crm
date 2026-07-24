import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/drizzle';
import { instances, chats, messages, contacts } from '@/lib/db/schema';
import { and, eq } from 'drizzle-orm';
import { broadcastToTeam } from '@/lib/sse';
import {
  cleanDisplayName,
  isJidOrGroupId,
  jidToPhone,
  pickWhatsAppJid,
} from '@/lib/utils';
import {
  getEvolutionName,
  getMessageRemoteJid,
  isGroupJid,
  messageTimestamp,
  normalizeMessageContent,
  recordsFromEvolution,
} from '@/lib/whatsapp/normalizers';

function previewText(content: ReturnType<typeof normalizeMessageContent>): string {
  if (content.text) return content.text;
  switch (content.messageType) {
    case 'image': return 'صورة';
    case 'video': return 'فيديو';
    case 'audio': return 'رسالة صوتية';
    case 'document': return content.mediaCaption ? `ملف: ${content.mediaCaption}` : 'ملف';
    case 'sticker': return 'ملصق';
    case 'location': return 'موقع';
    case 'contact': return 'جهة اتصال';
    case 'poll': return 'استطلاع';
    case 'reaction': return 'تفاعل';
    default: return 'رسالة';
  }
}

function phoneFromMessage(message: any, remoteJid: string): string {
  const altJid = pickWhatsAppJid(message?.key?.remoteJidAlt, message?.remoteJidAlt);
  if (altJid?.endsWith('@s.whatsapp.net')) return jidToPhone(altJid);
  if (remoteJid.endsWith('@s.whatsapp.net')) return jidToPhone(remoteJid);
  const explicit = String(message?.number || message?.phone || '').replace(/\D/g, '');
  return explicit.length >= 5 ? explicit : '';
}

async function upsertWebhookContact(
  teamId: number,
  chatId: number,
  phone: string,
  name: string | null,
) {
  if (!phone) return;
  const existing = await db.query.contacts.findFirst({
    where: and(eq(contacts.teamId, teamId), eq(contacts.phone, phone)),
  });
  if (!existing) {
    await db.insert(contacts).values({ teamId, chatId, phone, name });
    return;
  }
  await db.update(contacts).set({
    chatId,
    name: name && (!existing.name || isJidOrGroupId(existing.name)) ? name : existing.name,
  }).where(eq(contacts.id, existing.id));
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const event = String(body.event || body.type || '').toLowerCase();
    const instanceName = String(body.instance || body.instanceName || body.sender || '');
    const data = body.data;

    if (!instanceName) return NextResponse.json({ received: true });

    const instance = await db.query.instances.findFirst({
      where: eq(instances.instanceName, instanceName),
    });
    if (!instance) return NextResponse.json({ received: true, note: 'unknown_instance' });

    if (event === 'qrcode_updated' || event === 'qrcode.updated') {
      const qr = data?.qrcode?.base64 || data?.base64 || null;
      if (qr) broadcastToTeam(instance.teamId, 'qr-update', { instanceId: instance.id, qr });
      return NextResponse.json({ received: true });
    }

    if (event === 'connection_update' || event === 'connection.update') {
      const state = data?.state || data?.status;
      const status = state === 'open' ? 'open' : state === 'connecting' ? 'connecting' : 'disconnected';
      const updates: any = { status, updatedAt: new Date() };
      if (state === 'open' && data?.wuid) updates.phoneNumber = jidToPhone(data.wuid);
      await db.update(instances).set(updates).where(eq(instances.id, instance.id));
      broadcastToTeam(instance.teamId, 'instance-update', { instanceId: instance.id, status });
      return NextResponse.json({ received: true });
    }

    if (event === 'messages_update' || event === 'messages.update') {
      const updates = Array.isArray(data) ? data : [data];
      for (const update of updates) {
        const messageId = update?.key?.id || update?.id;
        const status = update?.update?.status || update?.status;
        if (messageId && status) {
          await db.update(messages).set({ status: String(status).toLowerCase() }).where(eq(messages.id, String(messageId)));
        }
      }
      return NextResponse.json({ received: true });
    }

    if (event !== 'messages_upsert' && event !== 'messages.upsert') {
      return NextResponse.json({ received: true });
    }

    const incoming = Array.isArray(data)
      ? data
      : Array.isArray(data?.messages)
        ? data.messages
        : recordsFromEvolution(data).length
          ? recordsFromEvolution(data)
          : [data];

    for (const messageRecord of incoming) {
      const remoteJid = getMessageRemoteJid(messageRecord);
      if (!remoteJid || remoteJid === 'status@broadcast') continue;

      const messageId = messageRecord?.key?.id || messageRecord?.id;
      if (!messageId) continue;

      const fromMe = !!(messageRecord?.key?.fromMe ?? messageRecord?.fromMe);
      const isGroup = isGroupJid(remoteJid);
      const phone = isGroup ? '' : phoneFromMessage(messageRecord, remoteJid);
      const pushName = cleanDisplayName(
        messageRecord?.pushName,
        messageRecord?.senderName,
        getEvolutionName(messageRecord),
      );

      let chat = await db.query.chats.findFirst({
        where: and(eq(chats.remoteJid, remoteJid), eq(chats.instanceId, instance.id)),
      });

      // A LID webhook can refer to an existing phone-JID chat; match it by the
      // real phone number instead of creating a duplicate conversation.
      if (!chat && phone) {
        chat = await db.query.chats.findFirst({
          where: and(eq(chats.phoneNumber, phone), eq(chats.instanceId, instance.id)),
        });
        if (chat && chat.remoteJid !== remoteJid) {
          const [updated] = await db.update(chats).set({ remoteJid, updatedAt: new Date() })
            .where(eq(chats.id, chat.id)).returning();
          chat = updated;
        }
      }

      if (!chat) {
        const [created] = await db.insert(chats).values({
          teamId: instance.teamId,
          instanceId: instance.id,
          remoteJid,
          name: isGroup ? 'مجموعة واتساب' : pushName || phone || null,
          phoneNumber: isGroup ? null : phone || null,
          isGroup,
          unreadCount: 0,
          isOpen: true,
        }).returning();
        chat = created;
      } else {
        const betterName = !isGroup && pushName && (!chat.name || isJidOrGroupId(chat.name));
        await db.update(chats).set({
          ...(betterName ? { name: pushName } : {}),
          ...(!isGroup && phone && !chat.phoneNumber ? { phoneNumber: phone } : {}),
          isOpen: true,
          updatedAt: new Date(),
        }).where(eq(chats.id, chat.id));
      }

      if (!isGroup && phone) {
        await upsertWebhookContact(instance.teamId, chat.id, phone, pushName);
      }

      const content = normalizeMessageContent(messageRecord);
      if (content.messageType === 'protocol') continue;
      const timestamp = messageTimestamp(messageRecord);

      const [newMessage] = await db.insert(messages).values({
        id: String(messageId),
        chatId: chat.id,
        fromMe,
        senderName: pushName,
        messageType: content.messageType,
        text: content.text,
        mediaUrl: content.mediaUrl,
        mediaMimetype: content.mediaMimetype,
        mediaCaption: content.mediaCaption,
        quotedMessageId: content.quotedMessageId,
        quotedText: content.quotedText,
        status: fromMe ? 'sent' : 'delivered',
        timestamp,
      }).onConflictDoNothing().returning();

      if (!newMessage) continue;

      await db.update(chats).set({
        lastMessageText: previewText(content),
        lastMessageAt: timestamp,
        lastMessageFromMe: fromMe,
        updatedAt: new Date(),
        unreadCount: fromMe ? chat.unreadCount || 0 : (chat.unreadCount || 0) + 1,
      }).where(eq(chats.id, chat.id));

      broadcastToTeam(instance.teamId, 'new-message', {
        chatId: chat.id,
        message: { ...newMessage, timestamp: timestamp.toISOString() },
      });
      broadcastToTeam(instance.teamId, 'chat-update', { chatId: chat.id });

      if (!fromMe && content.text) {
        import('@/lib/automation/engine')
          .then(({ runAutomationForMessage }) => runAutomationForMessage(chat!.id, content.text!).catch(() => {}))
          .catch(() => {});
      }
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error('[Webhook]', error);
    return NextResponse.json({ received: true, error: 'processing_failed' });
  }
}
