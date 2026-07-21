'use client';

import useSWR from 'swr';
import { useState, useEffect, useRef } from 'react';
import { fetcher, cn, formatPhoneForDisplay, formatDateSeparator, isSameDay } from '@/lib/utils';
import { ChatList } from './chat-list';
import { MessageBubble } from './message-bubble';
import { ChatInput } from './chat-input';
import { PendingApprovalCard } from './pending-approval-card';
import { Avatar, Badge, Switch } from '@/components/ui/misc';
import { Button } from '@/components/ui/button';
import { ChatListItem, MessageItem, PendingMessageItem } from '@/types';
import { ArrowRight, Bot, Lock, MoreVertical, Phone } from 'lucide-react';
import { useSSE } from '@/hooks/use-sse';
import { toast } from 'sonner';

export function ChatShell({
  currentUserId,
  canSeePhone,
  canUseAI,
  canViewAllChats,
  isTeamAdmin,
  individualRequireApproval,
}: {
  currentUserId: number;
  canSeePhone: boolean;
  canUseAI: boolean;
  canViewAllChats: boolean;
  isTeamAdmin: boolean;
  individualRequireApproval: boolean;
}) {
  const [activeChat, setActiveChat] = useState<ChatListItem | null>(null);
  const [search, setSearch] = useState('');
  const [showMobileChat, setShowMobileChat] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const { data: chats, mutate: mutateChats } = useSWR<ChatListItem[]>('/api/chats', fetcher, { refreshInterval: 15000 });
  const { data: messages, mutate: mutateMessages } = useSWR<MessageItem[]>(
    activeChat ? `/api/chats/${activeChat.id}/messages` : null,
    fetcher
  );
  const { data: pendingList, mutate: mutatePending } = useSWR<PendingMessageItem[]>(
    activeChat ? `/api/chats/${activeChat.id}/pending` : null,
    fetcher,
    { refreshInterval: 10000 }
  );

  // Realtime
  useSSE({
    'new-message': (data: { chatId: number; message: MessageItem }) => {
      if (activeChat && data.chatId === activeChat.id) {
        mutateMessages((cur = []) => [...cur, data.message], false);
      }
      mutateChats();
    },
    'chat-update': () => mutateChats(),
    'pending-update': (data: { chatId: number }) => {
      if (activeChat && data.chatId === activeChat.id) mutatePending();
    },
  });

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, pendingList]);

  function selectChat(chat: ChatListItem) {
    setActiveChat(chat);
    setShowMobileChat(true);
    if (chat.unreadCount > 0) {
      fetch(`/api/chats/${chat.id}/read`, { method: 'POST' });
      mutateChats((cur = []) => cur.map((c) => (c.id === chat.id ? { ...c, unreadCount: 0 } : c)), false);
    }
  }

  async function handleSend(text: string) {
    if (!activeChat) return;
    const res = await fetch(`/api/chats/${activeChat.id}/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    });
    const data = await res.json();
    if (!res.ok) {
      toast.error(data.error || 'فشل إرسال الرسالة');
      return;
    }
    if (data.pending) {
      toast.success('تم إرسال الرد للمراجعة');
      mutatePending();
    } else {
      mutateMessages();
    }
    mutateChats();
  }

  async function handleSendMedia(file: File) {
    if (!activeChat) return;
    const formData = new FormData();
    formData.append('file', file);
    const res = await fetch(`/api/chats/${activeChat.id}/send-media`, { method: 'POST', body: formData });
    const data = await res.json();
    if (!res.ok) {
      toast.error(data.error || 'فشل إرسال الملف');
      return;
    }
    mutateMessages();
    mutateChats();
  }

  async function handleGenerateAI() {
    if (!activeChat) return;
    const res = await fetch(`/api/chats/${activeChat.id}/ai-suggest`, { method: 'POST' });
    const data = await res.json();
    if (!res.ok) {
      toast.error(data.error || 'فشل توليد الرد');
      return;
    }
    toast.success('تم توليد الرد');
    mutatePending();
    mutateMessages();
  }

  async function handleApprove(id: number, editedText?: string) {
    const res = await fetch(`/api/pending/${id}/approve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ editedText }),
    });
    const data = await res.json();
    if (!res.ok) {
      toast.error(data.error || 'فشلت الموافقة');
      return;
    }
    toast.success('تم إرسال الرد للعميل');
    mutatePending();
    mutateMessages();
    mutateChats();
  }

  async function handleReject(id: number) {
    const res = await fetch(`/api/pending/${id}/reject`, { method: 'POST' });
    if (!res.ok) {
      toast.error('فشل الرفض');
      return;
    }
    toast.success('تم رفض الرد');
    mutatePending();
  }

  async function toggleApproval(value: boolean) {
    if (!activeChat) return;
    await fetch(`/api/chats/${activeChat.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ requireApproval: value }),
    });
    setActiveChat({ ...activeChat, requireApproval: value });
    mutateChats();
  }

  async function toggleAI(value: boolean) {
    if (!activeChat) return;
    await fetch(`/api/chats/${activeChat.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ aiEnabled: value }),
    });
    setActiveChat({ ...activeChat, aiEnabled: value });
    mutateChats();
  }

  const effectiveRequireApproval = activeChat?.requireApproval || individualRequireApproval;
  const visibleChats = (chats || []).filter((c) => canViewAllChats || c.assignedUserId === currentUserId);

  // Build merged timeline (messages + pending) sorted
  const timeline: { type: 'msg' | 'pending'; data: MessageItem | PendingMessageItem; ts: string }[] = [
    ...(messages || []).map((m) => ({ type: 'msg' as const, data: m, ts: m.timestamp })),
    ...(pendingList || [])
      .filter((p) => p.status === 'pending')
      .map((p) => ({ type: 'pending' as const, data: p, ts: p.createdAt })),
  ].sort((a, b) => new Date(a.ts).getTime() - new Date(b.ts).getTime());

  return (
    <div className="flex h-full">
      {/* Chat list */}
      <div className={cn('w-full md:w-80 lg:w-96 shrink-0 border-l border-zinc-200 dark:border-zinc-800', showMobileChat && 'hidden md:block')}>
        <ChatList
          chats={visibleChats}
          activeId={activeChat?.id || null}
          canSeePhone={canSeePhone}
          onSelect={selectChat}
          search={search}
          onSearchChange={setSearch}
        />
      </div>

      {/* Chat window */}
      <div className={cn('flex-1 flex flex-col bg-zinc-50 dark:bg-zinc-900', !showMobileChat && 'hidden md:flex')}>
        {!activeChat ? (
          <div className="flex-1 flex items-center justify-center text-zinc-400">
            <p>اختر محادثة لعرضها</p>
          </div>
        ) : (
          <>
            <header className="h-16 flex items-center gap-3 px-4 border-b border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 shrink-0">
              <button className="md:hidden" onClick={() => setShowMobileChat(false)}>
                <ArrowRight className="h-5 w-5" />
              </button>
              <Avatar name={activeChat.name} size={38} />
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm text-zinc-900 dark:text-zinc-50 truncate">
                  {activeChat.name || formatPhoneForDisplay(activeChat.phoneNumber, canSeePhone)}
                </p>
                {canSeePhone && activeChat.phoneNumber && (
                  <p className="text-xs text-zinc-500 flex items-center gap-1" dir="ltr">
                    <Phone className="h-3 w-3" /> {activeChat.phoneNumber}
                  </p>
                )}
              </div>

              {isTeamAdmin && (
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-1.5">
                    <Lock className="h-3.5 w-3.5 text-zinc-400" />
                    <span className="text-xs text-zinc-500 hidden sm:inline">موافقة</span>
                    <Switch checked={activeChat.requireApproval} onCheckedChange={toggleApproval} />
                  </div>
                  {canUseAI && (
                    <div className="flex items-center gap-1.5">
                      <Bot className="h-3.5 w-3.5 text-violet-500" />
                      <span className="text-xs text-zinc-500 hidden sm:inline">AI تلقائي</span>
                      <Switch checked={activeChat.aiEnabled} onCheckedChange={toggleAI} />
                    </div>
                  )}
                </div>
              )}
            </header>

            <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-4">
              {timeline.map((item, idx) => {
                const prevItem = timeline[idx - 1];
                const showDateSeparator = !prevItem || !isSameDay(item.ts, prevItem.ts);
                return (
                  <div key={item.type + ('id' in item.data ? item.data.id : idx)}>
                    {showDateSeparator && (
                      <div className="flex justify-center my-3">
                        <span className="text-[11px] bg-white dark:bg-zinc-800 text-zinc-500 px-2.5 py-1 rounded-full shadow-sm">
                          {formatDateSeparator(item.ts)}
                        </span>
                      </div>
                    )}
                    {item.type === 'msg' ? (
                      <MessageBubble message={item.data as MessageItem} />
                    ) : (
                      <PendingApprovalCard
                        pending={item.data as PendingMessageItem}
                        canApprove={isTeamAdmin}
                        onApprove={handleApprove}
                        onReject={handleReject}
                      />
                    )}
                  </div>
                );
              })}
            </div>

            <ChatInput
              onSend={handleSend}
              onSendMedia={handleSendMedia}
              onGenerateAI={handleGenerateAI}
              canUseAI={canUseAI}
              requireApproval={effectiveRequireApproval}
            />
          </>
        )}
      </div>
    </div>
  );
}
