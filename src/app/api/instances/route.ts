import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/drizzle';
import { instances } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { getUserContext } from '@/lib/db/queries';
import { getEvolutionClient, getEvolutionConfig } from '@/lib/whatsapp/evolution-client';

export async function GET() {
  const ctx = await getUserContext();
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const rows = await db.select().from(instances).where(eq(instances.teamId, ctx.teamId));
  return NextResponse.json(rows);
}

export async function POST(req: NextRequest) {
  const ctx = await getUserContext();
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!ctx.isTeamAdmin) return NextResponse.json({ error: 'فقط المسؤول يمكنه إضافة أرقام' }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const { displayName } = body;
  if (!displayName?.trim()) return NextResponse.json({ error: 'الاسم مطلوب' }, { status: 400 });

  const config = await getEvolutionConfig(ctx.teamId);
  if (!config.apiUrl || !config.apiKey) {
    return NextResponse.json({
      error: 'لم يتم إعداد Evolution API بعد. اذهب لأيقونة السوبر أدمن من القائمة الجانبية ← إعدادات.'
    }, { status: 400 });
  }

  // اسم Instance: فريد وقصير
  const slug = `t${ctx.teamId}_${Date.now().toString(36)}`;

  // webhook URL - يجب أن يكون HTTPS في الإنتاج
  const webhookUrl = process.env.PUBLIC_WEBHOOK_URL
    || `${req.nextUrl.origin}/api/webhook/evolution`;

  const client = new (await import('@/lib/whatsapp/evolution-client').then(m => m.EvolutionClient))(
    config.apiUrl,
    config.apiKey
  );

  try {
    const created = await client.createInstance(slug, webhookUrl);

    /*
      Evolution v2 response:
      {
        instance: { instanceName, instanceId, ... },
        hash: { apikey: "..." },       ← instance-specific token
        qrcode: { base64: "data:..." } ← QR مباشرة لو byEvents: false
      }
    */
    const instanceId: string = created.instance?.instanceId || created.instance?.id || slug;

    // استخراج الـ token بطريقة دفاعية
    let accessToken: string | null = null;
    if (typeof created.hash === 'string') {
      accessToken = created.hash;
    } else if (created.hash?.apikey) {
      accessToken = created.hash.apikey;
    }

    // QR قد يكون موجوداً في الـ response المباشر (byEvents: false)
    // أو يصل لاحقاً عبر webhook QRCODE_UPDATED (byEvents: true)
    const qrFromCreate = created.qrcode?.base64 || created.base64 || null;

    // حفظ في قاعدة البيانات
    const [row] = await db
      .insert(instances)
      .values({
        teamId: ctx.teamId,
        instanceName: slug,
        displayName: displayName.trim(),
        accessToken,
        status: 'connecting',
      })
      .returning();

    // لو ما فيه QR في الـ response، اطلب connect
    let qr = qrFromCreate;
    if (!qr) {
      qr = await client.getQR(slug);
    }

    return NextResponse.json({ success: true, instance: row, qr, instanceId });
  } catch (e: any) {
    console.error('[Instance Create]', e.message);
    return NextResponse.json({ error: e.message || 'فشل إنشاء الرقم على Evolution API' }, { status: 500 });
  }
}
