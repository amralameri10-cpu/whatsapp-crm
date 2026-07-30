import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  const checks: Record<string, { ok: boolean; message: string }> = {};

  // 1. تحقق من DATABASE_URL
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    checks.database = { ok: false, message: 'DATABASE_URL غير موجود في متغيرات البيئة' };
  } else {
    // حاول اتصال حقيقي
    try {
      const { db } = await import('@/lib/db/drizzle');
      await db.execute('SELECT 1 AS ok');
      checks.database = { ok: true, message: 'الاتصال بقاعدة البيانات يعمل' };
    } catch (err: any) {
      checks.database = { ok: false, message: `فشل الاتصال: ${err?.message}` };
    }
  }

  // 2. تحقق من AUTH_SECRET
  checks.auth = {
    ok: !!process.env.AUTH_SECRET,
    message: process.env.AUTH_SECRET ? 'AUTH_SECRET موجود' : 'AUTH_SECRET غير موجود — الجلسات لن تعمل',
  };

  // 3. تحقق من Evolution API
  checks.evolution = {
    ok: !!(process.env.EVOLUTION_API_URL && process.env.AUTHENTICATION_API_KEY),
    message: process.env.EVOLUTION_API_URL
      ? 'EVOLUTION_API_URL موجود'
      : 'EVOLUTION_API_URL غير موجود — يمكن ضبطه من لوحة الإدارة',
  };

  const allOk = Object.values(checks).every((c) => c.ok);

  return NextResponse.json(
    {
      status: allOk ? 'ok' : 'degraded',
      timestamp: new Date().toISOString(),
      checks,
      node: process.version,
      env: process.env.NODE_ENV,
    },
    { status: allOk ? 200 : 503 },
  );
}
