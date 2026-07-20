import { db } from '@/lib/db/drizzle';
import { chats, messages, instances } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { getEvolutionConfig, EvolutionClient } from './evolution-client';
import { broadcastToTeam } from '@/lib/sse';
import { jidToPhone } from '@/lib/utils';
import { randomUUID } from 'crypto';

export async function sendTextAndPersist(chatId: number, text: string) {
  const chat = await db.query.chats.findFirst({ where: eq(chats.id, chatId) });
  if (!chat) throw new Error('Chat not found');

  const instance = await db.query.instances.findFirst({ where: eq(instances.id, chat.instanceId) });
  if (!instance) throw new Error('Instance not found');

  const config = await getEvolutionConfig(chat.teamId);
  if (!config.apiUrl || !config.apiKey) throw new Error('Evolution API not configured');

  const client = new EvolutionClient(config.apiUrl, config.apiKey);
  const phone = jidToPhone(chat.remoteJid);

  let evoResult: any = null;
  let status: 'sent' | 'failed' = 'sent';
  try {
    evoResult = await client.sendText(instance.instanceName, phone, text);
  } catch (e: any) {
    console.error('[sendText]', e.message);
    status = 'failed';
  }

  const messageId = evoResult?.key?.id || `local_${randomUUID()}`;
  const timestamp = new Date();

  const [newMessage] = await db.insert(messages).values({
    id: messageId, chatId, fromMe: true,
    messageType: 'text', text, status, timestamp,
  }).onConflictDoNothing().returning();

  await db.update(chats).set({
    lastMessageText: text, lastMessageAt: timestamp,
    lastMessageFromMe: true, updatedAt: timestamp,
  }).where(eq(chats.id, chatId));

  if (newMessage) {
    broadcastToTeam(chat.teamId, 'new-message', {
      chatId, message: { ...newMessage, timestamp: timestamp.toISOString() },
    });
    broadcastToTeam(chat.teamId, 'chat-update', { chatId });
  }

  if (status === 'failed') throw new Error('فشل إرسال الرسالة');
  return newMessage;
}
