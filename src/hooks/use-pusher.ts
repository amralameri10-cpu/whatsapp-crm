'use client';
import { useEffect, useRef } from 'react';
import PusherClient from 'pusher-js';

let client: PusherClient | null = null;

function getClient() {
  if (client) return client;

  const key = process.env.NEXT_PUBLIC_PUSHER_KEY;
  const cluster = process.env.NEXT_PUBLIC_PUSHER_CLUSTER || 'mt1';
  const host = process.env.NEXT_PUBLIC_PUSHER_HOST;
  const port = process.env.NEXT_PUBLIC_PUSHER_PORT || '6001';

  if (!key) return null;

  client = new PusherClient(key, {
    cluster,
    // Soketi config
    ...(host
      ? {
          wsHost: host,
          wsPort: parseInt(port),
          wssPort: parseInt(port),
          forceTLS: true,
          enabledTransports: ['ws', 'wss'],
        }
      : {}),
  });

  return client;
}

export function usePusherChannel(
  channelName: string,
  events: Record<string, (data: any) => void>
) {
  const eventsRef = useRef(events);
  eventsRef.current = events;

  useEffect(() => {
    const c = getClient();
    if (!c) return;

    const channel = c.subscribe(channelName);
    const handlers: Record<string, (data: any) => void> = {};

    Object.keys(eventsRef.current).forEach((eventName) => {
      const handler = (data: any) => eventsRef.current[eventName]?.(data);
      handlers[eventName] = handler;
      channel.bind(eventName, handler);
    });

    return () => {
      Object.keys(handlers).forEach((e) => channel.unbind(e, handlers[e]));
      c.unsubscribe(channelName);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channelName]);
}
