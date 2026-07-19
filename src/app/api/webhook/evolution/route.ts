import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/drizzle';
import { instances, chats, messages } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { pusherServer } from '@/lib/pusher-server';
import { jidToPhone } from '@/lib/utils';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    /*
      Evolution v2 Webhook payload:
      {
        event: "MESSAGES_UPSERT" | "CONNECTION_UPDATE" | "QRCODE_UPDATED" | ...
        instance: "instanceName",
        data: { ... }
      }
    */
    const event = (body.event || body.type || '') as string;
    const instanceName = (body.instance || body.instanceName || '') as string;
    const data = body.data;

    if (!instanceName) return NextResponse.json({ received: true });

    // ─── جلب الـ instance من DB ─────────────────────────────────────────────
    const instance = await db.query.instances.findFirst({
      where: eq(instances.instanceName, instanceName),
    });

    if (!instance) {
      // instance غير معروف — تجاهل بهدوء
      return NextResponse.json({ received: true, note: 'unknown_instance' });
    }

    // ─── QRCODE_UPDATED ────────────────────────────────────────────────────
    if (event === 'QRCODE_UPDATED' || event === 'qrcode.updated') {
      const qrBase64 = data?.qrcode?.base64 || data?.base64 || null;
      // أرسل QR عبر Pusher للواجهة لتحديثه مباشرة
      if (qrBase64) {
        await pusherServer.trigger('team-channel', 'qr-update', {
          instanceId: instance.id,
          instanceName: instance.instanceName,
          qr: qrBase64,
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
      else if (state === 'close' || state === 'closed') status = 'disconnected';

      const updates: Record<string, any> = { status, updatedAt: new Date() };

      // لو اتصل، احفظ رقم الهاتف إذا متوفر
      if (state === 'open' && data?.wuid) {
        const phone = jidToPhone(data.wuid);
        if (phone) updates.phoneNumber = phone;
      }

      await db.update(instances).set(updates).where(eq(instances.id, instance.id));

      await pusherServer.trigger('team-channel', 'instance-update', {
        instanceId: instance.id,
        status,
        phoneNumber: updates.phoneNumber || null,
      });

      return NextResponse.json({ received: true });
    }

    // ─── MESSAGES_UPSERT ───────────────────────────────────────────────────
    if (event === 'MESSAGES_UPSERT' || event === 'messages.upsert') {
      const msgs = Array.isArray(data) ? data : data?.messages || [data];

      for (const msg of msgs) {
        if (!msg?.key?.remoteJid) continue;

        const remoteJid = msg.key.remoteJid as string;

        // تجاهل broadcast وstatus
        if (remoteJid === 'status@broadcast') continue;

        const fromMe = !!msg.key.fromMe;
        const messageId = msg.key.id as string;
        if (!messageId) continue;

        const pushName: string | null = msg.pushName || null;
        const phone = jidToPhone(remoteJid);
        const isGroup = remoteJid.endsWith('@g.us');

        // ─── جلب أو إنشاء المحادثة ────────────────────────────────────────
        let chat = await db.query.chats.findFirst({
          where: (c, { and, eq }) => and(eq(c.remoteJid, remoteJid), eq(c.instanceId, instance.id)),
        });

        if (!chat) {
          const [newChat] = await db
            .insert(chats)
            .values({
              teamId: instance.teamId,
              instanceId: instance.id,
              remoteJid,
              name: pushName || phone,
              phoneNumber: isGroup ? null : phone,
              isGroup,
              unreadCount: fromMe ? 0 : 1,
            })
            .returning();
          chat = newChat;
        } else {
          // تحديث الاسم إذا تغيّر
          if (!fromMe && pushName && pushName !== chat.name) {
            await db.update(chats).set({ name: pushName }).where(eq(chats.id, chat.id));
          }
        }

        // ─── استخراج المحتوى ───────────────────────────────────────────────
        const m = msg.message || {};

        let messageType = 'text';
        let text: string | null = null;
        let mediaUrl: string | null = null;
        let mediaMimetype: string | null = null;
        let mediaCaption: string | null = null;

        // نص عادي
        if (m.conversation) {
          text = m.conversation;
        }
        // نص موسّع (رابط، ذكر، ردود)
        else if (m.extendedTextMessage?.text) {
          text = m.extendedTextMessage.text;
        }
        // صورة
        else if (m.imageMessage) {
          messageType = 'image';
          mediaCaption = m.imageMessage.caption || null;
          text = mediaCaption;
          mediaMimetype = m.imageMessage.mimetype || 'image/jpeg';
          // base64 يأتي إذا byEvents: true و base64: true في webhook settings
          const b64 = msg.message?.base64 || m.imageMessage?.base64;
          mediaUrl = b64 ? `data:${mediaMimetype};base64,${b64}` : null;
        }
        // فيديو
        else if (m.videoMessage) {
          messageType = 'video';
          mediaCaption = m.videoMessage.caption || null;
          mediaMimetype = m.videoMessage.mimetype || 'video/mp4';
          const b64 = msg.message?.base64 || m.videoMessage?.base64;
          mediaUrl = b64 ? `data:${mediaMimetype};base64,${b64}` : null;
        }
        // صوت
        else if (m.audioMessage) {
          messageType = 'audio';
          mediaMimetype = m.audioMessage.mimetype || 'audio/ogg';
          const b64 = msg.message?.base64 || m.audioMessage?.base64;
          mediaUrl = b64 ? `data:${mediaMimetype};base64,${b64}` : null;
        }
        // مستند
        else if (m.documentMessage) {
          messageType = 'document';
          mediaCaption = m.documentMessage.fileName || null;
          mediaMimetype = m.documentMessage.mimetype || 'application/octet-stream';
          const b64 = msg.message?.base64 || m.documentMessage?.base64;
          mediaUrl = b64 ? `data:${mediaMimetype};base64,${b64}` : null;
        }
        // ملصق (sticker)
        else if (m.stickerMessage) {
          messageType = 'sticker';
          mediaMimetype = m.stickerMessage.mimetype || 'image/webp';
          const b64 = msg.message?.base64 || m.stickerMessage?.base64;
          mediaUrl = b64 ? `data:${mediaMimetype};base64,${b64}` : null;
        }
        // reaction - تجاهل
        else if (m.reactionMessage) {
          continue;
        }
        // استجابة لأزرار
        else if (m.buttonsResponseMessage) {
          text = m.buttonsResponseMessage.selectedDisplayText || m.buttonsResponseMessage.selectedButtonId;
        }
        // أنواع غير معروفة
        else {
          text = null; // لا نعرضها
        }

        // ─── حفظ الرسالة ──────────────────────────────────────────────────
        const timestamp = msg.messageTimestamp
          ? new Date(Number(msg.messageTimestamp) * 1000)
          : new Date();

        const [newMessage] = await db
          .insert(messages)
          .values({
            id: messageId,
            chatId: chat.id,
            fromMe,
            senderName: pushName,
            messageType,
            text,
            mediaUrl,
            mediaMimetype,
            mediaCaption,
            status: fromMe ? 'sent' : 'delivered',
            timestamp,
          })
          .onConflictDoNothing()
          .returning();

        if (!newMessage) continue; // رسالة موجودة مسبقاً، تجاهل

        // ─── تحديث معلومات المحادثة ───────────────────────────────────────
        const previewText =
          text || (mediaCaption ? `📎 ${mediaCaption}` : `📎 ${messageType}`);

        await db
          .update(chats)
          .set({
            lastMessageText: previewText,
            lastMessageAt: timestamp,
            lastMessageFromMe: fromMe,
            unreadCount: fromMe ? 0 : (chat.unreadCount || 0) + 1,
            updatedAt: new Date(),
          })
          .where(eq(chats.id, chat.id));

        // ─── Pusher realtime ───────────────────────────────────────────────
        await pusherServer
          .trigger('team-channel', 'new-message', {
            chatId: chat.id,
            message: { ...newMessage, timestamp: timestamp.toISOString() },
          })
          .catch((e: any) => console.error('[Pusher new-message]', e.message));

        await pusherServer
          .trigger('team-channel', 'chat-update', { chatId: chat.id })
          .catch((e: any) => console.error('[Pusher chat-update]', e.message));

        // ─── تشغيل محرك الأتمتة (رسائل واردة فقط) ────────────────────────
        if (!fromMe && text) {
          import('@/lib/automation/engine')
            .then(({ runAutomationForMessage }) =>
              runAutomationForMessage(chat!.id, text!).catch((e: any) =>
                console.error('[Automation]', e.message)
              )
            )
            .catch(() => {});
        }
      }

      return NextResponse.json({ received: true });
    }

    // ─── MESSAGES_UPDATE (حالة التوصيل: sent/delivered/read) ──────────────
    if (event === 'MESSAGES_UPDATE' || event === 'messages.update') {
      const updates = Array.isArray(data) ? data : [data];
      for (const u of updates) {
        const msgId = u?.key?.id;
        const statusRaw = u?.update?.status;
        if (!msgId || !statusRaw) continue;

        // Evolution: 0=error, 1=pending, 2=sent, 3=delivered, 4=read
        const statusMap: Record<number, string> = {
          0: 'failed', 1: 'pending', 2: 'sent', 3: 'delivered', 4: 'read',
        };
        const status = statusMap[Number(statusRaw)] || 'sent';

        await db
          .update(messages)
          .set({ status })
          .where(eq(messages.id, msgId))
          .catch(() => {});
      }
      return NextResponse.json({ received: true });
    }

    // أي حدث آخر - تجاهل
    return NextResponse.json({ received: true });

  } catch (e: any) {
    console.error('[Evolution Webhook]', e.message, e.stack);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
