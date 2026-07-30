import { getUserContext } from '@/lib/db/queries';
import { redirect } from 'next/navigation';
import { ChatShell } from '@/components/chat/chat-shell';

export default async function ChatPage() {
  const ctx = await getUserContext();
  if (!ctx) redirect('/login');

  return (
    <ChatShell
      currentUserId={ctx.user.id}
      canSeePhone={ctx.canSeePhone}
      canUseAI={ctx.canUseAI}
      canViewAllChats={ctx.canViewAllChats}
      isTeamAdmin={ctx.isTeamAdmin}
      individualRequireApproval={ctx.requireApproval}
    />
  );
}
