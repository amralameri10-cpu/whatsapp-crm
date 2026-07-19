'use client';

import { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Send, Paperclip, Bot, Smile, Lock, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

export function ChatInput({
  onSend,
  onSendMedia,
  onGenerateAI,
  canUseAI,
  requireApproval,
  disabled,
}: {
  onSend: (text: string) => Promise<void>;
  onSendMedia: (file: File) => Promise<void>;
  onGenerateAI: () => Promise<void>;
  canUseAI: boolean;
  requireApproval: boolean;
  disabled?: boolean;
}) {
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [generatingAI, setGeneratingAI] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function handleSend() {
    if (!text.trim() || sending) return;
    setSending(true);
    try {
      await onSend(text.trim());
      setText('');
    } finally {
      setSending(false);
    }
  }

  async function handleAI() {
    setGeneratingAI(true);
    try {
      await onGenerateAI();
    } finally {
      setGeneratingAI(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  return (
    <div className="border-t border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 p-3">
      {requireApproval && (
        <div className="flex items-center gap-1.5 text-xs text-amber-600 mb-2 px-1">
          <Lock className="h-3 w-3" />
          الرد هنا يحتاج موافقة المسؤول قبل الوصول للعميل
        </div>
      )}
      <div className="flex items-end gap-2">
        <input ref={fileRef} type="file" hidden onChange={(e) => e.target.files?.[0] && onSendMedia(e.target.files[0])} />
        <Button variant="ghost" size="icon" onClick={() => fileRef.current?.click()} disabled={disabled}>
          <Paperclip className="h-4.5 w-4.5" />
        </Button>

        {canUseAI && (
          <Button variant="ghost" size="icon" onClick={handleAI} disabled={disabled || generatingAI} title="اقترح رد بالذكاء الاصطناعي">
            {generatingAI ? <Loader2 className="h-4.5 w-4.5 animate-spin" /> : <Bot className="h-4.5 w-4.5 text-violet-500" />}
          </Button>
        )}

        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="اكتب رسالة..."
          rows={1}
          disabled={disabled}
          className="flex-1 resize-none rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 max-h-32"
        />

        <Button
          size="icon"
          onClick={handleSend}
          disabled={!text.trim() || sending || disabled}
          className={cn('shrink-0', requireApproval && 'bg-amber-600 hover:bg-amber-700')}
        >
          {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        </Button>
      </div>
    </div>
  );
}
