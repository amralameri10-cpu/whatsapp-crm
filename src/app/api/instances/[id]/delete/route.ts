import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/drizzle';
import { instances } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { getUserContext } from '@/lib/db/queries';
import { getEvolutionConfig, EvolutionClient } from '@/lib/whatsapp/evolution-client';

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await getUserContext();
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!ctx.isTeamAdmin) return NextResponse.json({ error: 'فقط المسؤول يمكنه الحذف' }, { status: 403 });

  const instance = await db.query.instances.findFirst({
    where: and(eq(instances.id, parseInt(id)), eq(instances.teamId, ctx.teamId)),
  });
  if (!instance) return NextResponse.json({ error: 'الرقم غير موجود' }, { status: 404 });

  // محاولة حذف من Evolution (لو فشلت نكمل بحذفها من DB)
  try {
    const config = await getEvolutionConfig(ctx.teamId);
    if (config.apiUrl && config.apiKey) {
      const client = new EvolutionClient(config.apiUrl, config.apiKey);
      await client.logoutInstance(instance.instanceName).catch(() => {});
      await client.deleteInstance(instance.instanceName).catch(() => {});
    }
  } catch (e) {
    console.warn('[Instance Delete - Evolution]', e);
  }

  // حذف من قاعدة البيانات دائماً
  await db.delete(instances).where(eq(instances.id, instance.id));

  return NextResponse.json({ success: true });
}
