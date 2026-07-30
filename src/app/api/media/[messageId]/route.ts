import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/drizzle';
import { messageMedia, messages, chats } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { getUserContext } from '@/lib/db/queries';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ messageId: string }> },
) {
  const { messageId } = await params;
  const context = await getUserContext();
  if (!context) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const { user, isTeamAdmin } = context;

  // Query media and message separately to avoid nested relation issues
  const media = await db.query.messageMedia.findFirst({
    where: eq(messageMedia.messageId, messageId),
  });

  if (!media) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  // Get the message to find the chatId
  const message = await db.query.messages.findFirst({
    where: eq(messages.id, messageId),
  });

  if (!message) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  // Get the chat for authorization check
  const chat = await db.query.chats.findFirst({
    where: eq(chats.id, message.chatId),
  });

  if (!chat) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  // Verify the chat belongs to the user's team
  if (chat.teamId !== context.teamId) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

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
        ? `inline; filename="${encodeURIComponent(media.fileName)}"`
        : 'inline',
      'Cache-Control': 'private, max-age=3600',
    },
  });
}
