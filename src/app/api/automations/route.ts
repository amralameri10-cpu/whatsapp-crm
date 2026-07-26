import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/drizzle';
import { automations } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { getUserContext } from '@/lib/db/queries';

export async function GET() {
  const ctx = await getUserContext();
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const rows = await db.select().from(automations).where(eq(automations.teamId, ctx.teamId));
  return NextResponse.json(rows);
}

export async function POST(req: NextRequest) {
  const ctx = await getUserContext();
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!ctx.isTeamAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const body = await req.json();
  const [row] = await db
    .insert(automations)
    .values({
      teamId: ctx.teamId,
      name: body.name || 'Flow جديد',
      isActive: false,
      triggerType: body.triggerType || 'keyword',
      triggerKeywords: body.triggerKeywords || [],
      nodes: body.nodes || [],
      edges: body.edges || [],
    })
    .returning();

  return NextResponse.json(row);
}
