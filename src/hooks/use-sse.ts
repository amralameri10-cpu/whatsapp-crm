'use client';
import { useEffect, useRef } from 'react';

export function useSSE(events: Record<string, (data: any) => void>) {
  const eventsRef = useRef(events);
  eventsRef.current = events;

  useEffect(() => {
    let es: EventSource | null = null;
    let retryTimeout: ReturnType<typeof setTimeout>;
    let retryDelay = 1000;

    function connect() {
      es = new EventSource('/api/sse');

      es.addEventListener('connected', () => {
        retryDelay = 1000; // reset delay on success
      });

      // استقبال كل الأحداث المسجّلة
      Object.keys(eventsRef.current).forEach((eventName) => {
        es!.addEventListener(eventName, (e: MessageEvent) => {
          try {
            const data = JSON.parse(e.data);
            eventsRef.current[eventName]?.(data);
          } catch {}
        });
      });

      es.onerror = () => {
        es?.close();
        // إعادة الاتصال تدريجياً
        retryDelay = Math.min(retryDelay * 2, 30000);
        retryTimeout = setTimeout(connect, retryDelay);
      };
    }

    connect();

    return () => {
      clearTimeout(retryTimeout);
      es?.close();
    };
  }, []); // مرة واحدة فقط
}
