import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/drizzle';
import { chats, instances, messages } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { getUserContext } from '@/lib/db/queries';
import { getEvolutionConfig, EvolutionClient } from '@/lib/whatsapp/evolution-client';
import { jidToPhone } from '@/lib/utils';
import { pusherServer } from '@/lib/pusher-server';
import { randomUUID } from 'crypto';

export async function POST(req: NextRequest, { params }: { params: Promise<{ chatId: string }> }) {
  const { chatId } = await params;
  const id = parseInt(chatId);

  const ctx = await getUserContext();
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const chat = await db.query.chats.findFirst({
    where: and(eq(chats.id, id), eq(chats.teamId, ctx.teamId)),
  });
  if (!chat) return NextResponse.json({ error: 'Chat not found' }, { status: 404 });

  const instance = await db.query.instances.findFirst({
    where: eq(instances.id, chat.instanceId),
  });
  if (!instance) return NextResponse.json({ error: 'Instance not found' }, { status: 404 });

  const formData = await req.formData();
  const file = formData.get('file') as File | null;
  if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 });

  const MAX_SIZE = 15 * 1024 * 1024; // 15 MB
  if (file.size > MAX_SIZE) {
    return NextResponse.json({ error: 'حجم الملف كبير جداً (الحد 15 MB)' }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const base64 = buffer.toString('base64');
  const mime = file.type;

  let mediatype: 'image' | 'video' | 'document' = 'document';
  if (mime.startsWith('image/')) mediatype = 'image';
  else if (mime.startsWith('video/')) mediatype = 'video';
  else if (mime.startsWith('audio/')) {
    // صوت - استخدم sendAudio
    const config = await getEvolutionConfig(ctx.teamId);
    const client = new EvolutionClient(config.apiUrl, config.apiKey);
    const phone = jidToPhone(chat.remoteJid);

    let evoResult: any = null;
    let status: 'sent' | 'failed' = 'sent';
    try {
      evoResult = await client.sendAudio(instance.instanceName, phone, base64);
    } catch { status = 'failed'; }

    const messageId = evoResult?.key?.id || `local_${randomUUID()}`;
    const timestamp = new Date();

    const [newMessage] = await db.insert(messages).values({
      id: messageId, chatId: id, fromMe: true,
      messageType: 'audio', mediaMimetype: mime,
      status, timestamp,
    }).onConflictDoNothing().returning();

    await db.update(chats).set({ lastMessageText: '🎤 صوت', lastMessageAt: timestamp, lastMessageFromMe: true }).where(eq(chats.id, id));
    if (newMessage) {
      await pusherServer.trigger('team-channel', 'new-message', { chatId: id, message: { ...newMessage, timestamp: timestamp.toISOString() } }).catch(() => {});
      await pusherServer.trigger('team-channel', 'chat-update', { chatId: id }).catch(() => {});
    }
    return NextResponse.json({ success: true });
  }

  const config = await getEvolutionConfig(ctx.teamId);
  const client = new EvolutionClient(config.apiUrl, config.apiKey);
  const phone = jidToPhone(chat.remoteJid);

  let evoResult: any = null;
  let status: 'sent' | 'failed' = 'sent';
  try {
    evoResult = await client.sendMedia(instance.instanceName, phone, mediatype, base64, '', file.name);
  } catch (e: any) {
    console.error('[send-media]', e.message);
    status = 'failed';
  }

  const messageId = evoResult?.key?.id || `local_${randomUUID()}`;
  const timestamp = new Date();
  const caption = file.name;

  const [newMessage] = await db.insert(messages).values({
    id: messageId, chatId: id, fromMe: true,
    messageType: mediatype,
    mediaMimetype: mime,
    mediaCaption: caption,
    status, timestamp,
  }).onConflictDoNothing().returning();

  const preview = mediatype === 'image' ? '📷 صورة' : mediatype === 'video' ? '🎬 فيديو' : `📎 ${caption}`;
  await db.update(chats).set({ lastMessageText: preview, lastMessageAt: timestamp, lastMessageFromMe: true }).where(eq(chats.id, id));

  if (newMessage) {
    await pusherServer.trigger('team-channel', 'new-message', { chatId: id, message: { ...newMessage, timestamp: timestamp.toISOString() } }).catch(() => {});
    await pusherServer.trigger('team-channel', 'chat-update', { chatId: id }).catch(() => {});
  }

  if (status === 'failed') {
    return NextResponse.json({ error: 'فشل إرسال الملف' }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
