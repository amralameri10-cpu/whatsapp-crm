import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/drizzle';
import { pendingMessages, users } from '@/lib/db/schema';
import { eq, asc } from 'drizzle-orm';
import { getUserContext } from '@/lib/db/queries';

export async function GET(req: NextRequest, { params }: { params: Promise<{ chatId: string }> }) {
  const { chatId } = await params;
  const id = parseInt(chatId);

  const ctx = await getUserContext();
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const rows = await db
    .select({
      id: pendingMessages.id,
      chatId: pendingMessages.chatId,
      authorId: pendingMessages.authorId,
      authorName: users.name,
      text: pendingMessages.text,
      source: pendingMessages.source,
      status: pendingMessages.status,
      createdAt: pendingMessages.createdAt,
    })
    .from(pendingMessages)
    .leftJoin(users, eq(pendingMessages.authorId, users.id))
    .where(eq(pendingMessages.chatId, id))
    .orderBy(asc(pendingMessages.createdAt));

  return NextResponse.json(rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() })));
}
