import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/drizzle';
import { instances, chats, messages } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { getUserContext } from '@/lib/db/queries';
import { getEvolutionConfig, EvolutionClient } from '@/lib/whatsapp/evolution-client';
import { jidToPhone } from '@/lib/utils';

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
    // جلب آخر المحادثات من Evolution
    const chatsRes = await client.req(`/chat/findChats/${instance.instanceName}`, { method: 'POST', body: {} });
    const chatList = Array.isArray(chatsRes) ? chatsRes : chatsRes?.chats || [];

    for (const evoChat of chatList.slice(0, 50)) { // أول 50 محادثة
      try {
        const remoteJid = evoChat.id || evoChat.remoteJid;
        if (!remoteJid || remoteJid === 'status@broadcast') continue;

        const phone = jidToPhone(remoteJid);
        const isGroup = remoteJid.endsWith('@g.us');
        const name = evoChat.name || evoChat.pushName || phone;

        // إنشاء المحادثة لو ما موجودة
        let chat = await db.query.chats.findFirst({
          where: (c, { and, eq }) => and(eq(c.remoteJid, remoteJid), eq(c.instanceId, instance.id)),
        });

        if (!chat) {
          const [newChat] = await db.insert(chats).values({
            teamId: instance.teamId,
            instanceId: instance.id,
            remoteJid,
            name,
            phoneNumber: isGroup ? null : phone,
            isGroup,
            lastMessageText: evoChat.lastMessage?.conversation || null,
            lastMessageAt: evoChat.lastMessage?.messageTimestamp
              ? new Date(Number(evoChat.lastMessage.messageTimestamp) * 1000) : null,
            unreadCount: evoChat.unreadCount || 0,
          }).returning();
          chat = newChat;
        }

        // جلب آخر رسائل هذه المحادثة
        try {
          const msgsRes = await client.req(`/chat/findMessages/${instance.instanceName}`, {
            method: 'POST',
            body: { where: { key: { remoteJid } }, limit: 50 },
          });

          const msgList = msgsRes?.messages?.records || msgsRes?.records || msgsRes || [];

          for (const msg of msgList) {
            if (!msg?.key?.id) continue;
            const m = msg.message || {};
            let text: string | null = null;
            let messageType = 'text';
            let mediaUrl: string | null = null;
            let mediaMimetype: string | null = null;
            let mediaCaption: string | null = null;

            if (m.conversation) { text = m.conversation; }
            else if (m.extendedTextMessage?.text) { text = m.extendedTextMessage.text; }
            else if (m.imageMessage) { 
              messageType = 'image'; 
              mediaMimetype = m.imageMessage.mimetype || 'image/jpeg';
              mediaCaption = m.imageMessage.caption || null; 
              text = mediaCaption;
            }
            else if (m.videoMessage) { 
              messageType = 'video'; 
              mediaMimetype = m.videoMessage.mimetype || 'video/mp4';
              mediaCaption = m.videoMessage.caption || null;
            }
            else if (m.audioMessage) { 
              messageType = 'audio'; 
              mediaMimetype = m.audioMessage.mimetype || 'audio/ogg';
            }
            else if (m.documentMessage) { 
              messageType = 'document'; 
              mediaMimetype = m.documentMessage.mimetype;
              mediaCaption = m.documentMessage.fileName || null;
              text = mediaCaption;
            }
            else if (m.stickerMessage) {
              messageType = 'sticker';
              mediaMimetype = 'image/webp';
            }
            else if (m.buttonsResponseMessage) {
              text = m.buttonsResponseMessage.selectedDisplayText || null;
            }

            const timestamp = msg.messageTimestamp
              ? new Date(Number(msg.messageTimestamp) * 1000) : new Date();

            await db.insert(messages).values({
              id: msg.key.id,
              chatId: chat.id,
              fromMe: !!msg.key.fromMe,
              senderName: msg.pushName || null,
              messageType, text,
              mediaUrl, mediaMimetype, mediaCaption,
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
