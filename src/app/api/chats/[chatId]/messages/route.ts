import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/drizzle';
import { chats, messages } from '@/lib/db/schema';
import { eq, asc, and } from 'drizzle-orm';
import { getUserContext } from '@/lib/db/queries';

async function assertAccess(chatId: number) {
  const ctx = await getUserContext();
  if (!ctx) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };

  const chat = await db.query.chats.findFirst({ where: and(eq(chats.id, chatId), eq(chats.teamId, ctx.teamId)) });
  if (!chat) return { error: NextResponse.json({ error: 'Chat not found' }, { status: 404 }) };

  if (!ctx.canViewAllChats && chat.assignedUserId !== ctx.user.id) {
    return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  }

  return { ctx, chat };
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ chatId: string }> }) {
  const { chatId } = await params;
  const id = parseInt(chatId);
  const { error } = await assertAccess(id);
  if (error) return error;

  const rows = await db
    .select()
    .from(messages)
    .where(eq(messages.chatId, id))
    .orderBy(asc(messages.timestamp))
    .limit(200);

  return NextResponse.json(rows.map((m: typeof messages.$inferSelect) => ({ ...m, timestamp: m.timestamp.toISOString() })));
}
