import { NextRequest } from 'next/server';
import { getUserContext } from '@/lib/db/queries';
import { addSSEClient } from '@/lib/sse';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const ctx = await getUserContext();
  if (!ctx) {
    return new Response('Unauthorized', { status: 401 });
  }

  const teamId = ctx.teamId;

  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();
      
      // أرسل ping أولي لإثبات الاتصال
      controller.enqueue(encoder.encode(`event: connected\ndata: {"teamId":${teamId}}\n\n`));

      // سجّل الـ client
      const remove = addSSEClient(teamId, controller);

      // Ping كل 25 ثانية لإبقاء الاتصال حياً
      const pingInterval = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(`: ping\n\n`));
        } catch {
          clearInterval(pingInterval);
          remove();
        }
      }, 25000);

      // عند إغلاق الاتصال
      req.signal.addEventListener('abort', () => {
        clearInterval(pingInterval);
        remove();
        try { controller.close(); } catch {}
      });
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no', // مهم لـ nginx
    },
  });
}
