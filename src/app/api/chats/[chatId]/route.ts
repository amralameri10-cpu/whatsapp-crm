import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/drizzle';
import { chats } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { getUserContext } from '@/lib/db/queries';

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ chatId: string }> }) {
  const { chatId } = await params;
  const id = parseInt(chatId);

  const ctx = await getUserContext();
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const chat = await db.query.chats.findFirst({ where: and(eq(chats.id, id), eq(chats.teamId, ctx.teamId)) });
  if (!chat) return NextResponse.json({ error: 'Chat not found' }, { status: 404 });

  if (!ctx.isTeamAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const body = await req.json();
  const updates: Record<string, any> = { updatedAt: new Date() };

  if (typeof body.requireApproval === 'boolean') updates.requireApproval = body.requireApproval;
  if (typeof body.aiEnabled === 'boolean') updates.aiEnabled = body.aiEnabled;
  if (typeof body.assignedUserId !== 'undefined') updates.assignedUserId = body.assignedUserId;
  if (typeof body.funnelStage === 'string') updates.funnelStage = body.funnelStage;
  if (typeof body.notes === 'string') updates.notes = body.notes;

  await db.update(chats).set(updates).where(eq(chats.id, id));

  return NextResponse.json({ success: true });
}
