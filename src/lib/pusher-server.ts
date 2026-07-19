import Pusher from 'pusher';

// يدعم Pusher الأصلي أو Soketi (self-hosted)
export const pusherServer = new Pusher({
  appId: process.env.PUSHER_APP_ID!,
  key: process.env.NEXT_PUBLIC_PUSHER_KEY!,
  secret: process.env.PUSHER_SECRET!,
  cluster: process.env.NEXT_PUBLIC_PUSHER_CLUSTER || 'mt1',
  // Soketi: فعّل هذا بإضافة PUSHER_HOST في environment variables
  ...(process.env.PUSHER_HOST
    ? {
        host: process.env.PUSHER_HOST,
        port: process.env.PUSHER_PORT || '6001',
        scheme: 'https',
        useTLS: true,
      }
    : {}),
});
