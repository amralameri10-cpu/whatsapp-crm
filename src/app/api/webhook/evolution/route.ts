import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/drizzle';
import { instances, chats, messages } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { broadcastToTeam } from '@/lib/sse';
import { jidToPhone } from '@/lib/utils';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const event = (body.event || body.type || '') as string;
    const instanceName = (body.instance || body.instanceName || '') as string;
    const data = body.data;

    if (!instanceName) return NextResponse.json({ received: true });

    const instance = await db.query.instances.findFirst({
      where: eq(instances.instanceName, instanceName),
    });
    if (!instance) return NextResponse.json({ received: true, note: 'unknown_instance' });

    // ─── QRCODE_UPDATED ────────────────────────────────────────────────────
    if (event === 'QRCODE_UPDATED' || event === 'qrcode.updated') {
      const qr = data?.qrcode?.base64 || data?.base64 || null;
      if (qr) {
        broadcastToTeam(instance.teamId, 'qr-update', {
          instanceId: instance.id, qr,
        });
      }
      return NextResponse.json({ received: true });
    }

    // ─── CONNECTION_UPDATE ─────────────────────────────────────────────────
    if (event === 'CONNECTION_UPDATE' || event === 'connection.update') {
      const state = data?.state || data?.status;
      let status = 'disconnected';
      if (state === 'open') status = 'open';
      else if (state === 'connecting') status = 'connecting';

      const updates: any = { status, updatedAt: new Date() };
      if (state === 'open' && data?.wuid) {
        updates.phoneNumber = jidToPhone(data.wuid);
      }

      await db.update(instances).set(updates).where(eq(instances.id, instance.id));
      broadcastToTeam(instance.teamId, 'instance-update', { instanceId: instance.id, status });
      return NextResponse.json({ received: true });
    }

    // ─── MESSAGES_UPSERT ───────────────────────────────────────────────────
    if (event === 'MESSAGES_UPSERT' || event === 'messages.upsert') {
      const msgs = Array.isArray(data) ? data : data?.messages || [data];

      for (const msg of msgs) {
        if (!msg?.key?.remoteJid) continue;
        const remoteJid = msg.key.remoteJid as string;
        if (remoteJid === 'status@broadcast') continue;

        const fromMe = !!msg.key.fromMe;
        const messageId = msg.key.id as string;
        if (!messageId) continue;

        const pushName: string | null = msg.pushName || null;
        const phone = jidToPhone(remoteJid);
        const isGroup = remoteJid.endsWith('@g.us');

        // جلب أو إنشاء المحادثة
        let chat = await db.query.chats.findFirst({
          where: (c, { and, eq }) => and(eq(c.remoteJid, remoteJid), eq(c.instanceId, instance.id)),
        });

        if (!chat) {
          const [newChat] = await db.insert(chats).values({
            teamId: instance.teamId,
            instanceId: instance.id,
            remoteJid,
            name: pushName || phone,
            phoneNumber: isGroup ? null : phone,
            isGroup,
            unreadCount: fromMe ? 0 : 1,
          }).returning();
          chat = newChat;
        } else if (!fromMe && pushName && pushName !== chat.name) {
          await db.update(chats).set({ name: pushName }).where(eq(chats.id, chat.id));
        }

        // استخراج المحتوى
        const m = msg.message || {};
        let messageType = 'text';
        let text: string | null = null;
        let mediaUrl: string | null = null;
        let mediaMimetype: string | null = null;
        let mediaCaption: string | null = null;

        if (m.conversation) { text = m.conversation; }
        else if (m.extendedTextMessage?.text) { text = m.extendedTextMessage.text; }
        else if (m.imageMessage) {
          messageType = 'image'; mediaMimetype = m.imageMessage.mimetype || 'image/jpeg';
          mediaCaption = m.imageMessage.caption || null; text = mediaCaption;
          const b64 = msg.message?.base64 || m.imageMessage?.base64;
          mediaUrl = b64 ? `data:${mediaMimetype};base64,${b64}` : null;
        }
        else if (m.videoMessage) {
          messageType = 'video'; mediaMimetype = m.videoMessage.mimetype || 'video/mp4';
          mediaCaption = m.videoMessage.caption || null;
          const b64 = msg.message?.base64 || m.videoMessage?.base64;
          mediaUrl = b64 ? `data:${mediaMimetype};base64,${b64}` : null;
        }
        else if (m.audioMessage) {
          messageType = 'audio'; mediaMimetype = m.audioMessage.mimetype || 'audio/ogg';
          const b64 = msg.message?.base64 || m.audioMessage?.base64;
          mediaUrl = b64 ? `data:${mediaMimetype};base64,${b64}` : null;
        }
        else if (m.documentMessage) {
          messageType = 'document'; mediaMimetype = m.documentMessage.mimetype;
          mediaCaption = m.documentMessage.fileName || null;
          const b64 = msg.message?.base64 || m.documentMessage?.base64;
          mediaUrl = b64 ? `data:${mediaMimetype};base64,${b64}` : null;
        }
        else if (m.stickerMessage) {
          messageType = 'sticker'; mediaMimetype = 'image/webp';
        }
        else if (m.reactionMessage) { continue; }
        else if (m.buttonsResponseMessage) {
          text = m.buttonsResponseMessage.selectedDisplayText || null;
        }

        const timestamp = msg.messageTimestamp
          ? new Date(Number(msg.messageTimestamp) * 1000)
          : new Date();

        const [newMessage] = await db.insert(messages).values({
          id: messageId, chatId: chat.id, fromMe,
          senderName: pushName, messageType, text,
          mediaUrl, mediaMimetype, mediaCaption,
          status: fromMe ? 'sent' : 'delivered', timestamp,
        }).onConflictDoNothing().returning();

        if (!newMessage) continue;

        const previewText = text || (mediaCaption ? `📎 ${mediaCaption}` : `📎 ${messageType}`);
        await db.update(chats).set({
          lastMessageText: previewText, lastMessageAt: timestamp,
          lastMessageFromMe: fromMe, updatedAt: new Date(),
          unreadCount: fromMe ? 0 : (chat.unreadCount || 0) + 1,
        }).where(eq(chats.id, chat.id));

        broadcastToTeam(instance.teamId, 'new-message', {
          chatId: chat.id,
          message: { ...newMessage, timestamp: timestamp.toISOString() },
        });
        broadcastToTeam(instance.teamId, 'chat-update', { chatId: chat.id });

        // تشغيل الأتمتة
        if (!fromMe && text) {
          import('@/lib/automation/engine')
            .then(({ runAutomationForMessage }) =>
              runAutomationForMessage(chat!.id, text!).catch(() => {}))
            .catch(() => {});
        }
      }
      return NextResponse.json({ received: true });
    }

    // ─── MESSAGES_UPDATE (حالة التوصيل) ───────────────────────────────────
    if (event === 'MESSAGES_UPDATE' || event === 'messages.update') {
      const updates = Array.isArray(data) ? data : [data];
      for (const u of updates) {
        const msgId = u?.key?.id;
        const statusRaw = u?.update?.status;
        if (!msgId || statusRaw === undefined) continue;
        const statusMap: Record<number, string> = { 0: 'failed', 1: 'pending', 2: 'sent', 3: 'delivered', 4: 'read' };
        const status = statusMap[Number(statusRaw)] || 'sent';
        await db.update(messages).set({ status }).where(eq(messages.id, msgId)).catch(() => {});
      }
      return NextResponse.json({ received: true });
    }

    return NextResponse.json({ received: true });
  } catch (e: any) {
    console.error('[Webhook]', e.message);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
