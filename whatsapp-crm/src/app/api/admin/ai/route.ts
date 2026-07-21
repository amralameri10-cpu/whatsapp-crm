import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/drizzle';
import { aiConfig } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { getUserContext } from '@/lib/db/queries';

export async function PUT(req: NextRequest) {
  const ctx = await getUserContext();
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!ctx.isTeamAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const body = await req.json();

  const data = {
    provider: body.provider || 'anthropic',
    model: body.model || null,
    systemPrompt: body.systemPrompt || null,
    temperature: Number(body.temperature ?? 70),
    maxTokens: Number(body.maxTokens ?? 500),
    updatedAt: new Date(),
  };

  const existing = await db.select().from(aiConfig).where(eq(aiConfig.teamId, ctx.teamId)).limit(1);

  if (existing.length > 0) {
    await db.update(aiConfig).set(data).where(eq(aiConfig.teamId, ctx.teamId));
  } else {
    await db.insert(aiConfig).values({ teamId: ctx.teamId, ...data });
  }

  return NextResponse.json({ success: true });
}
