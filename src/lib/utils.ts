import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatPhoneForDisplay(phone: string | null, canSee: boolean): string {
  if (!phone) return '—';
  if (canSee) return phone;
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 4) return '***';
  return `***${digits.slice(-3)}`;
}

/**
 * Evolution stores both real WhatsApp JIDs and internal database ids.  Only
 * values that end with a known WhatsApp suffix are safe conversation keys.
 */
export function isWhatsAppJid(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const jid = value.trim().toLowerCase();
  return /@(?:s\.whatsapp\.net|g\.us|lid|newsletter|broadcast)$/.test(jid);
}

export function looksLikeInternalId(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  const text = value.trim();
  if (!text) return false;
  if (/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(text)) return true;
  if (/^c[a-z0-9]{20,}$/i.test(text)) return true; // Prisma/CUID ids such as cmry5...
  if (!text.includes(' ') && !text.includes('@') && /^[a-z0-9_-]{20,}$/i.test(text) && !/^\+?\d+$/.test(text)) return true;
  return false;
}

export function jidToPhone(jid: string): string {
  if (!jid) return '';
  const localPart = jid.trim().split('@')[0].split(':')[0];
  const digits = localPart.replace(/\D/g, '');
  return digits.length >= 5 ? digits : '';
}

export function isJidOrGroupId(value: string): boolean {
  return isWhatsAppJid(value) || looksLikeInternalId(value);
}

export function phoneToJid(phone: string): string {
  const clean = phone.replace(/\D/g, '');
  return `${clean}@s.whatsapp.net`;
}

/** Return the first real WhatsApp JID from several version-dependent fields. */
export function pickWhatsAppJid(...values: unknown[]): string | null {
  for (const value of values) {
    if (!isWhatsAppJid(value)) continue;
    const jid = value.trim().toLowerCase();
    if (jid === 'status@broadcast') continue;
    return jid;
  }
  return null;
}

export function cleanDisplayName(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value !== 'string') continue;
    const name = value.trim();
    if (!name || name === 'null' || name === 'undefined') continue;
    if (isJidOrGroupId(name)) continue;
    if (/^\+?\d{5,}$/.test(name)) continue;
    return name.slice(0, 100);
  }
  return null;
}

export function formatTime(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' });
}

export function formatDateSeparator(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  if (d.toDateString() === today.toDateString()) return 'اليوم';
  if (d.toDateString() === yesterday.toDateString()) return 'أمس';
  return d.toLocaleDateString('ar-SA', { day: 'numeric', month: 'long', year: 'numeric' });
}

export function isSameDay(a: Date | string, b: Date | string): boolean {
  const da = typeof a === 'string' ? new Date(a) : a;
  const db = typeof b === 'string' ? new Date(b) : b;
  return da.toDateString() === db.toDateString();
}

export const fetcher = (url: string) => fetch(url).then((res) => {
  if (!res.ok) throw new Error('Failed to fetch');
  return res.json();
});
