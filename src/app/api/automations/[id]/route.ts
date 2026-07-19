import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/drizzle';
import { automations } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { getUserContext } from '@/lib/db/queries';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await getUserContext();
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const [row] = await db
    .select()
    .from(automations)
    .where(and(eq(automations.id, parseInt(id)), eq(automations.teamId, ctx.teamId)));

  if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json(row);
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await getUserContext();
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!ctx.isTeamAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const body = await req.json();
  const updates: Record<string, any> = { updatedAt: new Date() };

  if (typeof body.isActive === 'boolean') updates.isActive = body.isActive;
  if (body.name) updates.name = body.name;
  if (body.triggerType) updates.triggerType = body.triggerType;
  if (body.triggerKeywords) updates.triggerKeywords = body.triggerKeywords;
  if (body.nodes) updates.nodes = body.nodes;
  if (body.edges) updates.edges = body.edges;

  await db.update(automations).set(updates).where(and(eq(automations.id, parseInt(id)), eq(automations.teamId, ctx.teamId)));

  return NextResponse.json({ success: true });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await getUserContext();
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!ctx.isTeamAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  await db.delete(automations).where(and(eq(automations.id, parseInt(id)), eq(automations.teamId, ctx.teamId)));
  return NextResponse.json({ success: true });
}
