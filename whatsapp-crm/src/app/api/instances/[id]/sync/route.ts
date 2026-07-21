import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/drizzle';
import { instances, chats, messages, contacts } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { getUserContext } from '@/lib/db/queries';
import { getEvolutionConfig, EvolutionClient } from '@/lib/whatsapp/evolution-client';
import { jidToPhone, isJidOrGroupId } from '@/lib/utils';

/**
 * Extract a clean display name from Evolution chat data.
 * Priority: pushName > (real name if not JID) > formatted phone
 */
function extractName(evoChat: any): string | null {
  const pushName: string | null = evoChat.pushName || null;
  const rawName: string | null = evoChat.name || null;
  const phone: string = jidToPhone(evoChat.id || evoChat.remoteJid || '');

  // If pushName exists and is not a JID, use it
  if (pushName && !isJidOrGroupId(pushName)) {
    return pushName;
  }

  // If name exists and is NOT a JID (not containing @), use it
  if (rawName && !isJidOrGroupId(rawName)) {
    return rawName;
  }

  // Otherwise format the phone number
  if (phone && phone !== 'status' && phone !== 'broadcast') {
    return phone;
  }

  return null;
}

/**
 * Extract message text and media info from an Evolution message object.
 */
function extractMessageContent(msg: any) {
  const m = msg.message || {};
  let text: string | null = null;
  let messageType = 'text';
  let mediaUrl: string | null = null;
  let mediaMimetype: string | null = null;
  let mediaCaption: string | null = null;

  if (m.conversation) {
    text = m.conversation;
  } else if (m.extendedTextMessage?.text) {
    text = m.extendedTextMessage.text;
  } else if (m.imageMessage) {
    messageType = 'image';
    mediaMimetype = m.imageMessage.mimetype || 'image/jpeg';
    mediaCaption = m.imageMessage.caption || null;
    text = mediaCaption;
    // Try multiple paths for base64 data
    const b64 = m.imageMessage.base64 || msg.message?.base64 || m.imageMessage?.url;
    mediaUrl = b64 && !b64.startsWith('http') && !b64.startsWith('data:') ? `data:${mediaMimetype};base64,${b64}` : b64 || null;
  } else if (m.videoMessage) {
    messageType = 'video';
    mediaMimetype = m.videoMessage.mimetype || 'video/mp4';
    mediaCaption = m.videoMessage.caption || null;
    const b64 = m.videoMessage.base64 || msg.message?.base64 || m.videoMessage?.url;
    mediaUrl = b64 && !b64.startsWith('http') && !b64.startsWith('data:') ? `data:${mediaMimetype};base64,${b64}` : b64 || null;
  } else if (m.audioMessage) {
    messageType = 'audio';
    mediaMimetype = m.audioMessage.mimetype || 'audio/ogg';
    const b64 = m.audioMessage.base64 || msg.message?.base64 || m.audioMessage?.url;
    mediaUrl = b64 && !b64.startsWith('http') && !b64.startsWith('data:') ? `data:${mediaMimetype};base64,${b64}` : b64 || null;
  } else if (m.documentMessage) {
    messageType = 'document';
    mediaMimetype = m.documentMessage.mimetype || 'application/octet-stream';
    mediaCaption = m.documentMessage.fileName || null;
    text = mediaCaption;
    const b64 = m.documentMessage.base64 || msg.message?.base64 || m.documentMessage?.url;
    mediaUrl = b64 && !b64.startsWith('http') && !b64.startsWith('data:') ? `data:${mediaMimetype};base64,${b64}` : b64 || null;
  } else if (m.stickerMessage) {
    messageType = 'sticker';
    mediaMimetype = 'image/webp';
  } else if (m.reactionMessage) {
    text = m.reactionMessage.text || null;
  } else if (m.buttonsResponseMessage) {
    text = m.buttonsResponseMessage.selectedDisplayText || null;
  } else if (m.templateButtonReplyMessage) {
    text = m.templateButtonReplyMessage.selectedDisplayText || null;
  } else if (m.listResponseMessage) {
    text = m.listResponseMessage.singleSelectReply?.selectedRowId || null;
  } else if (m.locationMessage) {
    text = m.locationMessage.comment || '📍 موقع';
    messageType = 'location';
  } else if (m.contactMessage) {
    text = m.contactMessage.displayName || '👤 جهة اتصال';
    messageType = 'contact';
  } else if (m.liveLocationMessage) {
    text = '📍 موقع مباشر';
    messageType = 'location';
  } else if (m.pollCreationMessage) {
    text = m.pollCreationMessage.name || '📊 استطلاع';
    messageType = 'poll';
  } else if (m.protocolMessage) {
    messageType = 'protocol';
  }

  return { text, messageType, mediaUrl, mediaMimetype, mediaCaption };
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await getUserContext();
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const instance = await db.query.instances.findFirst({
    where: and(eq(instances.id, parseInt(id)), eq(instances.teamId, ctx.teamId)),
  });
  if (!instance) return NextResponse.json({ error: 'Instance not found' }, { status: 404 });

  const config = await getEvolutionConfig(ctx.teamId);
  const client = new EvolutionClient(config.apiUrl, config.apiKey);

  let synced = 0;
  let errors = 0;

  try {
    // Fetch chat list from Evolution
    const chatsRes = await client.req(`/chat/findChats/${instance.instanceName}`, { method: 'POST', body: {} });
    const chatList = Array.isArray(chatsRes) ? chatsRes : chatsRes?.chats || [];

    for (const evoChat of chatList.slice(0, 100)) {
      try {
        const remoteJid = evoChat.id || evoChat.remoteJid;
        if (!remoteJid || remoteJid === 'status@broadcast') continue;

        const phone = jidToPhone(remoteJid);
        const isGroup = remoteJid.endsWith('@g.us');
        const cleanName = extractName(evoChat);

        // Upsert chat
        let chat = await db.query.chats.findFirst({
          where: (c, { and, eq }) => and(eq(c.remoteJid, remoteJid), eq(c.instanceId, instance.id)),
        });

        if (!chat) {
          const [newChat] = await db.insert(chats).values({
            teamId: instance.teamId,
            instanceId: instance.id,
            remoteJid,
            name: cleanName,
            phoneNumber: isGroup ? null : phone,
            isGroup,
            lastMessageText: evoChat.lastMessage?.conversation || evoChat.lastMessage?.extendedTextMessage?.text || null,
            lastMessageAt: evoChat.lastMessage?.messageTimestamp
              ? new Date(Number(evoChat.lastMessage.messageTimestamp) * 1000) : null,
            unreadCount: evoChat.unreadCount || 0,
          }).returning();
          chat = newChat;
        } else {
          // Update chat name if we have a better one
          const updateData: any = {};
          if (cleanName && (!chat.name || isJidOrGroupId(chat.name))) {
            updateData.name = cleanName;
          }
          if (!chat.phoneNumber && !isGroup && phone) {
            updateData.phoneNumber = phone;
          }
          if (Object.keys(updateData).length > 0) {
            updateData.updatedAt = new Date();
            await db.update(chats).set(updateData).where(eq(chats.id, chat.id));
          }
        }

        // Auto-populate contacts table
        if (chat && !isGroup && phone) {
          const existingContact = await db.query.contacts.findFirst({
            where: (c, { eq: eq2, and: and2 }) => and2(eq2(c.phone, phone), eq2(c.teamId, ctx.teamId)),
          });
          if (!existingContact) {
            await db.insert(contacts).values({
              teamId: ctx.teamId,
              chatId: chat.id,
              name: cleanName,
              phone,
            }).onConflictDoNothing();
          } else if (!existingContact.chatId) {
            await db.update(contacts).set({ chatId: chat.id }).where(eq(contacts.id, existingContact.id));
          }
        }

        // Fetch recent messages for this chat
        try {
          const msgsRes = await client.req(`/chat/findMessages/${instance.instanceName}`, {
            method: 'POST',
            body: { where: { key: { remoteJid } }, limit: 50 },
          });

          const msgList = msgsRes?.messages?.records || msgsRes?.records || msgsRes || [];

          for (const msg of msgList) {
            if (!msg?.key?.id) continue;
            const { text, messageType, mediaUrl, mediaMimetype, mediaCaption } = extractMessageContent(msg);

            const timestamp = msg.messageTimestamp
              ? new Date(Number(msg.messageTimestamp) * 1000) : new Date();

            await db.insert(messages).values({
              id: msg.key.id,
              chatId: chat.id,
              fromMe: !!msg.key.fromMe,
              senderName: msg.pushName || null,
              messageType,
              text,
              mediaUrl,
              mediaMimetype,
              mediaCaption,
              status: 'delivered',
              timestamp,
            }).onConflictDoNothing();
          }
        } catch (e) {
          console.error('[Sync Messages Error]', e);
        }

        synced++;
      } catch (e) {
        console.error('[Sync Chat Error]', e);
        errors++;
      }
    }

    return NextResponse.json({ success: true, synced, errors });
  } catch (e: any) {
    console.error('[Sync]', e.message);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
