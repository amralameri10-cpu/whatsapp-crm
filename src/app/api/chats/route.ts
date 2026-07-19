import { NextResponse } from 'next/server';
import { db } from '@/lib/db/drizzle';
import { chats, users } from '@/lib/db/schema';
import { eq, desc } from 'drizzle-orm';
import { getUserContext } from '@/lib/db/queries';

export async function GET() {
  const ctx = await getUserContext();
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const rows = await db
    .select({
      id: chats.id,
      remoteJid: chats.remoteJid,
      name: chats.name,
      phoneNumber: chats.phoneNumber,
      isGroup: chats.isGroup,
      assignedUserId: chats.assignedUserId,
      assignedUserName: users.name,
      lastMessageText: chats.lastMessageText,
      lastMessageAt: chats.lastMessageAt,
      lastMessageFromMe: chats.lastMessageFromMe,
      unreadCount: chats.unreadCount,
      isOpen: chats.isOpen,
      requireApproval: chats.requireApproval,
      aiEnabled: chats.aiEnabled,
      instanceId: chats.instanceId,
    })
    .from(chats)
    .leftJoin(users, eq(chats.assignedUserId, users.id))
    .where(eq(chats.teamId, ctx.teamId))
    .orderBy(desc(chats.lastMessageAt));

  const result = rows.map((c) => ({
    ...c,
    lastMessageAt: c.lastMessageAt?.toISOString() || null,
    phoneNumber: ctx.canSeePhone ? c.phoneNumber : null,
  }));

  return NextResponse.json(result);
}
