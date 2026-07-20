import { broadcastToTeam } from '@/lib/sse';
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/drizzle';
import { pendingMessages, chats } from '@/lib/db/schema';
import { eq, and, inArray } from 'drizzle-orm';
import { getUserContext } from '@/lib/db/queries';
import { sendTextAndPersist } from '@/lib/whatsapp/send-helpers';


export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const pendingId = parseInt(id);

  const ctx = await getUserContext();
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!ctx.isTeamAdmin) return NextResponse.json({ error: 'فقط المسؤول يمكنه الموافقة' }, { status: 403 });

  const pending = await db.query.pendingMessages.findFirst({ where: eq(pendingMessages.id, pendingId) });
  if (!pending) return NextResponse.json({ error: 'الرسالة غير موجودة' }, { status: 404 });
  if (pending.status !== 'pending') return NextResponse.json({ error: 'تمت معالجة هذه الرسالة مسبقاً' }, { status: 400 });

  const chat = await db.query.chats.findFirst({ where: and(eq(chats.id, pending.chatId), eq(chats.teamId, ctx.teamId)) });
  if (!chat) return NextResponse.json({ error: 'المحادثة غير موجودة' }, { status: 404 });

  const { editedText } = await req.json().catch(() => ({}));
  const finalText = (editedText?.trim() || pending.text).trim();

  try {
    const message = await sendTextAndPersist(pending.chatId, finalText);

    await db
      .update(pendingMessages)
      .set({ status: 'approved', reviewedBy: ctx.user.id, reviewedAt: new Date(), text: finalText })
      .where(eq(pendingMessages.id, pendingId));

    broadcastToTeam(pending.chatId, 'pending-update', { chatId: pending.chatId });

    return NextResponse.json({ success: true, message });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'فشل الإرسال' }, { status: 500 });
  }
}
