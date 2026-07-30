'use client';
import { useEffect, useRef } from 'react';

// قائمة الأحداث المعروفة — تُسجَّل مرة واحدة عند الاتصال الأول
const KNOWN_EVENTS = [
  'connected',
  'new-message',
  'chat-update',
  'pending-update',
  'qr-update',
  'instance-update',
];

export function useSSE(events: Record<string, (data: any) => void>) {
  const eventsRef = useRef(events);
  eventsRef.current = events;

  useEffect(() => {
    let es: EventSource | null = null;
    let retryTimeout: ReturnType<typeof setTimeout>;
    let retryDelay = 1000;
    let alive = true;

    function connect() {
      if (!alive) return;
      es = new EventSource('/api/sse');

      es.addEventListener('connected', () => {
        retryDelay = 1000; // reset delay on success
      });

      // نسجّل كل الأحداث المعروفة لضمان استقبالها حتى لو تغيّر eventsRef
      KNOWN_EVENTS.forEach((eventName) => {
        es!.addEventListener(eventName, (e: MessageEvent) => {
          try {
            const data = JSON.parse(e.data);
            eventsRef.current[eventName]?.(data);
          } catch {}
        });
      });

      es.onerror = () => {
        es?.close();
        if (!alive) return;
        // إعادة الاتصال تدريجياً
        retryDelay = Math.min(retryDelay * 2, 30000);
        retryTimeout = setTimeout(connect, retryDelay);
      };
    }

    connect();

    return () => {
      alive = false;
      clearTimeout(retryTimeout);
      es?.close();
    };
  }, []); // مرة واحدة فقط
}
