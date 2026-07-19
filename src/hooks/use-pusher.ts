'use client';
import { useEffect, useRef } from 'react';
import PusherClient from 'pusher-js';

let client: PusherClient | null = null;

function getClient() {
  if (!client && process.env.NEXT_PUBLIC_PUSHER_KEY) {
    client = new PusherClient(process.env.NEXT_PUBLIC_PUSHER_KEY, {
      cluster: process.env.NEXT_PUBLIC_PUSHER_CLUSTER || 'eu',
    });
  }
  return client;
}

export function usePusherChannel(channelName: string, events: Record<string, (data: any) => void>) {
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
      Object.keys(handlers).forEach((eventName) => channel.unbind(eventName, handlers[eventName]));
      c.unsubscribe(channelName);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channelName]);
}
