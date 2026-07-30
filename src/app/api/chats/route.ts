import { NextResponse } from 'next/server';
import { db } from '@/lib/db/drizzle';
import { chats, users, contacts } from '@/lib/db/schema';
import { and, desc, eq } from 'drizzle-orm';
import { getUserContext } from '@/lib/db/queries';
import { cleanDisplayName, isWhatsAppJid, jidToPhone } from '@/lib/utils';

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
      contactName: contacts.name,
    })
    .from(chats)
    .leftJoin(users, eq(chats.assignedUserId, users.id))
    .leftJoin(contacts, eq(chats.id, contacts.chatId))
    .where(and(eq(chats.teamId, ctx.teamId), eq(chats.isOpen, true)))
    .orderBy(desc(chats.lastMessageAt));

  const seen = new Set<number>();
  const result = rows
    .filter((chat) => isWhatsAppJid(chat.remoteJid) && !seen.has(chat.id))
    .map((chat) => {
      seen.add(chat.id);
      const phone = chat.phoneNumber || (!chat.isGroup ? jidToPhone(chat.remoteJid) : null);
      const realName = cleanDisplayName(chat.contactName, chat.name);
      return {
        ...chat,
        name: realName || (chat.isGroup ? 'مجموعة واتساب' : phone || 'جهة اتصال'),
        lastMessageAt: chat.lastMessageAt?.toISOString() || null,
        phoneNumber: ctx.canSeePhone ? phone : null,
      };
    });

  return NextResponse.json(result);
}
