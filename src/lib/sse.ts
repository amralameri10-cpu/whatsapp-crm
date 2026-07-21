/**
 * SSE (Server-Sent Events) — بديل Pusher مدمج في Next.js
 * لا يحتاج أي خدمة خارجية
 */

type SSEClient = {
  teamId: number;
  controller: ReadableStreamDefaultController;
};

// قائمة الـ clients المتصلين حالياً
const clients = new Set<SSEClient>();

export function addSSEClient(teamId: number, controller: ReadableStreamDefaultController) {
  const client = { teamId, controller };
  clients.add(client);
  return () => clients.delete(client);
}

export function broadcastToTeam(teamId: number, event: string, data: any) {
  const message = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  const encoder = new TextEncoder();
  
  for (const client of clients) {
    if (client.teamId === teamId) {
      try {
        client.controller.enqueue(encoder.encode(message));
      } catch {
        clients.delete(client);
      }
    }
  }
}
