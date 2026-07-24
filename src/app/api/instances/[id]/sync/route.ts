import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/drizzle';
import {
  instances,
  chats,
  messages,
  contacts,
  pendingMessages,
  chatTags,
} from '@/lib/db/schema';
import { and, desc, eq } from 'drizzle-orm';
import { getUserContext } from '@/lib/db/queries';
import { getEvolutionConfig, EvolutionClient } from '@/lib/whatsapp/evolution-client';
import {
  cleanDisplayName,
  isJidOrGroupId,
  isWhatsAppJid,
  jidToPhone,
  phoneToJid,
} from '@/lib/utils';
import {
  contactJidFromPhone,
  contactLookupKeys,
  getChatRemoteJid,
  getContactRemoteJid,
  getEvolutionName,
  getEvolutionPhone,
  getMessageRemoteJid,
  isGroupJid,
  isSameConversation,
  messageTimestamp,
  normalizeMessageContent,
  recordsFromEvolution,
  usableContact,
} from '@/lib/whatsapp/normalizers';

const CONTACT_PAGE_SIZE = 500;
const MESSAGE_PAGE_SIZE = 100;
const MAX_MESSAGE_PAGES = 10;
const RECENT_WINDOW_MS = 24 * 60 * 60 * 1000;

function internalChatIds(evoChat: any): string[] {
  return [evoChat?.id, evoChat?.chatId, evoChat?._id]
    .filter((value): value is string => typeof value === 'string' && !!value && !isWhatsAppJid(value));
}

function contactMapKeys(contact: any): string[] {
  const phone = getEvolutionPhone(contact, getContactRemoteJid(contact));
  return Array.from(new Set([
    ...contactLookupKeys(contact),
    ...(phone ? [phone, phoneToJid(phone)] : []),
  ].map((value) => value.toLowerCase())));
}

function chatLookupKeys(evoChat: any, remoteJid: string): string[] {
  const phone = getEvolutionPhone(evoChat, remoteJid) || jidToPhone(remoteJid);
  return Array.from(new Set([
    remoteJid,
    evoChat?.remoteJidAlt,
    evoChat?.key?.remoteJidAlt,
    ...(phone ? [phone, phoneToJid(phone)] : []),
  ].filter((value): value is string => typeof value === 'string' && !!value)
    .map((value) => value.toLowerCase())));
}

function previewForMessage(message: ReturnType<typeof normalizeMessageContent>): string {
  if (message.text) return message.text;
  switch (message.messageType) {
    case 'image': return 'صورة';
    case 'video': return 'فيديو';
    case 'audio': return 'رسالة صوتية';
    case 'document': return message.mediaCaption ? `ملف: ${message.mediaCaption}` : 'ملف';
    case 'sticker': return 'ملصق';
    case 'location': return 'موقع';
    case 'contact': return 'جهة اتصال';
    case 'poll': return 'استطلاع';
    case 'reaction': return 'تفاعل';
    default: return 'رسالة';
  }
}

async function fetchContacts(client: EvolutionClient, instanceName: string): Promise<any[]> {
  const all: any[] = [];
  try {
    for (let page = 0; page < 20; page++) {
      const result = await client.findContacts(instanceName, {
        take: CONTACT_PAGE_SIZE,
        skip: page * CONTACT_PAGE_SIZE,
        orderBy: { updatedAt: 'desc' },
      });
      const rows = recordsFromEvolution(result);
      all.push(...rows);
      if (rows.length < CONTACT_PAGE_SIZE) break;
    }
  } catch (error) {
    console.warn('[Sync Contacts Pagination]', error);
    if (!all.length) {
      const fallback = await client.findContacts(instanceName, {});
      all.push(...recordsFromEvolution(fallback));
    }
  }
  return all.filter(usableContact);
}

async function mergeLegacyChat(legacy: typeof chats.$inferSelect, target: typeof chats.$inferSelect) {
  if (legacy.id === target.id) return target;

  await db.update(messages).set({ chatId: target.id }).where(eq(messages.chatId, legacy.id));
  await db.update(pendingMessages).set({ chatId: target.id }).where(eq(pendingMessages.chatId, legacy.id));
  await db.update(contacts).set({ chatId: target.id }).where(eq(contacts.chatId, legacy.id));

  const legacyTags = await db.select().from(chatTags).where(eq(chatTags.chatId, legacy.id));
  for (const tag of legacyTags) {
    await db.insert(chatTags).values({ chatId: target.id, tagId: tag.tagId }).onConflictDoNothing();
  }
  await db.delete(chatTags).where(eq(chatTags.chatId, legacy.id));

  await db.update(chats).set({
    assignedUserId: target.assignedUserId || legacy.assignedUserId,
    requireApproval: target.requireApproval || legacy.requireApproval,
    aiEnabled: target.aiEnabled || legacy.aiEnabled,
    funnelStage: target.funnelStage || legacy.funnelStage,
    notes: target.notes || legacy.notes,
    updatedAt: new Date(),
  }).where(eq(chats.id, target.id));

  await db.delete(chats).where(eq(chats.id, legacy.id));
  return (await db.query.chats.findFirst({ where: eq(chats.id, target.id) })) || target;
}

async function resolveChat(
  instance: typeof instances.$inferSelect,
  evoChat: any,
  remoteJid: string,
  displayName: string | null,
  phone: string,
) {
  let validChat = await db.query.chats.findFirst({
    where: and(eq(chats.remoteJid, remoteJid), eq(chats.instanceId, instance.id)),
  });

  let legacyChat: typeof chats.$inferSelect | undefined;
  for (const internalId of internalChatIds(evoChat)) {
    legacyChat = await db.query.chats.findFirst({
      where: and(eq(chats.remoteJid, internalId), eq(chats.instanceId, instance.id)),
    });
    if (legacyChat) break;
  }

  if (!legacyChat && phone) {
    legacyChat = await db.query.chats.findFirst({
      where: and(eq(chats.phoneNumber, phone), eq(chats.instanceId, instance.id)),
    });
    if (legacyChat?.remoteJid === remoteJid) legacyChat = undefined;
  }

  if (validChat && legacyChat) validChat = await mergeLegacyChat(legacyChat, validChat);

  const isGroup = isGroupJid(remoteJid);
  if (!validChat && legacyChat) {
    const [repaired] = await db.update(chats).set({
      remoteJid,
      name: displayName || (isGroup ? 'مجموعة واتساب' : phone || null),
      phoneNumber: isGroup ? null : phone || null,
      isGroup,
      isOpen: true,
      updatedAt: new Date(),
    }).where(eq(chats.id, legacyChat.id)).returning();
    return { chat: repaired, repaired: true };
  }

  if (!validChat) {
    const [created] = await db.insert(chats).values({
      teamId: instance.teamId,
      instanceId: instance.id,
      remoteJid,
      name: displayName || (isGroup ? 'مجموعة واتساب' : phone || null),
      phoneNumber: isGroup ? null : phone || null,
      isGroup,
      isOpen: true,
      unreadCount: Number(evoChat?.unreadCount || 0),
    }).returning();
    return { chat: created, repaired: false };
  }

  const currentNameIsBad = !validChat.name || isJidOrGroupId(validChat.name);
  const [updated] = await db.update(chats).set({
    name: displayName && (currentNameIsBad || displayName !== validChat.name)
      ? displayName
      : validChat.name || (isGroup ? 'مجموعة واتساب' : phone || null),
    phoneNumber: isGroup ? null : phone || validChat.phoneNumber,
    isGroup,
    isOpen: true,
    unreadCount: Math.max(validChat.unreadCount || 0, Number(evoChat?.unreadCount || 0)),
    updatedAt: new Date(),
  }).where(eq(chats.id, validChat.id)).returning();

  return { chat: updated, repaired: false };
}

async function upsertContact(
  teamId: number,
  chatId: number | null,
  phone: string,
  name: string | null,
) {
  if (!phone) return false;
  const existing = await db.query.contacts.findFirst({
    where: and(eq(contacts.teamId, teamId), eq(contacts.phone, phone)),
  });

  if (!existing) {
    await db.insert(contacts).values({ teamId, chatId, phone, name });
    return true;
  }

  const currentNameIsBad = !existing.name || isJidOrGroupId(existing.name);
  await db.update(contacts).set({
    chatId: chatId || existing.chatId,
    name: name && (currentNameIsBad || name !== existing.name) ? name : existing.name,
  }).where(eq(contacts.id, existing.id));
  return false;
}

async function syncRecentMessages(
  client: EvolutionClient,
  instanceName: string,
  remoteJid: string,
  chat: typeof chats.$inferSelect,
  cutoff: Date,
) {
  let inserted = 0;

  for (let page = 0; page < MAX_MESSAGE_PAGES; page++) {
    const result = await client.findMessages(instanceName, {
      where: { key: { remoteJid } },
      take: MESSAGE_PAGE_SIZE,
      skip: page * MESSAGE_PAGE_SIZE,
      orderBy: { messageTimestamp: 'desc' },
    });

    const rawRows = recordsFromEvolution(result);
    const rows = rawRows
      .filter((row) => isSameConversation(row, remoteJid))
      .sort((a, b) => messageTimestamp(b).getTime() - messageTimestamp(a).getTime());

    if (!rows.length) break;
    let reachedCutoff = false;

    for (const message of rows) {
      const timestamp = messageTimestamp(message);
      if (timestamp < cutoff) {
        reachedCutoff = true;
        continue;
      }

      const messageId = message?.key?.id || message?.id;
      if (!messageId) continue;
      const content = normalizeMessageContent(message);
      if (content.messageType === 'protocol') continue;

      const senderName = cleanDisplayName(message?.pushName, message?.senderName);
      const insertedRows = await db.insert(messages).values({
        id: String(messageId),
        chatId: chat.id,
        fromMe: !!(message?.key?.fromMe ?? message?.fromMe),
        senderName,
        messageType: content.messageType,
        text: content.text,
        mediaUrl: content.mediaUrl,
        mediaMimetype: content.mediaMimetype,
        mediaCaption: content.mediaCaption,
        quotedMessageId: content.quotedMessageId,
        quotedText: content.quotedText,
        status: message?.status || (message?.key?.fromMe ? 'sent' : 'delivered'),
        timestamp,
      }).onConflictDoNothing().returning({ id: messages.id });
      inserted += insertedRows.length;
    }

    if (reachedCutoff || rawRows.length < MESSAGE_PAGE_SIZE) break;
  }

  const latest = await db.query.messages.findFirst({
    where: eq(messages.chatId, chat.id),
    orderBy: [desc(messages.timestamp)],
  });
  if (latest) {
    const content = {
      text: latest.text,
      messageType: latest.messageType,
      mediaCaption: latest.mediaCaption,
    } as ReturnType<typeof normalizeMessageContent>;
    await db.update(chats).set({
      lastMessageText: previewForMessage(content),
      lastMessageAt: latest.timestamp,
      lastMessageFromMe: latest.fromMe,
      updatedAt: new Date(),
    }).where(eq(chats.id, chat.id));
  }

  return inserted;
}

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await getUserContext();
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const instanceId = Number.parseInt(id, 10);
  const instance = await db.query.instances.findFirst({
    where: and(eq(instances.id, instanceId), eq(instances.teamId, ctx.teamId)),
  });
  if (!instance) return NextResponse.json({ error: 'نسخة واتساب غير موجودة' }, { status: 404 });

  const config = await getEvolutionConfig(ctx.teamId);
  if (!config.apiUrl || !config.apiKey) {
    return NextResponse.json({ error: 'لم يتم إعداد Evolution API' }, { status: 400 });
  }
  const client = new EvolutionClient(config.apiUrl, config.apiKey);

  let syncedChats = 0;
  let repairedChats = 0;
  let syncedContacts = 0;
  let syncedMessages = 0;
  let hiddenInvalidChats = 0;
  let errors = 0;

  try {
    const [contactsResult, chatsResult] = await Promise.all([
      fetchContacts(client, instance.instanceName),
      client.findChats(instance.instanceName, {}),
    ]);
    const evolutionChats = recordsFromEvolution(chatsResult);

    const contactsByKey = new Map<string, any>();
    for (const contact of contactsResult) {
      for (const key of contactMapKeys(contact)) contactsByKey.set(key, contact);

      const remoteJid = getContactRemoteJid(contact) || contactJidFromPhone(contact);
      const phone = getEvolutionPhone(contact, remoteJid);
      const name = getEvolutionName(contact);
      if (phone) {
        if (await upsertContact(ctx.teamId, null, phone, name)) syncedContacts++;
      }
    }

    const cutoff = new Date(Date.now() - RECENT_WINDOW_MS);

    for (const evoChat of evolutionChats) {
      try {
        const remoteJid = getChatRemoteJid(evoChat);
        if (!remoteJid || remoteJid === 'status@broadcast') continue;

        const contact = chatLookupKeys(evoChat, remoteJid)
          .map((key) => contactsByKey.get(key))
          .find(Boolean);
        const phone = getEvolutionPhone(contact || evoChat, remoteJid);
        const name = getEvolutionName(contact, evoChat) || getEvolutionName(evoChat, contact);
        const { chat, repaired } = await resolveChat(instance, evoChat, remoteJid, name, phone);
        if (repaired) repairedChats++;

        if (!isGroupJid(remoteJid) && phone) {
          if (await upsertContact(ctx.teamId, chat.id, phone, name)) syncedContacts++;
        }

        const latestRaw = evoChat?.lastMessage;
        const latestTimestamp = latestRaw ? messageTimestamp(latestRaw) : null;
        const recentlyActive = !latestTimestamp || latestTimestamp >= cutoff;
        if (recentlyActive) {
          try {
            syncedMessages += await syncRecentMessages(
              client,
              instance.instanceName,
              remoteJid,
              chat,
              cutoff,
            );
          } catch (messageError) {
            console.error('[Sync Recent Messages]', remoteJid, messageError);
            errors++;
          }
        } else if (latestRaw?.message || latestRaw?.content) {
          const lastContent = normalizeMessageContent(latestRaw);
          await db.update(chats).set({
            lastMessageText: previewForMessage(lastContent),
            lastMessageAt: latestTimestamp,
            lastMessageFromMe: !!latestRaw?.key?.fromMe,
            updatedAt: new Date(),
          }).where(eq(chats.id, chat.id));
        }

        syncedChats++;
      } catch (chatError) {
        console.error('[Sync Chat]', chatError);
        errors++;
      }
    }

    // Old versions of this CRM saved Evolution's database CUID as remoteJid.
    // Keep such rows for safety, but close them so they disappear from the inbox.
    const localChats = await db.select().from(chats).where(eq(chats.instanceId, instance.id));
    for (const localChat of localChats) {
      if (!isWhatsAppJid(localChat.remoteJid)) {
        await db.update(chats).set({ isOpen: false, updatedAt: new Date() }).where(eq(chats.id, localChat.id));
        hiddenInvalidChats++;
      }
    }

    return NextResponse.json({
      success: true,
      syncedChats,
      repairedChats,
      syncedContacts,
      syncedMessages,
      hiddenInvalidChats,
      errors,
      recentWindowHours: 24,
    });
  } catch (error: any) {
    console.error('[Sync]', error);
    return NextResponse.json({
      error: error?.message || 'فشلت المزامنة مع Evolution API',
      details: error?.details || undefined,
    }, { status: error?.status && error.status < 600 ? error.status : 500 });
  }
}
