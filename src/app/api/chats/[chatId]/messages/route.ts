import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/drizzle';
import { chats, messages, instances } from '@/lib/db/schema';
import { and, count, desc, eq, lt, ne, or } from 'drizzle-orm';
import { getUserContext } from '@/lib/db/queries';
import { getEvolutionConfig, EvolutionClient } from '@/lib/whatsapp/evolution-client';
import {
  isSameConversation,
  messageTimestamp,
  normalizeMessageContent,
  recordsFromEvolution,
} from '@/lib/whatsapp/normalizers';
import { cleanDisplayName, isWhatsAppJid } from '@/lib/utils';

const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 100;

type Cursor = { timestamp: Date; id: string };

async function assertAccess(chatId: number) {
  const ctx = await getUserContext();
  if (!ctx) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };

  const chat = await db.query.chats.findFirst({
    where: and(eq(chats.id, chatId), eq(chats.teamId, ctx.teamId)),
  });
  if (!chat) return { error: NextResponse.json({ error: 'المحادثة غير موجودة' }, { status: 404 }) };

  if (!ctx.canViewAllChats && chat.assignedUserId !== ctx.user.id) {
    return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  }

  return { ctx, chat };
}

function parseCursor(req: NextRequest): Cursor | null {
  const before = req.nextUrl.searchParams.get('before');
  const beforeId = req.nextUrl.searchParams.get('beforeId');
  if (!before || !beforeId) return null;
  const timestamp = new Date(before);
  if (Number.isNaN(timestamp.getTime())) return null;
  return { timestamp, id: beforeId };
}

function cursorCondition(chatId: number, cursor: Cursor | null) {
  const chatCondition = eq(messages.chatId, chatId);
  if (!cursor) return chatCondition;
  return and(
    chatCondition,
    or(
      lt(messages.timestamp, cursor.timestamp),
      and(eq(messages.timestamp, cursor.timestamp), lt(messages.id, cursor.id)),
    ),
  );
}

async function readLocalPage(chatId: number, cursor: Cursor | null, limit: number) {
  const rows = await db
    .select()
    .from(messages)
    .where(cursorCondition(chatId, cursor))
    .orderBy(desc(messages.timestamp), desc(messages.id))
    .limit(limit + 1);

  const hasExtra = rows.length > limit;
  const page = rows.slice(0, limit).reverse();
  return { rows: page, hasExtra };
}

async function importOlderFromEvolution(
  teamId: number,
  chat: typeof chats.$inferSelect,
  pageSize: number,
  requestedSkip: number | null,
) {
  if (!isWhatsAppJid(chat.remoteJid)) return { fetched: 0, inserted: 0, exhausted: true };

  const instance = await db.query.instances.findFirst({ where: eq(instances.id, chat.instanceId) });
  if (!instance) return { fetched: 0, inserted: 0, exhausted: true };

  const config = await getEvolutionConfig(teamId);
  if (!config.apiUrl || !config.apiKey) throw new Error('لم يتم إعداد Evolution API');
  const client = new EvolutionClient(config.apiUrl, config.apiKey);

  let skip = requestedSkip;
  if (skip === null) {
    const [{ total }] = await db
      .select({ total: count(messages.id) })
      .from(messages)
      .where(and(
        eq(messages.chatId, chat.id),
        eq(messages.isInternal, false),
        ne(messages.status, 'failed'),
      ));
    skip = Number(total || 0);
  }

  let fetched = 0;
  let inserted = 0;
  let exhausted = false;

  // A page can contain records already present locally or protocol messages.
  // Advance through a few remote pages in the same request so the user does not
  // have to press "load older" repeatedly without seeing new messages.
  for (let round = 0; round < 5 && inserted < pageSize; round++) {
    const result = await client.findMessages(instance.instanceName, {
      where: { key: { remoteJid: chat.remoteJid } },
      take: pageSize,
      skip,
      orderBy: { messageTimestamp: 'desc' },
    });
    const rawRows = recordsFromEvolution(result);
    fetched += rawRows.length;
    skip += rawRows.length;

    for (const record of rawRows) {
      if (!isSameConversation(record, chat.remoteJid)) continue;
      const messageId = record?.key?.id || record?.id;
      if (!messageId) continue;

      const content = normalizeMessageContent(record);
      if (content.messageType === 'protocol') continue;
      const insertedRows = await db.insert(messages).values({
        id: String(messageId),
        chatId: chat.id,
        fromMe: !!(record?.key?.fromMe ?? record?.fromMe),
        senderName: cleanDisplayName(record?.pushName, record?.senderName),
        messageType: content.messageType,
        text: content.text,
        mediaUrl: content.mediaUrl,
        mediaMimetype: content.mediaMimetype,
        mediaCaption: content.mediaCaption,
        quotedMessageId: content.quotedMessageId,
        quotedText: content.quotedText,
        status: String(record?.status || (record?.key?.fromMe ? 'sent' : 'delivered')).toLowerCase(),
        timestamp: messageTimestamp(record),
      }).onConflictDoNothing().returning({ id: messages.id });
      inserted += insertedRows.length;
    }

    if (rawRows.length < pageSize) {
      exhausted = true;
      break;
    }
  }

  return { fetched, inserted, exhausted, nextRemoteSkip: skip };
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ chatId: string }> }) {
  const { chatId } = await params;
  const id = Number.parseInt(chatId, 10);
  if (!Number.isFinite(id)) return NextResponse.json({ error: 'معرف المحادثة غير صالح' }, { status: 400 });

  const access = await assertAccess(id);
  if (access.error) return access.error;
  const { ctx, chat } = access;

  const requestedLimit = Number.parseInt(req.nextUrl.searchParams.get('limit') || String(DEFAULT_PAGE_SIZE), 10);
  const limit = Math.min(Math.max(requestedLimit || DEFAULT_PAGE_SIZE, 10), MAX_PAGE_SIZE);
  const cursor = parseCursor(req);
  const loadOlder = req.nextUrl.searchParams.get('loadOlder') === '1';

  let local = await readLocalPage(id, cursor, limit);
  let remoteExhausted = false;
  let syncError: string | null = null;
  let imported = 0;
  const rawRemoteSkip = req.nextUrl.searchParams.get('remoteSkip');
  let remoteSkip = rawRemoteSkip !== null && /^\d+$/.test(rawRemoteSkip) ? Number(rawRemoteSkip) : null;

  // Initial opening uses the already-synchronised recent window. Evolution is
  // contacted only after the user reaches the top and asks for older history.
  if (loadOlder && !local.hasExtra && local.rows.length < limit) {
    try {
      const remote = await importOlderFromEvolution(ctx.teamId, chat, limit, remoteSkip);
      remoteExhausted = remote.exhausted;
      remoteSkip = remote.nextRemoteSkip;
      imported = remote.inserted;
      if (remote.inserted > 0) local = await readLocalPage(id, cursor, limit);
    } catch (error: any) {
      console.error('[Load Older Messages]', error);
      syncError = error?.message || 'تعذر جلب الرسائل الأقدم من واتساب';
    }
  }

  const oldest = local.rows[0];
  const hasMore = local.hasExtra || (!remoteExhausted && (loadOlder || !cursor || local.rows.length > 0));

  return NextResponse.json({
    messages: local.rows.map((message) => ({
      ...message,
      timestamp: message.timestamp.toISOString(),
    })),
    nextCursor: oldest
      ? { timestamp: oldest.timestamp.toISOString(), id: oldest.id }
      : cursor
        ? { timestamp: cursor.timestamp.toISOString(), id: cursor.id }
        : null,
    hasMore,
    imported,
    remoteSkip,
    syncError,
  });
}
