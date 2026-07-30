'use client';

import { PendingMessageItem } from '@/types';
import { Button } from '@/components/ui/button';
import { Bot, User, Check, X, Pencil } from 'lucide-react';
import { useState } from 'react';
import { cn } from '@/lib/utils';

export function PendingApprovalCard({
  pending,
  canApprove,
  onApprove,
  onReject,
}: {
  pending: PendingMessageItem;
  canApprove: boolean;
  onApprove: (id: number, editedText?: string) => Promise<void>;
  onReject: (id: number, reason?: string) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(pending.text);
  const [busy, setBusy] = useState(false);

  async function handleApprove() {
    setBusy(true);
    try {
      await onApprove(pending.id, editing ? text : undefined);
    } finally {
      setBusy(false);
    }
  }

  async function handleReject() {
    setBusy(true);
    try {
      await onReject(pending.id);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-3 my-2 rounded-xl border border-amber-200 bg-amber-50 dark:bg-amber-900/10 dark:border-amber-900/40 overflow-hidden animate-fade-in">
      <div className="flex items-center gap-2 px-3 py-2 bg-amber-100/60 dark:bg-amber-900/20">
        {pending.source === 'ai' ? (
          <Bot className="h-3.5 w-3.5 text-violet-600" />
        ) : (
          <User className="h-3.5 w-3.5 text-zinc-600" />
        )}
        <span className="text-xs font-medium text-amber-800 dark:text-amber-300">
          {pending.source === 'ai' ? 'رد مقترح من الذكاء الاصطناعي' : `بانتظار موافقة على رد ${pending.authorName || ''}`}
        </span>
      </div>

      <div className="p-3">
        {editing ? (
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            className="w-full text-sm rounded-lg border border-amber-300 p-2 bg-white dark:bg-zinc-900 focus:outline-none focus:ring-2 focus:ring-amber-400"
            rows={3}
          />
        ) : (
          <p className="text-sm text-zinc-800 dark:text-zinc-200 whitespace-pre-wrap">{pending.text}</p>
        )}
      </div>

      {canApprove && (
        <div className="flex items-center gap-2 px-3 pb-3">
          <Button size="sm" onClick={handleApprove} loading={busy} className="gap-1.5">
            <Check className="h-3.5 w-3.5" />
            {editing ? 'حفظ وإرسال' : 'موافقة وإرسال'}
          </Button>
          <Button size="sm" variant="outline" onClick={() => setEditing((v) => !v)} disabled={busy} className="gap-1.5">
            <Pencil className="h-3.5 w-3.5" />
            {editing ? 'إلغاء التعديل' : 'تعديل'}
          </Button>
          <Button size="sm" variant="ghost" onClick={handleReject} disabled={busy} className="gap-1.5 text-red-600 hover:bg-red-50">
            <X className="h-3.5 w-3.5" />
            رفض
          </Button>
        </div>
      )}

      {!canApprove && (
        <div className="px-3 pb-3">
          <p className="text-xs text-zinc-500">بانتظار موافقة المسؤول قبل الإرسال</p>
        </div>
      )}
    </div>
  );
}
