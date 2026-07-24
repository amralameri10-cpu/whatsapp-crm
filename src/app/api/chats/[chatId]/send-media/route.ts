import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/drizzle';
import { chats, instances, messages } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { getUserContext } from '@/lib/db/queries';
import { getEvolutionConfig, EvolutionClient } from '@/lib/whatsapp/evolution-client';
import { getEvolutionRecipient } from '@/lib/whatsapp/send-helpers';
import { broadcastToTeam } from '@/lib/sse';
import { randomUUID } from 'crypto';

const MAX_FILE_SIZE = 50 * 1024 * 1024;

export async function POST(req: NextRequest, { params }: { params: Promise<{ chatId: string }> }) {
  const { chatId } = await params;
  const id = Number.parseInt(chatId, 10);

  const ctx = await getUserContext();
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const chat = await db.query.chats.findFirst({
    where: and(eq(chats.id, id), eq(chats.teamId, ctx.teamId)),
  });
  if (!chat) return NextResponse.json({ error: 'المحادثة غير موجودة' }, { status: 404 });

  const instance = await db.query.instances.findFirst({
    where: eq(instances.id, chat.instanceId),
  });
  if (!instance) return NextResponse.json({ error: 'نسخة واتساب غير موجودة' }, { status: 404 });

  const formData = await req.formData();
  const file = formData.get('file');
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'لم يتم اختيار ملف' }, { status: 400 });
  }

  if (!file.size) return NextResponse.json({ error: 'الملف فارغ' }, { status: 400 });
  if (file.size > MAX_FILE_SIZE) {
    return NextResponse.json({ error: 'حجم الملف أكبر من 50 MB' }, { status: 400 });
  }

  const recipient = getEvolutionRecipient(chat.remoteJid);
  if (!recipient) {
    return NextResponse.json({
      error: 'معرّف جهة الاتصال غير صالح. شغّل المزامنة من الإعدادات لتصحيح المحادثات القديمة',
    }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const base64 = buffer.toString('base64');
  const mime = file.type || 'application/octet-stream';
  const config = await getEvolutionConfig(ctx.teamId);
  if (!config.apiUrl || !config.apiKey) {
    return NextResponse.json({ error: 'لم يتم إعداد Evolution API' }, { status: 400 });
  }

  const client = new EvolutionClient(config.apiUrl, config.apiKey);

  let messageType: 'image' | 'video' | 'audio' | 'document' = 'document';
  if (mime.startsWith('image/')) messageType = 'image';
  else if (mime.startsWith('video/')) messageType = 'video';
  else if (mime.startsWith('audio/')) messageType = 'audio';

  let evoResult: any = null;
  let status: 'sent' | 'failed' = 'sent';
  let errorMessage = '';

  try {
    if (messageType === 'audio') {
      evoResult = await client.sendAudio(instance.instanceName, recipient, base64, mime, file.name || 'audio.ogg');
    } else {
      evoResult = await client.sendMedia(
        instance.instanceName,
        recipient,
        messageType,
        base64,
        '',
        file.name,
        mime,
      );
    }
  } catch (error: any) {
    errorMessage = error?.message || 'خطأ غير معروف من Evolution API';
    console.error('[send-media]', {
      error: errorMessage,
      status: error?.status,
      details: error?.details,
      chatId: id,
      remoteJid: chat.remoteJid,
      recipient,
      mime,
    });
    status = 'failed';
  }

  const messageId = evoResult?.key?.id || `local_${randomUUID()}`;
  const timestamp = new Date();
  const previewText =
    messageType === 'image' ? 'صورة' :
    messageType === 'video' ? 'فيديو' :
    messageType === 'audio' ? 'رسالة صوتية' :
    `ملف: ${file.name}`;

  const [newMessage] = await db.insert(messages).values({
    id: messageId,
    chatId: id,
    fromMe: true,
    messageType,
    mediaMimetype: mime,
    mediaCaption: file.name || null,
    status,
    timestamp,
  }).onConflictDoNothing().returning();

  if (status === 'sent') {
    await db.update(chats).set({
      lastMessageText: previewText,
      lastMessageAt: timestamp,
      lastMessageFromMe: true,
      updatedAt: timestamp,
    }).where(eq(chats.id, id));
  }

  if (newMessage) {
    broadcastToTeam(ctx.teamId, 'new-message', {
      chatId: id,
      message: { ...newMessage, timestamp: timestamp.toISOString() },
    });
    if (status === 'sent') broadcastToTeam(ctx.teamId, 'chat-update', { chatId: id });
  }

  if (status === 'failed') {
    return NextResponse.json({ error: `فشل إرسال الملف: ${errorMessage}` }, { status: 502 });
  }

  return NextResponse.json({ success: true, message: newMessage });
}
