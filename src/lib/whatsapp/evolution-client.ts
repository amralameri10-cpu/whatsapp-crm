import { db } from '@/lib/db/drizzle';
import { settings as settingsTable } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

// بدون cache لأنها تُستدعى من API routes (مش Server Components)
export async function getEvolutionConfig(teamId: number) {
  const [row] = await db.select().from(settingsTable).where(eq(settingsTable.teamId, teamId)).limit(1);
  return {
    apiUrl: (row?.evolutionApiUrl || process.env.EVOLUTION_API_URL || '').replace(/\/$/, ''),
    apiKey: row?.evolutionApiKey || process.env.AUTHENTICATION_API_KEY || '',
    webhookToken: row?.evolutionWebhookToken || process.env.EVOLUTION_WEBHOOK_TOKEN || '',
  };
}

type EvoFetchOptions = {
  method?: string;
  body?: any;
  timeoutMs?: number;
};

export class EvolutionClient {
  constructor(private apiUrl: string, private apiKey: string) {}

  async req(path: string, opts: EvoFetchOptions = {}) {
    const url = `${this.apiUrl}${path}`;
    const res = await fetch(url, {
      method: opts.method || 'GET',
      headers: {
        'Content-Type': 'application/json',
        apikey: this.apiKey,
      },
      body: opts.body ? JSON.stringify(opts.body) : undefined,
      signal: AbortSignal.timeout(opts.timeoutMs || 20000),
    });

    // Evolution API أحياناً يرجع 204 بدون body
    if (res.status === 204) return {};

    const text = await res.text();
    let data: any = {};
    try { data = JSON.parse(text); } catch { data = { rawText: text }; }

    if (!res.ok) {
      const msg =
        (Array.isArray(data?.message) ? data.message[0] : data?.message) ||
        data?.error ||
        data?.response?.message?.[0] ||
        `Evolution API ${res.status}`;
      throw new Error(msg);
    }

    return data;
  }

  // ── Instance ────────────────────────────────────────────────────────────────

  async createInstance(instanceName: string, webhookUrl: string) {
    return this.req('/instance/create', {
      method: 'POST',
      body: {
        instanceName,
        integration: 'WHATSAPP-BAILEYS',
        qrcode: true,
        webhook: {
          url: webhookUrl,
          byEvents: true,         // Evolution v2 يفضّل byEvents: true
          base64: true,           // يرسل QR كـ base64
          events: [
            'MESSAGES_UPSERT',
            'MESSAGES_UPDATE',
            'CONNECTION_UPDATE',
            'QRCODE_UPDATED',
          ],
        },
      },
    });
  }

  // اجلب QR (يُستدعى عند الضغط على "اتصال")
  async getQR(instanceName: string): Promise<string | null> {
    try {
      const res = await this.req(`/instance/connect/${instanceName}`);
      // Evolution v2: { base64: "data:image/png;base64,..." } أو { code: "...", base64: "..." }
      return res?.base64 || res?.qrcode?.base64 || null;
    } catch {
      return null;
    }
  }

  async fetchInstances(instanceName?: string) {
    return this.req(`/instance/fetchInstances${instanceName ? `?instanceName=${encodeURIComponent(instanceName)}` : ''}`);
  }

  async getInstanceStatus(instanceName: string): Promise<string> {
    try {
      const res = await this.req(`/instance/connectionState/${instanceName}`);
      // { instance: { instanceName, state: "open" | "connecting" | "close" } }
      const state = res?.instance?.state || res?.state;
      if (state === 'open') return 'open';
      if (state === 'connecting') return 'connecting';
      return 'disconnected';
    } catch {
      return 'disconnected';
    }
  }

  async deleteInstance(instanceName: string) {
    return this.req(`/instance/delete/${instanceName}`, { method: 'DELETE' });
  }

  async logoutInstance(instanceName: string) {
    return this.req(`/instance/logout/${instanceName}`, { method: 'DELETE' });
  }

  // ── Messages ────────────────────────────────────────────────────────────────

  sendText(instanceName: string, number: string, text: string, quoted?: { id: string; text?: string }) {
    return this.req(`/message/sendText/${instanceName}`, {
      method: 'POST',
      body: {
        number,
        text,
        ...(quoted
          ? { quoted: { key: { id: quoted.id }, message: { conversation: quoted.text || '' } } }
          : {}),
      },
    });
  }

  sendMedia(instanceName: string, number: string, mediatype: 'image' | 'video' | 'document', media: string, caption?: string, fileName?: string) {
    return this.req(`/message/sendMedia/${instanceName}`, {
      method: 'POST',
      body: { number, mediatype, media, caption: caption || '', fileName: fileName || '' },
    });
  }

  sendAudio(instanceName: string, number: string, audio: string) {
    return this.req(`/message/sendWhatsAppAudio/${instanceName}`, {
      method: 'POST',
      body: { number, audio },
    });
  }

  sendReaction(instanceName: string, remoteJid: string, messageId: string, fromMe: boolean, reaction: string) {
    return this.req(`/message/sendReaction/${instanceName}`, {
      method: 'POST',
      body: { key: { remoteJid, id: messageId, fromMe }, reaction },
    });
  }

  // ── Profile ─────────────────────────────────────────────────────────────────

  async fetchProfilePic(instanceName: string, number: string): Promise<string | null> {
    try {
      const res = await this.req(`/chat/fetchProfilePictureUrl/${instanceName}`, {
        method: 'POST',
        body: { number },
      });
      return res?.profilePictureUrl || null;
    } catch {
      return null;
    }
  }

  // ── Webhook ─────────────────────────────────────────────────────────────────

  async setWebhook(instanceName: string, webhookUrl: string) {
    return this.req(`/webhook/set/${instanceName}`, {
      method: 'POST',
      body: {
        url: webhookUrl,
        byEvents: true,
        base64: true,
        events: ['MESSAGES_UPSERT', 'MESSAGES_UPDATE', 'CONNECTION_UPDATE', 'QRCODE_UPDATED'],
      },
    });
  }
}

export async function getEvolutionClient(teamId: number) {
  const cfg = await getEvolutionConfig(teamId);
  if (!cfg.apiUrl || !cfg.apiKey) {
    throw new Error('لم يتم إعداد Evolution API. اذهب للوحة السوبر أدمن ← إعدادات وأدخل بيانات الاتصال.');
  }
  return new EvolutionClient(cfg.apiUrl, cfg.apiKey);
}
