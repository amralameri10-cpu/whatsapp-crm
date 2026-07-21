import { broadcastToTeam } from '@/lib/sse';
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/drizzle';
import { chats, pendingMessages } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { getUserContext } from '@/lib/db/queries';
import { sendTextAndPersist } from '@/lib/whatsapp/send-helpers';

export async function POST(req: NextRequest, { params }: { params: Promise<{ chatId: string }> }) {
  const { chatId } = await params;
  const id = parseInt(chatId);

  const ctx = await getUserContext();
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const chat = await db.query.chats.findFirst({ where: and(eq(chats.id, id), eq(chats.teamId, ctx.teamId)) });
  if (!chat) return NextResponse.json({ error: 'Chat not found' }, { status: 404 });

  if (!ctx.canViewAllChats && chat.assignedUserId !== ctx.user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { text } = await req.json();
  if (!text?.trim()) return NextResponse.json({ error: 'Text is required' }, { status: 400 });

  // Determine if approval is required: chat-level OR member-level setting
  // Team admins/owners bypass approval (they ARE the approver)
  const needsApproval = !ctx.isTeamAdmin && (chat.requireApproval || ctx.requireApproval);

  if (needsApproval) {
    const [pending] = await db
      .insert(pendingMessages)
      .values({
        chatId: id,
        authorId: ctx.user.id,
        text: text.trim(),
        source: 'agent',
        status: 'pending',
      })
      .returning();

    broadcastToTeam(chat.teamId, 'pending-update', { chatId: id });

    return NextResponse.json({ pending: true, pendingMessage: pending });
  }

  try {
    const message = await sendTextAndPersist(id, text.trim());
    return NextResponse.json({ pending: false, message });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'فشل الإرسال' }, { status: 500 });
  }
}
