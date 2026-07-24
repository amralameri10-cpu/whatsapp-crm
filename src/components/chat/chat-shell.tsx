'use client';

import useSWR from 'swr';
import { useEffect, useRef, useState } from 'react';
import { fetcher, cn, formatPhoneForDisplay, formatDateSeparator, isSameDay } from '@/lib/utils';
import { ChatList } from './chat-list';
import { MessageBubble } from './message-bubble';
import { ChatInput } from './chat-input';
import { PendingApprovalCard } from './pending-approval-card';
import { Avatar, Switch } from '@/components/ui/misc';
import { ChatListItem, MessageItem, PendingMessageItem } from '@/types';
import { ArrowRight, Bot, Loader2, Lock, Phone } from 'lucide-react';
import { useSSE } from '@/hooks/use-sse';
import { toast } from 'sonner';

type MessageCursor = { timestamp: string; id: string };
type MessagesPage = {
  messages: MessageItem[];
  nextCursor: MessageCursor | null;
  hasMore: boolean;
  imported?: number;
  remoteSkip?: number | null;
  syncError?: string | null;
};

function mergeMessages(...lists: MessageItem[][]): MessageItem[] {
  const byId = new Map<string, MessageItem>();
  for (const list of lists) {
    for (const message of list) byId.set(message.id, { ...byId.get(message.id), ...message });
  }
  return Array.from(byId.values()).sort((a, b) => {
    const byTime = new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime();
    return byTime || a.id.localeCompare(b.id);
  });
}

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
  const [loadedMessages, setLoadedMessages] = useState<MessageItem[]>([]);
  const [nextCursor, setNextCursor] = useState<MessageCursor | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [remoteSkip, setRemoteSkip] = useState<number | null>(null);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const initializedChatRef = useRef<number | null>(null);
  const scrollToBottomRef = useRef(false);

  const { data: chats, mutate: mutateChats } = useSWR<ChatListItem[]>('/api/chats', fetcher, { refreshInterval: 15000 });
  const { data: initialPage, mutate: mutateMessagesPage, isLoading: loadingInitial } = useSWR<MessagesPage>(
    activeChat ? `/api/chats/${activeChat.id}/messages?limit=50` : null,
    fetcher,
  );
  const { data: pendingList, mutate: mutatePending } = useSWR<PendingMessageItem[]>(
    activeChat ? `/api/chats/${activeChat.id}/pending` : null,
    fetcher,
    { refreshInterval: 10000 },
  );

  useEffect(() => {
    initializedChatRef.current = null;
    setLoadedMessages([]);
    setNextCursor(null);
    setHasMore(true);
    setRemoteSkip(null);
    setLoadingOlder(false);
    scrollToBottomRef.current = true;
  }, [activeChat?.id]);

  useEffect(() => {
    if (!activeChat || !initialPage) return;
    const isInitialForChat = initializedChatRef.current !== activeChat.id;
    setLoadedMessages((current) => mergeMessages(isInitialForChat ? [] : current, initialPage.messages));
    if (isInitialForChat) {
      initializedChatRef.current = activeChat.id;
      setNextCursor(initialPage.nextCursor);
      setHasMore(initialPage.hasMore);
      setRemoteSkip(initialPage.remoteSkip ?? null);
      scrollToBottomRef.current = true;
    }
    if (initialPage.syncError) toast.warning(initialPage.syncError);
  }, [activeChat, initialPage]);

  useEffect(() => {
    if (!scrollToBottomRef.current || !scrollRef.current || loadedMessages.length === 0) return;
    requestAnimationFrame(() => {
      if (!scrollRef.current) return;
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
      scrollToBottomRef.current = false;
    });
  }, [loadedMessages.length, activeChat?.id]);

  // Realtime messages are merged by id so webhook retries and explicit refreshes
  // never duplicate a bubble.
  useSSE({
    'new-message': (data: { chatId: number; message: MessageItem }) => {
      if (activeChat && data.chatId === activeChat.id) {
        const el = scrollRef.current;
        const wasNearBottom = !!el && el.scrollHeight - el.scrollTop - el.clientHeight < 160;
        if (wasNearBottom) scrollToBottomRef.current = true;
        setLoadedMessages((current) => mergeMessages(current, [data.message]));
      }
      mutateChats();
    },
    'chat-update': () => mutateChats(),
    'pending-update': (data: { chatId: number }) => {
      if (activeChat && data.chatId === activeChat.id) mutatePending();
    },
  });

  function selectChat(chat: ChatListItem) {
    setActiveChat(chat);
    setShowMobileChat(true);
    if (chat.unreadCount > 0) {
      fetch(`/api/chats/${chat.id}/read`, { method: 'POST' });
      mutateChats((current = []) => current.map((item) => (item.id === chat.id ? { ...item, unreadCount: 0 } : item)), false);
    }
  }

  async function loadOlderMessages() {
    if (!activeChat || loadingOlder || !hasMore || (!initialPage && loadedMessages.length === 0)) return;
    const container = scrollRef.current;
    const previousHeight = container?.scrollHeight || 0;
    const previousTop = container?.scrollTop || 0;
    setLoadingOlder(true);

    try {
      const query = new URLSearchParams({ limit: '50', loadOlder: '1' });
      if (nextCursor) {
        query.set('before', nextCursor.timestamp);
        query.set('beforeId', nextCursor.id);
      }
      if (remoteSkip !== null) query.set('remoteSkip', String(remoteSkip));
      const response = await fetch(`/api/chats/${activeChat.id}/messages?${query.toString()}`);
      const page: MessagesPage & { error?: string } = await response.json();
      if (!response.ok) throw new Error(page.error || 'تعذر تحميل الرسائل الأقدم');

      setLoadedMessages((current) => mergeMessages(page.messages, current));
      setNextCursor(page.nextCursor);
      setHasMore(page.hasMore);
      setRemoteSkip(page.remoteSkip ?? remoteSkip);
      if (page.syncError) toast.warning(page.syncError);

      requestAnimationFrame(() => {
        if (!container) return;
        const addedHeight = container.scrollHeight - previousHeight;
        container.scrollTop = previousTop + addedHeight;
      });
    } catch (error: any) {
      toast.error(error?.message || 'تعذر تحميل الرسائل الأقدم');
    } finally {
      setLoadingOlder(false);
    }
  }

  function handleMessagesScroll() {
    if (scrollRef.current && scrollRef.current.scrollTop <= 90) loadOlderMessages();
  }

  async function handleSend(text: string) {
    if (!activeChat) return;
    const response = await fetch(`/api/chats/${activeChat.id}/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    });
    const data = await response.json();
    if (!response.ok) {
      toast.error(data.error || 'فشل إرسال الرسالة');
      mutateMessagesPage();
      return;
    }
    if (data.pending) {
      toast.success('تم إرسال الرد للمراجعة');
      mutatePending();
    } else {
      if (data.message) setLoadedMessages((current) => mergeMessages(current, [data.message]));
      scrollToBottomRef.current = true;
      mutateMessagesPage();
    }
    mutateChats();
  }

  async function handleSendMedia(file: File) {
    if (!activeChat) return;
    const formData = new FormData();
    formData.append('file', file);
    const response = await fetch(`/api/chats/${activeChat.id}/send-media`, { method: 'POST', body: formData });
    const data = await response.json();
    if (!response.ok) {
      toast.error(data.error || 'فشل إرسال الملف');
      mutateMessagesPage();
      return;
    }
    if (data.message) setLoadedMessages((current) => mergeMessages(current, [data.message]));
    scrollToBottomRef.current = true;
    mutateMessagesPage();
    mutateChats();
  }

  async function handleGenerateAI() {
    if (!activeChat) return;
    const response = await fetch(`/api/chats/${activeChat.id}/ai-suggest`, { method: 'POST' });
    const data = await response.json();
    if (!response.ok) {
      toast.error(data.error || 'فشل توليد الرد');
      return;
    }
    toast.success('تم توليد الرد');
    mutatePending();
    mutateMessagesPage();
  }

  async function handleApprove(id: number, editedText?: string) {
    const response = await fetch(`/api/pending/${id}/approve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ editedText }),
    });
    const data = await response.json();
    if (!response.ok) {
      toast.error(data.error || 'فشلت الموافقة');
      return;
    }
    toast.success('تم إرسال الرد للعميل');
    mutatePending();
    mutateMessagesPage();
    mutateChats();
  }

  async function handleReject(id: number) {
    const response = await fetch(`/api/pending/${id}/reject`, { method: 'POST' });
    if (!response.ok) {
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
  const visibleChats = (chats || []).filter((chat) => canViewAllChats || chat.assignedUserId === currentUserId);

  const timeline: { type: 'msg' | 'pending'; data: MessageItem | PendingMessageItem; ts: string }[] = [
    ...loadedMessages.map((message) => ({ type: 'msg' as const, data: message, ts: message.timestamp })),
    ...(pendingList || [])
      .filter((pending) => pending.status === 'pending')
      .map((pending) => ({ type: 'pending' as const, data: pending, ts: pending.createdAt })),
  ].sort((a, b) => new Date(a.ts).getTime() - new Date(b.ts).getTime());

  return (
    <div className="flex h-full">
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

            <div ref={scrollRef} onScroll={handleMessagesScroll} className="flex-1 overflow-y-auto px-3 py-4">
              <div className="flex min-h-9 items-center justify-center pb-2 text-xs text-zinc-500">
                {loadingOlder ? (
                  <span className="flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> جارٍ تحميل الرسائل السابقة...</span>
                ) : hasMore && timeline.length ? (
                  <button type="button" onClick={loadOlderMessages} className="rounded-full bg-white px-3 py-1.5 shadow-sm hover:text-emerald-600 dark:bg-zinc-800">
                    اسحب للأعلى أو اضغط لتحميل الرسائل السابقة
                  </button>
                ) : timeline.length ? (
                  <span className="rounded-full bg-white px-3 py-1 shadow-sm dark:bg-zinc-800">بداية المحادثة</span>
                ) : null}
              </div>

              {loadingInitial && timeline.length === 0 ? (
                <div className="flex h-full items-center justify-center text-zinc-500">
                  <Loader2 className="h-5 w-5 animate-spin" />
                </div>
              ) : timeline.length === 0 ? (
                <div className="flex h-full items-center justify-center text-sm text-zinc-500">لا توجد رسائل بعد</div>
              ) : timeline.map((item, index) => {
                const previousItem = timeline[index - 1];
                const showDateSeparator = !previousItem || !isSameDay(item.ts, previousItem.ts);
                return (
                  <div key={`${item.type}-${item.data.id}`}>
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
