import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/drizzle';
import { chats, messages, pendingMessages, aiConfig } from '@/lib/db/schema';
import { eq, and, desc } from 'drizzle-orm';
import { getUserContext } from '@/lib/db/queries';
import { generateAIReply, type AIMessage } from '@/lib/ai/provider';
import { sendTextAndPersist } from '@/lib/whatsapp/send-helpers';
import { pusherServer } from '@/lib/pusher-server';

export async function POST(req: NextRequest, { params }: { params: Promise<{ chatId: string }> }) {
  const { chatId } = await params;
  const id = parseInt(chatId);

  const ctx = await getUserContext();
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!ctx.canUseAI) return NextResponse.json({ error: 'لا تملك صلاحية استخدام الذكاء الاصطناعي' }, { status: 403 });

  const chat = await db.query.chats.findFirst({ where: and(eq(chats.id, id), eq(chats.teamId, ctx.teamId)) });
  if (!chat) return NextResponse.json({ error: 'Chat not found' }, { status: 404 });

  const config = await db.query.aiConfig.findFirst({ where: eq(aiConfig.teamId, ctx.teamId) });
  if (!config) return NextResponse.json({ error: 'لم يتم إعداد الذكاء الاصطناعي بعد. راجع الإعدادات.' }, { status: 400 });

  const recentMessages = await db
    .select()
    .from(messages)
    .where(eq(messages.chatId, id))
    .orderBy(desc(messages.timestamp))
    .limit(20);

  type MsgRow = typeof messages.$inferSelect;
  const history: AIMessage[] = recentMessages
    .reverse()
    .filter((m: MsgRow) => !!m.text)
    .map((m: MsgRow): AIMessage => ({ role: m.fromMe ? 'assistant' : 'user', content: m.text! }));

  if (history.length === 0 || history[history.length - 1].role !== 'user') {
    return NextResponse.json({ error: 'لا توجد رسالة عميل حديثة للرد عليها' }, { status: 400 });
  }

  let replyText: string;
  try {
    replyText = await generateAIReply({
      provider: config.provider as any,
      model: config.model || undefined,
      systemPrompt: config.systemPrompt || undefined,
      history,
      temperature: config.temperature,
      maxTokens: config.maxTokens,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'فشل توليد الرد' }, { status: 500 });
  }

  if (!replyText?.trim()) {
    return NextResponse.json({ error: 'لم يتم توليد رد' }, { status: 500 });
  }

  // AI replies ALWAYS require approval unless the chat explicitly turned off approval AND ai is set to auto
  const needsApproval = chat.requireApproval || ctx.requireApproval || !chat.aiEnabled;

  if (needsApproval) {
    const [pending] = await db
      .insert(pendingMessages)
      .values({ chatId: id, authorId: ctx.user.id, text: replyText.trim(), source: 'ai', status: 'pending' })
      .returning();

    await pusherServer.trigger('team-channel', 'pending-update', { chatId: id });
    return NextResponse.json({ pending: true, pendingMessage: pending });
  }

  const message = await sendTextAndPersist(id, replyText.trim());
  return NextResponse.json({ pending: false, message });
}
