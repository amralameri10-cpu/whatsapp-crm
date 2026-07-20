import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/drizzle';
import { campaigns, campaignLeads, instances } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { getUserContext } from '@/lib/db/queries';

export async function GET() {
  const ctx = await getUserContext();
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const rows = await db.select().from(campaigns).where(eq(campaigns.teamId, ctx.teamId));
  return NextResponse.json(rows);
}

export async function POST(req: NextRequest) {
  const ctx = await getUserContext();
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!ctx.isTeamAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const body = await req.json();
  const { name, instanceId, messageText, leads } = body;

  if (!name || !instanceId || !messageText || !leads?.length) {
    return NextResponse.json({ error: 'بيانات ناقصة' }, { status: 400 });
  }

  const instance = await db.query.instances.findFirst({ where: eq(instances.id, parseInt(instanceId)) });
  if (!instance || instance.teamId !== ctx.teamId) {
    return NextResponse.json({ error: 'الـ instance غير موجود' }, { status: 404 });
  }

  const [campaign] = await db
    .insert(campaigns)
    .values({ teamId: ctx.teamId, instanceId: parseInt(instanceId), name, messageText, totalLeads: leads.length })
    .returning();

  if (leads.length > 0) {
    await db.insert(campaignLeads).values(
      leads.map((l: any) => ({ campaignId: campaign.id, phone: l.phone, variables: l.variables || {} }))
    );
  }

  return NextResponse.json(campaign);
}
