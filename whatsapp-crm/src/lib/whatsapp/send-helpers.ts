import { db } from '@/lib/db/drizzle';
import { chats, messages, instances } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { getEvolutionConfig, EvolutionClient } from './evolution-client';
import { broadcastToTeam } from '@/lib/sse';
import { jidToPhone } from '@/lib/utils';
import { randomUUID } from 'crypto';

/**
 * Determine the correct recipient for Evolution API send.
 * For groups: use the full remoteJid (e.g., group@g.us)
 * For individuals: use the phone number extracted from JID
 */
function getRecipient(remoteJid: string): string {
  if (remoteJid.endsWith('@g.us') || remoteJid.endsWith('@newsletter')) {
    // For groups and newsletters, Evolution expects the full JID
    return remoteJid;
  }
  // For individuals, use just the phone number
  return jidToPhone(remoteJid);
}

export async function sendTextAndPersist(chatId: number, text: string) {
  const chat = await db.query.chats.findFirst({ where: eq(chats.id, chatId) });
  if (!chat) throw new Error('Chat not found');

  const instance = await db.query.instances.findFirst({ where: eq(instances.id, chat.instanceId) });
  if (!instance) throw new Error('Instance not found');

  const config = await getEvolutionConfig(chat.teamId);
  if (!config.apiUrl || !config.apiKey) throw new Error('Evolution API not configured');

  const client = new EvolutionClient(config.apiUrl, config.apiKey);
  const recipient = getRecipient(chat.remoteJid);

  let evoResult: any = null;
  let status: 'sent' | 'failed' = 'sent';
  let errorMessage = '';
  
  try {
    evoResult = await client.sendText(instance.instanceName, recipient, text);
    // If Evolution returns an error-like response
    if (evoResult?.error) {
      throw new Error(evoResult.error || 'Unknown error from Evolution');
    }
  } catch (e: any) {
    errorMessage = e.message || 'Unknown error';
    console.error('[sendText]', errorMessage, 'chatId:', chatId, 'remoteJid:', chat.remoteJid, 'recipient:', recipient);
    status = 'failed';
  }

  const messageId = evoResult?.key?.id || `local_${randomUUID()}`;
  const timestamp = new Date();

  const [newMessage] = await db.insert(messages).values({
    id: messageId,
    chatId,
    fromMe: true,
    messageType: 'text',
    text,
    status,
    timestamp,
  }).onConflictDoNothing().returning();

  await db.update(chats).set({
    lastMessageText: text,
    lastMessageAt: timestamp,
    lastMessageFromMe: true,
    updatedAt: timestamp,
  }).where(eq(chats.id, chatId));

  if (newMessage) {
    broadcastToTeam(chat.teamId, 'new-message', {
      chatId,
      message: { ...newMessage, timestamp: timestamp.toISOString() },
    });
    broadcastToTeam(chat.teamId, 'chat-update', { chatId });
  }

  if (status === 'failed') {
    throw new Error(`فشل إرسال الرسالة${errorMessage ? ': ' + errorMessage : ''}`);
  }
  
  return newMessage;
}
