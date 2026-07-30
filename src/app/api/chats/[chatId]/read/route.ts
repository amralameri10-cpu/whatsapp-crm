import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/drizzle';
import { chats } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { getUserContext } from '@/lib/db/queries';

export async function POST(req: NextRequest, { params }: { params: Promise<{ chatId: string }> }) {
  const { chatId } = await params;
  const ctx = await getUserContext();
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  await db.update(chats).set({ unreadCount: 0 }).where(eq(chats.id, parseInt(chatId)));
  return NextResponse.json({ success: true });
}
