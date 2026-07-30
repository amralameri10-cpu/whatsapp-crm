import { NextResponse } from 'next/server';
import { db } from '@/lib/db/drizzle';
import { contacts } from '@/lib/db/schema';
import { asc, eq } from 'drizzle-orm';
import { getUserContext } from '@/lib/db/queries';
import { cleanDisplayName } from '@/lib/utils';

export async function GET() {
  const ctx = await getUserContext();
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const rows = await db
    .select()
    .from(contacts)
    .where(eq(contacts.teamId, ctx.teamId))
    .orderBy(asc(contacts.name), asc(contacts.phone));

  const seenPhones = new Set<string>();
  const result = rows
    .map((contact) => ({
      ...contact,
      normalizedPhone: String(contact.phone || '').replace(/\D/g, ''),
    }))
    .filter((contact) => contact.normalizedPhone.length >= 5 && !seenPhones.has(contact.normalizedPhone))
    .map(({ normalizedPhone, ...contact }) => {
      seenPhones.add(normalizedPhone);
      return {
        ...contact,
        name: cleanDisplayName(contact.name) || (ctx.canSeePhone ? normalizedPhone : 'جهة اتصال'),
        phone: ctx.canSeePhone ? normalizedPhone : null,
      };
    });

  return NextResponse.json(result);
}
