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

export class EvolutionApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'EvolutionApiError';
  }
}

function errorText(data: any, status: number): string {
  const candidates = [
    data?.error?.message,
    data?.response?.message,
    data?.response?.message?.[0],
    data?.message,
    data?.error,
    data?.rawText,
  ];

  for (const candidate of candidates) {
    if (Array.isArray(candidate) && candidate.length) return candidate.map(String).join('، ');
    if (typeof candidate === 'string' && candidate.trim()) return candidate.trim();
  }

  return `Evolution API ${status}`;
}

function canTryLegacy(error: unknown): boolean {
  return error instanceof EvolutionApiError && [400, 404, 415, 422].includes(error.status);
}

export class EvolutionClient {
  constructor(private apiUrl: string, private apiKey: string) {}

  async req(path: string, opts: EvoFetchOptions = {}) {
    if (!this.apiUrl || !this.apiKey) {
      throw new Error('بيانات Evolution API غير مكتملة');
    }

    const isFormData = typeof FormData !== 'undefined' && opts.body instanceof FormData;
    const url = `${this.apiUrl}${path}`;
    const res = await fetch(url, {
      method: opts.method || 'GET',
      headers: {
        apikey: this.apiKey,
        ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
      },
      body: opts.body ? (isFormData ? opts.body : JSON.stringify(opts.body)) : undefined,
      signal: AbortSignal.timeout(opts.timeoutMs || 30000),
    });

    if (res.status === 204) return {};

    const text = await res.text();
    let data: any = {};
    try { data = text ? JSON.parse(text) : {}; } catch { data = { rawText: text }; }

    if (!res.ok) {
      throw new EvolutionApiError(errorText(data, res.status), res.status, data);
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
          byEvents: true,
          base64: true,
          events: ['MESSAGES_UPSERT', 'MESSAGES_UPDATE', 'CONNECTION_UPDATE', 'QRCODE_UPDATED'],
        },
      },
    });
  }

  async getQR(instanceName: string): Promise<string | null> {
    try {
      const res = await this.req(`/instance/connect/${encodeURIComponent(instanceName)}`);
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
      const res = await this.req(`/instance/connectionState/${encodeURIComponent(instanceName)}`);
      const state = res?.instance?.state || res?.state;
      if (state === 'open') return 'open';
      if (state === 'connecting') return 'connecting';
      return 'disconnected';
    } catch {
      return 'disconnected';
    }
  }

  async deleteInstance(instanceName: string) {
    return this.req(`/instance/delete/${encodeURIComponent(instanceName)}`, { method: 'DELETE' });
  }

  async logoutInstance(instanceName: string) {
    return this.req(`/instance/logout/${encodeURIComponent(instanceName)}`, { method: 'DELETE' });
  }

  // ── Chats / contacts / history ─────────────────────────────────────────────

  findChats(instanceName: string, body: Record<string, unknown> = {}) {
    return this.req(`/chat/findChats/${encodeURIComponent(instanceName)}`, { method: 'POST', body, timeoutMs: 60000 });
  }

  findContacts(instanceName: string, body: Record<string, unknown> = {}) {
    return this.req(`/chat/findContacts/${encodeURIComponent(instanceName)}`, { method: 'POST', body, timeoutMs: 60000 });
  }

  findMessages(instanceName: string, body: Record<string, unknown>) {
    return this.req(`/chat/findMessages/${encodeURIComponent(instanceName)}`, { method: 'POST', body, timeoutMs: 60000 });
  }

  // ── Messages ────────────────────────────────────────────────────────────────

  async sendText(instanceName: string, number: string, text: string, quoted?: { id: string; text?: string }) {
    const officialBody = {
      number,
      textMessage: { text },
      ...(quoted
        ? { quoted: { key: { id: quoted.id }, message: { conversation: quoted.text || '' } } }
        : {}),
    };

    try {
      // Evolution API 2.3.7 official shape.
      return await this.req(`/message/sendText/${encodeURIComponent(instanceName)}`, {
        method: 'POST',
        body: officialBody,
      });
    } catch (error) {
      if (!canTryLegacy(error)) throw error;
      // Compatibility with older 2.x installations that accepted top-level text.
      return this.req(`/message/sendText/${encodeURIComponent(instanceName)}`, {
        method: 'POST',
        body: { number, text, ...(quoted ? { quoted: officialBody.quoted } : {}) },
      });
    }
  }

  async sendMedia(
    instanceName: string,
    number: string,
    mediatype: 'image' | 'video' | 'audio' | 'document',
    mediaBase64: string,
    caption = '',
    fileName = '',
    mimetype = 'application/octet-stream',
  ) {
    const cleanBase64 = mediaBase64.replace(/^data:[^;]+;base64,/, '');
    const binary = Buffer.from(cleanBase64, 'base64');
    const form = new FormData();
    form.append('number', number);
    form.append('mediatype', mediatype);
    form.append('media', new Blob([binary], { type: mimetype }), fileName || `upload.${mediatype === 'image' ? 'jpg' : mediatype === 'video' ? 'mp4' : 'bin'}`);
    if (caption) form.append('caption', caption);
    if (fileName) form.append('fileName', fileName);

    try {
      // Current OpenAPI specification uses multipart/form-data.
      return await this.req(`/message/sendMedia/${encodeURIComponent(instanceName)}`, {
        method: 'POST',
        body: form,
        timeoutMs: 120000,
      });
    } catch (error) {
      if (!canTryLegacy(error)) throw error;
      // A number of deployed Evolution 2.x builds still expect JSON/base64.
      return this.req(`/message/sendMedia/${encodeURIComponent(instanceName)}`, {
        method: 'POST',
        body: {
          number,
          mediatype,
          mimetype,
          media: cleanBase64,
          caption,
          fileName,
        },
        timeoutMs: 120000,
      });
    }
  }

  async sendAudio(instanceName: string, number: string, audio: string, mimetype = 'audio/ogg', fileName = 'audio.ogg') {
    const cleanBase64 = audio.replace(/^data:[^;]+;base64,/, '');
    try {
      // This endpoint sends a voice-note style WhatsApp audio in compatible builds.
      return await this.req(`/message/sendWhatsAppAudio/${encodeURIComponent(instanceName)}`, {
        method: 'POST',
        body: { number, audio: cleanBase64 },
        timeoutMs: 120000,
      });
    } catch (error) {
      if (!canTryLegacy(error)) throw error;
      return this.sendMedia(instanceName, number, 'audio', cleanBase64, '', fileName, mimetype);
    }
  }

  async sendReaction(instanceName: string, remoteJid: string, messageId: string, fromMe: boolean, reaction: string) {
    try {
      return await this.req(`/message/sendReaction/${encodeURIComponent(instanceName)}`, {
        method: 'POST',
        body: {
          reactionKey: { remoteJid, id: messageId, fromMe },
          reactionMessage: reaction,
        },
      });
    } catch (error) {
      if (!canTryLegacy(error)) throw error;
      return this.req(`/message/sendReaction/${encodeURIComponent(instanceName)}`, {
        method: 'POST',
        body: { key: { remoteJid, id: messageId, fromMe }, reaction },
      });
    }
  }

  // ── Profile ─────────────────────────────────────────────────────────────────

  async fetchProfilePic(instanceName: string, number: string): Promise<string | null> {
    try {
      const res = await this.req(`/chat/fetchProfilePictureUrl/${encodeURIComponent(instanceName)}`, {
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
    return this.req(`/webhook/set/${encodeURIComponent(instanceName)}`, {
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
