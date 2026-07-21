import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/drizzle';
import { chats, instances, messages } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { getUserContext } from '@/lib/db/queries';
import { getEvolutionConfig, EvolutionClient } from '@/lib/whatsapp/evolution-client';
import { jidToPhone } from '@/lib/utils';
import { broadcastToTeam } from '@/lib/sse';
import { randomUUID } from 'crypto';

function getRecipient(remoteJid: string): string {
  if (remoteJid.endsWith('@g.us') || remoteJid.endsWith('@newsletter')) {
    return remoteJid;
  }
  return jidToPhone(remoteJid);
}

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

  if (file.size > 15 * 1024 * 1024) {
    return NextResponse.json({ error: 'حجم الملف أكبر من 15 MB' }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const base64 = buffer.toString('base64');
  const mime = file.type;
  const config = await getEvolutionConfig(ctx.teamId);
  const client = new EvolutionClient(config.apiUrl, config.apiKey);
  const recipient = getRecipient(chat.remoteJid);

  let messageType: 'image' | 'video' | 'audio' | 'document' = 'document';
  if (mime.startsWith('image/')) messageType = 'image';
  else if (mime.startsWith('video/')) messageType = 'video';
  else if (mime.startsWith('audio/')) messageType = 'audio';

  let evoResult: any = null;
  let status: 'sent' | 'failed' = 'sent';
  let errorMessage = '';

  try {
    if (messageType === 'audio') {
      evoResult = await client.sendAudio(instance.instanceName, recipient, base64);
    } else {
      evoResult = await client.sendMedia(instance.instanceName, recipient, messageType, base64, '', file.name);
    }
    if (evoResult?.error) {
      throw new Error(evoResult.error);
    }
  } catch (e: any) {
    errorMessage = e.message || 'Unknown error';
    console.error('[send-media]', errorMessage);
    status = 'failed';
  }

  const messageId = evoResult?.key?.id || `local_${randomUUID()}`;
  const timestamp = new Date();
  const previewText =
    messageType === 'image' ? '📷 صورة' :
    messageType === 'video' ? '🎬 فيديو' :
    messageType === 'audio' ? '🎤 صوت' :
    `📎 ${file.name}`;

  const [newMessage] = await db.insert(messages).values({
    id: messageId,
    chatId: id,
    fromMe: true,
    messageType,
    mediaMimetype: mime,
    mediaCaption: file.name,
    status,
    timestamp,
  }).onConflictDoNothing().returning();

  await db.update(chats).set({
    lastMessageText: previewText,
    lastMessageAt: timestamp,
    lastMessageFromMe: true,
    updatedAt: new Date(),
  }).where(eq(chats.id, id));

  if (newMessage) {
    broadcastToTeam(ctx.teamId, 'new-message', {
      chatId: id,
      message: { ...newMessage, timestamp: timestamp.toISOString() },
    });
    broadcastToTeam(ctx.teamId, 'chat-update', { chatId: id });
  }

  if (status === 'failed') {
    return NextResponse.json({ error: `فشل إرسال الملف${errorMessage ? ': ' + errorMessage : ''}` }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
