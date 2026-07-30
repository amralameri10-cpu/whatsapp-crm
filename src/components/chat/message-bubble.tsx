'use client';

import { useState } from 'react';
import { MessageItem } from '@/types';
import { cn, formatTime } from '@/lib/utils';
import { Check, CheckCheck, Clock, AlertCircle, FileText, Mic, Image, Film, MapPin, User, BarChart3, Download, Loader2 } from 'lucide-react';

const mediaIcons: Record<string, any> = {
  image: Image,
  video: Film,
  audio: Mic,
  document: FileText,
  location: MapPin,
  contact: User,
  poll: BarChart3,
};

const mediaLabels: Record<string, string> = {
  image: 'صورة',
  video: 'فيديو',
  audio: 'رسالة صوتية',
  document: 'مستند',
  location: 'موقع',
  contact: 'جهة اتصال',
  poll: 'استطلاع',
};

function StatusIcon({ status }: { status: string }) {
  if (status === 'failed') return <AlertCircle className="h-3.5 w-3.5 text-red-400" />;
  if (status === 'read') return <CheckCheck className="h-3.5 w-3.5 text-sky-400" />;
  if (status === 'delivered') return <CheckCheck className="h-3.5 w-3.5 text-zinc-400" />;
  if (status === 'sent') return <Check className="h-3.5 w-3.5 text-zinc-400" />;
  return <Clock className="h-3 w-3 text-zinc-400" />;
}

function useMediaSrc(message: MessageItem) {
  const [error, setError] = useState(false);
  const src = message.mediaUrl || (message.id ? `/api/media/${encodeURIComponent(message.id)}` : null);
  return { src: error ? null : src, setError };
}

export function MessageBubble({ message }: { message: MessageItem }) {
  const isMe = message.fromMe;
  const Icon = mediaIcons[message.messageType] || null;
  const mediaLabel = mediaLabels[message.messageType] || null;
  const { src: mediaSrc, setError: setMediaError } = useMediaSrc(message);

  if (message.isInternal) {
    return (
      <div className="flex justify-center my-2">
        <div className="bg-amber-50 dark:bg-amber-900/20 text-amber-800 dark:text-amber-300 text-xs px-3 py-1.5 rounded-lg max-w-[80%] text-center">
          {message.text || 'رسالة داخلية'}
        </div>
      </div>
    );
  }

  const hasMedia = ['image', 'video', 'audio', 'document', 'sticker'].includes(message.messageType);
  const showDownload = mediaSrc && (message.messageType === 'image' || message.messageType === 'video' || message.messageType === 'audio' || message.messageType === 'document');

  const handleDownload = (e: React.MouseEvent) => {
    e.preventDefault();
    if (!mediaSrc) return;
    const a = document.createElement('a');
    a.href = mediaSrc;
    a.download = message.mediaCaption || `file_${message.id || Date.now()}`;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  return (
    <div className={cn('flex mb-1.5', isMe ? 'justify-end' : 'justify-start')}>
      <div
        className={cn(
          'max-w-[75%] md:max-w-[60%] rounded-2xl px-3.5 py-2 text-sm shadow-sm',
          isMe
            ? 'bg-emerald-600 text-white rounded-br-sm'
            : 'bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-50 rounded-bl-sm border border-zinc-100 dark:border-zinc-700'
        )}
      >
        {message.quotedText && (
          <div className={cn('text-xs mb-1.5 px-2 py-1 rounded border-r-2', isMe ? 'bg-emerald-700/50 border-emerald-300' : 'bg-zinc-100 dark:bg-zinc-700 border-zinc-300')}>
            {message.quotedText.slice(0, 80)}
          </div>
        )}

        {/* صور */}
        {message.messageType === 'image' && (
          <div className="mb-1.5">
            {mediaSrc && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={mediaSrc}
                alt=""
                className="rounded-lg max-h-64 object-cover cursor-pointer"
                onClick={() => window.open(mediaSrc, '_blank')}
                onError={() => setMediaError(true)}
              />
            )}
            {!mediaSrc && (
              <div className="flex items-center gap-2 bg-black/10 rounded-lg p-3">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span className="text-xs">جارٍ تحميل الصورة...</span>
              </div>
            )}
          </div>
        )}

        {/* فيديو */}
        {message.messageType === 'video' && (
          <div className="mb-1.5">
            {mediaSrc ? (
              <video src={mediaSrc} controls className="rounded-lg max-h-64 max-w-full" />
            ) : (
              <div className="flex items-center gap-2 bg-black/10 rounded-lg p-3">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span className="text-xs">جارٍ تحميل الفيديو...</span>
              </div>
            )}
          </div>
        )}

        {/* صوت */}
        {message.messageType === 'audio' && (
          <div className="mb-1.5">
            {mediaSrc ? (
              <audio controls src={mediaSrc} className="max-w-[240px] w-full" />
            ) : (
              <div className="flex items-center gap-2 bg-black/10 rounded-lg p-3">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span className="text-xs">جارٍ تحميل الصوت...</span>
              </div>
            )}
          </div>
        )}

        {/* مستند / ملف */}
        {message.messageType === 'document' && (
          <div className="mb-1.5">
            {mediaSrc ? (
              <div
                className="flex items-center gap-2 bg-black/10 rounded-lg p-3 cursor-pointer"
                onClick={handleDownload}
              >
                <FileText className="h-5 w-5 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-medium truncate">
                    {message.mediaCaption || 'مستند'}
                  </div>
                  <div className="flex items-center gap-1 text-[10px] opacity-70">
                    <Download className="h-3 w-3" />
                    <span>اضغط للتنزيل</span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-2 bg-black/10 rounded-lg p-3">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span className="text-xs">جارٍ تحميل المستند...</span>
              </div>
            )}
          </div>
        )}

        {/* ملصق */}
        {message.messageType === 'sticker' && (
          <div className="text-xs italic mb-1">ملصق</div>
        )}

        {/* أيقونة نوع الوسائط عند عدم وجود mediaUrl */}
        {Icon && hasMedia && !message.text && !mediaSrc && (
          <div className="flex items-center gap-1.5 mb-1">
            <Icon className="h-4 w-4" />
            <span className="text-xs">{mediaLabel}</span>
          </div>
        )}

        {/* النص */}
        {message.text && <p className="whitespace-pre-wrap break-words">{message.text}</p>}

        {/* الوصف */}
        {message.mediaCaption && message.mediaCaption !== message.text && (
          <div className="text-xs opacity-70 mt-1">{message.mediaCaption}</div>
        )}

        {/* الوقت وحالة التسليم */}
        <div className={cn('flex items-center gap-1 mt-1 justify-end', isMe ? 'text-emerald-100' : 'text-zinc-400')}>
          <span className="text-[10px]">{formatTime(message.timestamp)}</span>
          {isMe && <StatusIcon status={message.status} />}
        </div>
      </div>
    </div>
  );
}
