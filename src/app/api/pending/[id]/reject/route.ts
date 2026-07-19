import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/drizzle';
import { pendingMessages, chats } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { getUserContext } from '@/lib/db/queries';
import { pusherServer } from '@/lib/pusher-server';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const pendingId = parseInt(id);

  const ctx = await getUserContext();
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!ctx.isTeamAdmin) return NextResponse.json({ error: 'فقط المسؤول يمكنه الرفض' }, { status: 403 });

  const pending = await db.query.pendingMessages.findFirst({ where: eq(pendingMessages.id, pendingId) });
  if (!pending) return NextResponse.json({ error: 'الرسالة غير موجودة' }, { status: 404 });
  if (pending.status !== 'pending') return NextResponse.json({ error: 'تمت معالجة هذه الرسالة مسبقاً' }, { status: 400 });

  const chat = await db.query.chats.findFirst({ where: and(eq(chats.id, pending.chatId), eq(chats.teamId, ctx.teamId)) });
  if (!chat) return NextResponse.json({ error: 'المحادثة غير موجودة' }, { status: 404 });

  const body = await req.json().catch(() => ({}));

  await db
    .update(pendingMessages)
    .set({ status: 'rejected', reviewedBy: ctx.user.id, reviewedAt: new Date(), rejectionReason: body.reason || null })
    .where(eq(pendingMessages.id, pendingId));

  await pusherServer.trigger('team-channel', 'pending-update', { chatId: pending.chatId });

  return NextResponse.json({ success: true });
}
