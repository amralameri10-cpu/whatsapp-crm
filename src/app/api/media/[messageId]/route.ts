import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/drizzle';
import { messageMedia, messages, chats, teamMembers, users } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { getUserContext } from '@/lib/db/queries';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ messageId: string }> },
) {
  const { messageId } = await params;
  const context = await getUserContext();
  if (!context) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const { user, isTeamAdmin, teamId } = context;

  const media = await db.query.messageMedia.findFirst({
    where: eq(messageMedia.messageId, messageId),
    with: { message: { with: { chat: true } } },
  });

  if (!media) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  const chat = media.message?.chat;
  if (!chat) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  if (!isTeamAdmin) {
    // الموظف لا يرى إلا المحادثات المسندة إليه
    if (chat.assignedUserId !== user.id) {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 });
    }
  }

  return new NextResponse(media.data, {
    headers: {
      'Content-Type': media.mimetype || 'application/octet-stream',
      'Content-Disposition': media.fileName
        ? `attachment; filename="${encodeURIComponent(media.fileName)}"`
        : 'inline',
      'Cache-Control': 'public, max-age=31536000',
    },
  });
}
