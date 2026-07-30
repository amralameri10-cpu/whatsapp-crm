import { db } from '@/lib/db/drizzle';
import { automations, chats, pendingMessages, messages, teamMembers, users, aiConfig } from '@/lib/db/schema';
import { eq, and, desc } from 'drizzle-orm';
import { sendTextAndPersist } from '@/lib/whatsapp/send-helpers';
import { generateAIReply, type AIMessage } from '@/lib/ai/provider';
import { broadcastToTeam } from '@/lib/sse';

type FlowNode = {
  id: string;
  type: 'trigger' | 'send_message' | 'ai_check' | 'assign_department' | 'condition' | 'alert_admin' | 'block_assign' | 'delay';
  data: Record<string, any>;
};

type FlowEdge = { source: string; target: string; condition?: string };

const MAX_STEPS = 25;

export async function runAutomationForMessage(chatId: number, incomingText: string) {
  const chat = await db.query.chats.findFirst({ where: eq(chats.id, chatId) });
  if (!chat) return;

  const activeAutomations = await db
    .select()
    .from(automations)
    .where(and(eq(automations.teamId, chat.teamId), eq(automations.isActive, true)));

  for (const automation of activeAutomations) {
    const keywords = (automation.triggerKeywords || []).map((k) => k.toLowerCase());
    const matches =
      automation.triggerType === 'any_message' ||
      keywords.some((k) => incomingText.toLowerCase().includes(k));

    if (!matches) continue;

    const flowState = { blockAssign: false, alertedAdmin: false };
    await executeFlow(automation, chat, incomingText, flowState);

    // إذا تم منع الإسناد، لا نسند لموظف
    if (flowState.blockAssign) {
      // لا نفعل شيئاً - الإسناد يبقى كما هو أو فارغ
    }
    break; // only first matching automation runs
  }
}

async function executeFlow(
  automation: typeof automations.$inferSelect,
  chat: typeof chats.$inferSelect,
  incomingText: string,
  flowState: { blockAssign: boolean; alertedAdmin: boolean },
) {
  const nodes = automation.nodes as FlowNode[];
  const edges = automation.edges as FlowEdge[];

  const triggerNode = nodes.find((n) => n.type === 'trigger');
  if (!triggerNode) return;

  let currentNodeId: string | null = triggerNode.id;
  let steps = 0;

  while (currentNodeId && steps < MAX_STEPS) {
    steps++;
    const nextEdge = edges.find((e) => e.source === currentNodeId);
    if (!nextEdge) break;

    const nextNode = nodes.find((n) => n.id === nextEdge.target);
    if (!nextNode) break;

    await processNode(nextNode, chat, incomingText, flowState);
    currentNodeId = nextNode.id;
  }
}

async function processNode(
  node: FlowNode,
  chat: typeof chats.$inferSelect,
  incomingText: string,
  flowState: { blockAssign: boolean; alertedAdmin: boolean },
) {
  switch (node.type) {
    case 'send_message': {
      const text = String(node.data.text || '');
      if (!text) return;
      await deliverViaApprovalOrDirect(chat, text, 'agent');
      return;
    }

    case 'ai_check': {
      const config = await db.query.aiConfig.findFirst({ where: eq(aiConfig.teamId, chat.teamId) });
      if (!config) return;

      const recent = await db
        .select()
        .from(messages)
        .where(eq(messages.chatId, chat.id))
        .orderBy(desc(messages.timestamp))
        .limit(15);

      const history: AIMessage[] = recent
        .reverse()
        .filter((m) => m.text)
        .map((m) => ({ role: m.fromMe ? 'assistant' : 'user', content: m.text! }));

      if (history.length === 0) return;

      const customPrompt = node.data.prompt as string | undefined;

      try {
        const reply = await generateAIReply({
          provider: config.provider as any,
          model: config.model || undefined,
          systemPrompt: customPrompt || config.systemPrompt || undefined,
          history,
          temperature: config.temperature,
          maxTokens: config.maxTokens,
        });

        if (reply?.trim()) {
          await deliverViaApprovalOrDirect(chat, reply.trim(), 'ai');
        }
      } catch (e) {
        console.error('[Automation AI Check]', e);
      }
      return;
    }

    case 'assign_department': {
      if (flowState.blockAssign) return; // تم منع الإسناد بواسطة شرط
      const userId = node.data.userId as number | undefined;
      if (userId) {
        await db.update(chats).set({ assignedUserId: userId }).where(eq(chats.id, chat.id));
      }
      return;
    }

    case 'condition': {
      // فحص الموضوع: هل النص الوارد يحتوي على كلمات معينة
      const keywords = String(node.data.keywords || '')
        .split(',')
        .map((k) => k.trim().toLowerCase())
        .filter(Boolean);

      if (keywords.length === 0) return;

      const matchMode = node.data.matchMode || 'contains';
      const textLower = incomingText.toLowerCase();

      let matched = false;
      for (const keyword of keywords) {
        switch (matchMode) {
          case 'contains':
            if (textLower.includes(keyword)) matched = true;
            break;
          case 'equals':
            if (textLower === keyword) matched = true;
            break;
          case 'starts_with':
            if (textLower.startsWith(keyword)) matched = true;
            break;
          case 'regex':
            try {
              if (new RegExp(keyword, 'i').test(incomingText)) matched = true;
            } catch {
              // تجاهل regex غير صالح
            }
            break;
        }
        if (matched) break;
      }

      if (!matched) return;

      // تم التطابق - نفّذ الإجراء المحدد
      const action = node.data.action || 'alert_admin';

      switch (action) {
        case 'alert_admin':
        case 'send_message': {
          // إرسال رسالة داخلية في المحادثة لتنبيه الأدمن
          const alertMessage = node.data.message || `⚠️ تم اكتشاف موضوع حساس: "${incomingText.slice(0, 80)}..."`;
          await db.insert(messages).values({
            id: `internal_${chat.id}_${Date.now()}`,
            chatId: chat.id,
            fromMe: false,
            messageType: 'internal',
            text: alertMessage,
            isInternal: true,
            status: 'sent',
            timestamp: new Date(),
          });
          broadcastToTeam(chat.teamId, 'new-message', { chatId: chat.id, message: {
            id: `internal_${chat.id}_${Date.now()}`,
            chatId: chat.id,
            fromMe: false,
            messageType: 'internal',
            text: alertMessage,
            isInternal: true,
            status: 'sent',
            timestamp: new Date().toISOString(),
          }});

          flowState.alertedAdmin = true;

          // تنبيه جميع الأدمنز عبر SSE أيضاً
          const admins = await db
            .select({ id: teamMembers.id, userId: teamMembers.userId })
            .from(teamMembers)
            .where(and(eq(teamMembers.teamId, chat.teamId), eq(teamMembers.role, 'admin')));

          for (const admin of admins) {
            broadcastToTeam(chat.teamId, 'admin-alert', {
              chatId: chat.id,
              message: alertMessage,
              keyword: keywords.join(', '),
            });
          }

          // إذا كان الإجراء إرسال رسالة أيضاً، أرسلها
          if (action === 'send_message') {
            const replyText = node.data.replyText || '';
            if (replyText) {
              await deliverViaApprovalOrDirect(chat, replyText, 'agent');
            }
          }
          break;
        }

        case 'block_assign':
          flowState.blockAssign = true;
          break;
      }
      return;
    }

    case 'alert_admin': {
      const alertMessage = node.data.message || `⚠️ تنبيه: رسالة جديدة في المحادثة #${chat.id}`;
      await db.insert(messages).values({
        id: `internal_${chat.id}_${Date.now()}`,
        chatId: chat.id,
        fromMe: false,
        messageType: 'internal',
        text: alertMessage,
        isInternal: true,
        status: 'sent',
        timestamp: new Date(),
      });
      broadcastToTeam(chat.teamId, 'new-message', { chatId: chat.id, message: {
        id: `internal_${chat.id}_${Date.now()}`,
        chatId: chat.id,
        fromMe: false,
        messageType: 'internal',
        text: alertMessage,
        isInternal: true,
        status: 'sent',
        timestamp: new Date().toISOString(),
      }});
      flowState.alertedAdmin = true;
      return;
    }

    case 'block_assign': {
      flowState.blockAssign = true;
      return;
    }



    case 'delay': {
      const ms = Math.min(Number(node.data.ms) || 1000, 5000);
      await new Promise((r) => setTimeout(r, ms));
      return;
    }

    default:
      return;
  }
}

async function deliverViaApprovalOrDirect(chat: typeof chats.$inferSelect, text: string, source: 'agent' | 'ai') {
  const needsApproval = chat.requireApproval;

  if (needsApproval) {
    await db.insert(pendingMessages).values({ chatId: chat.id, text, source, status: 'pending' });
    broadcastToTeam(chat.teamId, 'pending-update', { chatId: chat.id });
    return;
  }

  await sendTextAndPersist(chat.id, text);
}
