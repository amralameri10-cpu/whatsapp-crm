import { db } from '@/lib/db/drizzle';
import { automations, chats, pendingMessages, aiConfig, messages } from '@/lib/db/schema';
import { eq, and, desc } from 'drizzle-orm';
import { sendTextAndPersist } from '@/lib/whatsapp/send-helpers';
import { generateAIReply, type AIMessage } from '@/lib/ai/provider';
import { pusherServer } from '@/lib/pusher-server';

type FlowNode = {
  id: string;
  type: 'trigger' | 'send_message' | 'ai_check' | 'assign_department' | 'condition' | 'delay' | 'tag';
  data: Record<string, any>;
};

type FlowEdge = { source: string; target: string; condition?: string };

const MAX_STEPS = 25;

export async function runAutomationForMessage(chatId: number, incomingText: string) {
  const chat = await db.query.chats.findFirst({ where: eq(chats.id, chatId) });
  if (!chat) return;

  // Don't run automation on chats with an assigned human agent unless explicitly allowed
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

    await executeFlow(automation, chat, incomingText);
    break; // only first matching automation runs
  }
}

async function executeFlow(automation: typeof automations.$inferSelect, chat: typeof chats.$inferSelect, incomingText: string) {
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

    await processNode(nextNode, chat, incomingText);
    currentNodeId = nextNode.id;
  }
}

async function processNode(node: FlowNode, chat: typeof chats.$inferSelect, incomingText: string) {
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
      // Placeholder: department/agent assignment logic — assigns to a specific user if configured
      const userId = node.data.userId as number | undefined;
      if (userId) {
        await db.update(chats).set({ assignedUserId: userId }).where(eq(chats.id, chat.id));
      }
      return;
    }

    case 'tag': {
      // Could insert into chatTags table if needed — kept minimal
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
    await pusherServer.trigger('team-channel', 'pending-update', { chatId: chat.id });
    return;
  }

  await sendTextAndPersist(chat.id, text);
}
