import { db } from '@/lib/db/drizzle';
import { chats, messages, instances } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { getEvolutionConfig, EvolutionClient } from './evolution-client';
import { broadcastToTeam } from '@/lib/sse';
import { isWhatsAppJid, jidToPhone } from '@/lib/utils';
import { randomUUID } from 'crypto';

/**
 * Evolution expects a phone number for normal chats and a complete JID for
 * groups/newsletters. LID conversations cannot safely be converted to a phone
 * number, so their complete JID is preserved.
 */
export function getEvolutionRecipient(remoteJid: string): string {
  const jid = remoteJid.trim().toLowerCase();
  if (!isWhatsAppJid(jid)) return '';
  if (jid.endsWith('@g.us') || jid.endsWith('@newsletter') || jid.endsWith('@lid')) return jid;
  return jidToPhone(jid);
}

export async function sendTextAndPersist(chatId: number, text: string) {
  const normalizedText = text.trim();
  if (!normalizedText) throw new Error('لا يمكن إرسال رسالة فارغة');

  const chat = await db.query.chats.findFirst({ where: eq(chats.id, chatId) });
  if (!chat) throw new Error('المحادثة غير موجودة');

  const instance = await db.query.instances.findFirst({ where: eq(instances.id, chat.instanceId) });
  if (!instance) throw new Error('نسخة واتساب غير موجودة');

  const config = await getEvolutionConfig(chat.teamId);
  if (!config.apiUrl || !config.apiKey) throw new Error('لم يتم إعداد Evolution API');

  const recipient = getEvolutionRecipient(chat.remoteJid);
  if (!recipient) {
    throw new Error('معرّف جهة الاتصال غير صالح. شغّل المزامنة من الإعدادات لتصحيح المحادثات القديمة ثم حاول مجدداً');
  }

  const client = new EvolutionClient(config.apiUrl, config.apiKey);
  let evoResult: any = null;
  let status: 'sent' | 'failed' = 'sent';
  let errorMessage = '';

  try {
    evoResult = await client.sendText(instance.instanceName, recipient, normalizedText);
  } catch (error: any) {
    errorMessage = error?.message || 'خطأ غير معروف من Evolution API';
    console.error('[sendText]', {
      error: errorMessage,
      status: error?.status,
      details: error?.details,
      chatId,
      remoteJid: chat.remoteJid,
      recipient,
    });
    status = 'failed';
  }

  const messageId = evoResult?.key?.id || `local_${randomUUID()}`;
  const timestamp = new Date();

  const [newMessage] = await db.insert(messages).values({
    id: messageId,
    chatId,
    fromMe: true,
    messageType: 'text',
    text: normalizedText,
    status,
    timestamp,
  }).onConflictDoNothing().returning();

  if (status === 'sent') {
    await db.update(chats).set({
      lastMessageText: normalizedText,
      lastMessageAt: timestamp,
      lastMessageFromMe: true,
      updatedAt: timestamp,
    }).where(eq(chats.id, chatId));
  }

  if (newMessage) {
    broadcastToTeam(chat.teamId, 'new-message', {
      chatId,
      message: { ...newMessage, timestamp: timestamp.toISOString() },
    });
    if (status === 'sent') broadcastToTeam(chat.teamId, 'chat-update', { chatId });
  }

  if (status === 'failed') {
    throw new Error(`فشل إرسال الرسالة: ${errorMessage}`);
  }

  return newMessage;
}
