'use client';

import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Bot,
  FileUp,
  Image as ImageIcon,
  Loader2,
  Lock,
  Mic,
  Paperclip,
  Send,
  Square,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

export type MediaSendMode = 'media' | 'document' | 'voice';

function recordingFileExtension(mime: string) {
  if (mime.includes('ogg')) return 'ogg';
  if (mime.includes('mp4')) return 'm4a';
  return 'webm';
}

function formatDuration(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60).toString().padStart(2, '0');
  const seconds = (totalSeconds % 60).toString().padStart(2, '0');
  return `${minutes}:${seconds}`;
}

export function ChatInput({
  onSend,
  onSendMedia,
  onGenerateAI,
  canUseAI,
  requireApproval,
  disabled,
}: {
  onSend: (text: string) => Promise<void>;
  onSendMedia: (file: File, mode: MediaSendMode, caption?: string) => Promise<void>;
  onGenerateAI: () => Promise<void>;
  canUseAI: boolean;
  requireApproval: boolean;
  disabled?: boolean;
}) {
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [sendingMedia, setSendingMedia] = useState(false);
  const [generatingAI, setGeneratingAI] = useState(false);
  const [attachmentOpen, setAttachmentOpen] = useState(false);
  const [recording, setRecording] = useState(false);
  const [recordSeconds, setRecordSeconds] = useState(0);

  const mediaInputRef = useRef<HTMLInputElement>(null);
  const documentInputRef = useRef<HTMLInputElement>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const cancelRecordingRef = useRef(false);
  const recordTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const busy = Boolean(disabled || sending || sendingMedia || generatingAI);

  useEffect(() => {
    return () => {
      if (recordTimerRef.current) clearInterval(recordTimerRef.current);
      const recorder = recorderRef.current;
      if (recorder && recorder.state !== 'inactive') recorder.stop();
      streamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  async function handleSend() {
    if (!text.trim() || busy || recording) return;
    setSending(true);
    try {
      await onSend(text.trim());
      setText('');
    } finally {
      setSending(false);
    }
  }

  async function handleAI() {
    if (busy || recording) return;
    setGeneratingAI(true);
    try {
      await onGenerateAI();
    } finally {
      setGeneratingAI(false);
    }
  }

  async function sendSelectedFile(file: File, mode: MediaSendMode) {
    setSendingMedia(true);
    setAttachmentOpen(false);
    try {
      // النص المكتوب يصبح وصفاً للصورة أو الفيديو العادي فقط.
      const caption = mode === 'media' ? text.trim() : '';
      await onSendMedia(file, mode, caption);
      if (caption) setText('');
    } finally {
      setSendingMedia(false);
    }
  }

  async function handleFileChange(
    event: React.ChangeEvent<HTMLInputElement>,
    mode: MediaSendMode,
  ) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    await sendSelectedFile(file, mode);
  }

  async function startRecording() {
    if (busy || recording) return;
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      toast.error('المتصفح لا يدعم تسجيل الصوت');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      chunksRef.current = [];
      cancelRecordingRef.current = false;

      const preferredTypes = [
        'audio/ogg;codecs=opus',
        'audio/webm;codecs=opus',
        'audio/webm',
        'audio/mp4',
      ];
      const mimeType = preferredTypes.find((type) => MediaRecorder.isTypeSupported(type));
      const recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);

      recorderRef.current = recorder;
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };
      recorder.onerror = () => toast.error('حدث خطأ أثناء تسجيل الصوت');
      recorder.onstop = async () => {
        if (recordTimerRef.current) {
          clearInterval(recordTimerRef.current);
          recordTimerRef.current = null;
        }
        stream.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
        recorderRef.current = null;
        setRecording(false);
        setRecordSeconds(0);

        if (cancelRecordingRef.current || chunksRef.current.length === 0) {
          chunksRef.current = [];
          return;
        }

        const type = recorder.mimeType || chunksRef.current[0]?.type || 'audio/webm';
        const blob = new Blob(chunksRef.current, { type });
        chunksRef.current = [];
        const extension = recordingFileExtension(type);
        const file = new File([blob], `voice-${Date.now()}.${extension}`, { type });
        await sendSelectedFile(file, 'voice');
      };

      recorder.start(250);
      setRecording(true);
      setRecordSeconds(0);
      recordTimerRef.current = setInterval(() => {
        setRecordSeconds((current) => current + 1);
      }, 1000);
    } catch (error) {
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      toast.error(
        error instanceof DOMException && error.name === 'NotAllowedError'
          ? 'يجب السماح للمتصفح باستخدام الميكروفون'
          : 'تعذر تشغيل الميكروفون',
      );
    }
  }

  function stopRecording() {
    const recorder = recorderRef.current;
    if (!recorder || recorder.state === 'inactive') return;
    cancelRecordingRef.current = false;
    recorder.stop();
  }

  function cancelRecording() {
    const recorder = recorderRef.current;
    if (!recorder || recorder.state === 'inactive') return;
    cancelRecordingRef.current = true;
    recorder.stop();
  }

  function handleKeyDown(event: React.KeyboardEvent) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      handleSend();
    }
  }

  return (
    <div className="border-t border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-950">
      {requireApproval && (
        <div className="mb-2 flex items-center gap-1.5 px-1 text-xs text-amber-600">
          <Lock className="h-3 w-3" />
          الرد هنا يحتاج موافقة المسؤول قبل الوصول للعميل
        </div>
      )}

      {recording && (
        <div className="mb-2 flex items-center justify-between rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm dark:border-red-950 dark:bg-red-950/30">
          <div className="flex items-center gap-2 text-red-600">
            <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-red-500" />
            جارٍ التسجيل {formatDuration(recordSeconds)}
          </div>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" onClick={cancelRecording} title="إلغاء التسجيل">
              <X className="h-4 w-4" />
            </Button>
            <Button size="sm" onClick={stopRecording} className="gap-2 bg-red-600 hover:bg-red-700">
              <Square className="h-3.5 w-3.5 fill-current" />
              إرسال
            </Button>
          </div>
        </div>
      )}

      <div className="flex items-end gap-2">
        <input
          ref={mediaInputRef}
          type="file"
          accept="image/*,video/*"
          hidden
          onChange={(event) => handleFileChange(event, 'media')}
        />
        <input
          ref={documentInputRef}
          type="file"
          hidden
          onChange={(event) => handleFileChange(event, 'document')}
        />

        <div className="relative">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setAttachmentOpen((open) => !open)}
            disabled={busy || recording}
            title="إرفاق"
          >
            {sendingMedia ? <Loader2 className="h-4.5 w-4.5 animate-spin" /> : <Paperclip className="h-4.5 w-4.5" />}
          </Button>

          {attachmentOpen && (
            <div className="absolute bottom-12 right-0 z-30 w-64 overflow-hidden rounded-xl border border-zinc-200 bg-white p-1.5 shadow-xl dark:border-zinc-800 dark:bg-zinc-900">
              <button
                type="button"
                onClick={() => mediaInputRef.current?.click()}
                className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-right text-sm hover:bg-zinc-100 dark:hover:bg-zinc-800"
              >
                <ImageIcon className="h-5 w-5 text-emerald-500" />
                <span>
                  <strong className="block">صورة أو فيديو</strong>
                  <small className="text-zinc-500">يظهر داخل المحادثة مثل واتساب</small>
                </span>
              </button>
              <button
                type="button"
                onClick={() => documentInputRef.current?.click()}
                className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-right text-sm hover:bg-zinc-100 dark:hover:bg-zinc-800"
              >
                <FileUp className="h-5 w-5 text-blue-500" />
                <span>
                  <strong className="block">إرسال كملف</strong>
                  <small className="text-zinc-500">صور، فيديو، صوت أو أي مستند</small>
                </span>
              </button>
            </div>
          )}
        </div>

        {canUseAI && (
          <Button
            variant="ghost"
            size="icon"
            onClick={handleAI}
            disabled={busy || recording}
            title="اقترح رد بالذكاء الاصطناعي"
          >
            {generatingAI
              ? <Loader2 className="h-4.5 w-4.5 animate-spin" />
              : <Bot className="h-4.5 w-4.5 text-violet-500" />}
          </Button>
        )}

        <textarea
          value={text}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={recording ? 'جارٍ تسجيل رسالة صوتية...' : 'اكتب رسالة...'}
          rows={1}
          disabled={disabled || recording}
          className="max-h-32 flex-1 resize-none rounded-xl border border-zinc-200 bg-zinc-50 px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 dark:border-zinc-800 dark:bg-zinc-900"
        />

        {!text.trim() && !recording && (
          <Button
            variant="ghost"
            size="icon"
            onClick={startRecording}
            disabled={busy}
            title="تسجيل رسالة صوتية"
            className="shrink-0"
          >
            <Mic className="h-4.5 w-4.5" />
          </Button>
        )}

        <Button
          size="icon"
          onClick={handleSend}
          disabled={!text.trim() || busy || recording}
          className={cn('shrink-0', requireApproval && 'bg-amber-600 hover:bg-amber-700')}
        >
          {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        </Button>
      </div>
    </div>
  );
}
