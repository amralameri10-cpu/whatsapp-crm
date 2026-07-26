import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/drizzle';
import { instances } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { getUserContext } from '@/lib/db/queries';
import { getEvolutionConfig, EvolutionClient } from '@/lib/whatsapp/evolution-client';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await getUserContext();
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const instance = await db.query.instances.findFirst({
    where: and(eq(instances.id, parseInt(id)), eq(instances.teamId, ctx.teamId)),
  });
  if (!instance) return NextResponse.json({ error: 'الرقم غير موجود' }, { status: 404 });

  const config = await getEvolutionConfig(ctx.teamId);
  if (!config.apiUrl || !config.apiKey) {
    return NextResponse.json({ error: 'Evolution API غير مضبوط' }, { status: 400 });
  }

  const client = new EvolutionClient(config.apiUrl, config.apiKey);

  try {
    // أولاً تحقق من الحالة
    const status = await client.getInstanceStatus(instance.instanceName);

    if (status === 'open') {
      // متصل بالفعل، حدّث قاعدة البيانات
      await db.update(instances).set({ status: 'open', updatedAt: new Date() }).where(eq(instances.id, instance.id));
      return NextResponse.json({ status: 'open', qr: null, message: 'الرقم متصل بالفعل' });
    }

    // اطلب QR
    const qr = await client.getQR(instance.instanceName);

    // حدّث الحالة
    await db
      .update(instances)
      .set({ status: 'connecting', updatedAt: new Date() })
      .where(eq(instances.id, instance.id));

    return NextResponse.json({ status: 'connecting', qr });
  } catch (e: any) {
    console.error('[Instance Connect]', e.message);
    return NextResponse.json({ error: e.message || 'فشل جلب رمز QR' }, { status: 500 });
  }
}
