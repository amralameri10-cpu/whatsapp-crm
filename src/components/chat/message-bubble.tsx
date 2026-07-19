'use client';

import { MessageItem } from '@/types';
import { cn, formatTime } from '@/lib/utils';
import { Check, CheckCheck, Clock, AlertCircle, FileText, Mic } from 'lucide-react';

function StatusIcon({ status }: { status: string }) {
  if (status === 'failed') return <AlertCircle className="h-3.5 w-3.5 text-red-400" />;
  if (status === 'read') return <CheckCheck className="h-3.5 w-3.5 text-sky-400" />;
  if (status === 'delivered') return <CheckCheck className="h-3.5 w-3.5 text-zinc-400" />;
  if (status === 'sent') return <Check className="h-3.5 w-3.5 text-zinc-400" />;
  return <Clock className="h-3 w-3 text-zinc-400" />;
}

export function MessageBubble({ message }: { message: MessageItem }) {
  const isMe = message.fromMe;

  if (message.isInternal) {
    return (
      <div className="flex justify-center my-2">
        <div className="bg-amber-50 dark:bg-amber-900/20 text-amber-800 dark:text-amber-300 text-xs px-3 py-1.5 rounded-lg max-w-[80%] text-center">
          {message.text}
        </div>
      </div>
    );
  }

  return (
    <div className={cn('flex mb-1.5', isMe ? 'justify-start' : 'justify-end')}>
      <div
        className={cn(
          'max-w-[75%] md:max-w-[60%] rounded-2xl px-3.5 py-2 text-sm shadow-sm',
          isMe
            ? 'bg-emerald-600 text-white rounded-bl-sm'
            : 'bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-50 rounded-br-sm border border-zinc-100 dark:border-zinc-700'
        )}
      >
        {message.quotedText && (
          <div className={cn('text-xs mb-1.5 px-2 py-1 rounded border-r-2', isMe ? 'bg-emerald-700/50 border-emerald-300' : 'bg-zinc-100 dark:bg-zinc-700 border-zinc-300')}>
            {message.quotedText.slice(0, 80)}
          </div>
        )}

        {message.messageType === 'image' && message.mediaUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={message.mediaUrl} alt="" className="rounded-lg mb-1.5 max-h-64 object-cover" />
        )}

        {message.messageType === 'document' && (
          <div className="flex items-center gap-2 mb-1.5">
            <FileText className="h-4 w-4" />
            <span className="text-xs">{message.mediaCaption || 'مستند'}</span>
          </div>
        )}

        {message.messageType === 'audio' && message.mediaUrl && (
          <div className="flex items-center gap-2 mb-1">
            <Mic className="h-4 w-4" />
            <audio controls src={message.mediaUrl} className="h-8 max-w-[200px]" />
          </div>
        )}

        {message.text && <p className="whitespace-pre-wrap break-words">{message.text}</p>}

        <div className={cn('flex items-center gap-1 mt-1 justify-end', isMe ? 'text-emerald-100' : 'text-zinc-400')}>
          <span className="text-[10px]">{formatTime(message.timestamp)}</span>
          {isMe && <StatusIcon status={message.status} />}
        </div>
      </div>
    </div>
  );
}
