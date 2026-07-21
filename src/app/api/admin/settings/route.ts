import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/drizzle';
import { settings } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { getUserContext } from '@/lib/db/queries';

export async function PUT(req: NextRequest) {
  const ctx = await getUserContext();
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!ctx.isSuperAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const body = await req.json();

  const data = {
    evolutionApiUrl: body.evolutionApiUrl || null,
    evolutionApiKey: body.evolutionApiKey || null,
    evolutionWebhookToken: body.evolutionWebhookToken || null,
    pusherAppId: body.pusherAppId || null,
    pusherKey: body.pusherKey || null,
    pusherSecret: body.pusherSecret || null,
    pusherCluster: body.pusherCluster || null,
    updatedAt: new Date(),
  };

  const existing = await db.select().from(settings).where(eq(settings.teamId, ctx.teamId)).limit(1);

  if (existing.length > 0) {
    await db.update(settings).set(data).where(eq(settings.teamId, ctx.teamId));
  } else {
    await db.insert(settings).values({ teamId: ctx.teamId, ...data });
  }

  return NextResponse.json({ success: true });
}
