'use client';

import { ChatListItem } from '@/types';
import { Avatar, Badge } from '@/components/ui/misc';
import { formatPhoneForDisplay, cn } from '@/lib/utils';
import { Bot, Lock, MessageCircle, Users } from 'lucide-react';

export function ChatList({
  chats,
  activeId,
  canSeePhone,
  onSelect,
  search,
  onSearchChange,
}: {
  chats: ChatListItem[];
  activeId: number | null;
  canSeePhone: boolean;
  onSelect: (chat: ChatListItem) => void;
  search: string;
  onSearchChange: (v: string) => void;
}) {
  const filtered = chats.filter((c) =>
    (c.name || '').toLowerCase().includes(search.toLowerCase()) ||
    (canSeePhone && (c.phoneNumber || '').includes(search))
  );

  return (
    <div className="flex flex-col h-full">
      <div className="p-3 border-b border-zinc-200 dark:border-zinc-800">
        <input
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="ابحث في المحادثات..."
          className="w-full h-9 px-3 rounded-lg bg-zinc-100 dark:bg-zinc-900 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
        />
      </div>

      <div className="flex-1 overflow-y-auto">
        {filtered.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-zinc-400 px-6 text-center">
            <MessageCircle className="h-10 w-10 mb-2 opacity-40" />
            <p className="text-sm">لا توجد محادثات</p>
          </div>
        )}

        {filtered.map((chat) => {
          const displayName = chat.name || chat.phoneNumber || 'محادثة';
          return (
            <button
              key={chat.id}
              onClick={() => onSelect(chat)}
              className={cn(
                'w-full flex items-start gap-3 px-3 py-3 text-right border-b border-zinc-100 dark:border-zinc-900 transition-colors',
                activeId === chat.id ? 'bg-emerald-50 dark:bg-emerald-900/10' : 'hover:bg-zinc-50 dark:hover:bg-zinc-900'
              )}
            >
              <Avatar name={displayName} size={44} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium text-sm text-zinc-900 dark:text-zinc-50 truncate">
                    {displayName}
                  </span>
                  <div className="flex items-center gap-1 shrink-0">
                    {chat.isGroup && <Users className="h-3.5 w-3.5 text-zinc-400" />}
                    {chat.lastMessageAt && (
                      <span className="text-[11px] text-zinc-400">
                        {new Date(chat.lastMessageAt).toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex items-center justify-between gap-2 mt-0.5">
                  <p className="text-xs text-zinc-500 truncate flex-1">
                    {chat.lastMessageFromMe && <span className="text-zinc-400">أنت: </span>}
                    {chat.lastMessageText || 'لا توجد رسائل'}
                  </p>
                  <div className="flex items-center gap-1 shrink-0">
                    {chat.requireApproval && <Lock className="h-3 w-3 text-amber-500" />}
                    {chat.aiEnabled && <Bot className="h-3 w-3 text-violet-500" />}
                    {chat.unreadCount > 0 && (
                      <Badge className="h-5 min-w-5 px-1.5 justify-center">{chat.unreadCount}</Badge>
                    )}
                  </div>
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
