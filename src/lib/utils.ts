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

export function jidToPhone(jid: string): string {
  return jid.split('@')[0].split(':')[0];
}

export function phoneToJid(phone: string): string {
  const clean = phone.replace(/\D/g, '');
  return `${clean}@s.whatsapp.net`;
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
