import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/drizzle';
import { campaigns, campaignLeads, instances } from '@/lib/db/schema';
import { eq, and, sql } from 'drizzle-orm';
import { getUserContext } from '@/lib/db/queries';
import { getEvolutionConfig, EvolutionClient } from '@/lib/whatsapp/evolution-client';

const DELAY_MS = 600;

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await getUserContext();
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!ctx.isTeamAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const campaign = await db.query.campaigns.findFirst({ where: and(eq(campaigns.id, parseInt(id)), eq(campaigns.teamId, ctx.teamId)) });
  if (!campaign) return NextResponse.json({ error: 'الحملة غير موجودة' }, { status: 404 });
  if (campaign.status !== 'DRAFT') return NextResponse.json({ error: 'الحملة ليست في حالة مسودة' }, { status: 400 });

  const instance = await db.query.instances.findFirst({ where: eq(instances.id, campaign.instanceId) });
  if (!instance) return NextResponse.json({ error: 'الـ instance غير موجود' }, { status: 404 });

  await db.update(campaigns).set({ status: 'PROCESSING' }).where(eq(campaigns.id, campaign.id));

  // Run in background (no await)
  processCampaign(campaign, instance, ctx.teamId).catch(console.error);

  return NextResponse.json({ success: true, message: 'بدأ الإرسال في الخلفية' });
}

async function processCampaign(campaign: any, instance: any, teamId: number) {
  const leads = await db.select().from(campaignLeads).where(and(eq(campaignLeads.campaignId, campaign.id), eq(campaignLeads.status, 'PENDING')));

  let sent = 0, failed = 0;

  try {
    const config = await getEvolutionConfig(teamId);
    const client = new EvolutionClient(config.apiUrl, config.apiKey);

    for (const lead of leads) {
      try {
        const vars = (lead.variables as Record<string, string>) || {};
        const text = campaign.messageText.replace(/\{(\w+)\}/g, (_: string, k: string) => vars[k] || `{${k}}`);

        await client.sendText(instance.instanceName, lead.phone, text);
        await db.update(campaignLeads).set({ status: 'SENT' }).where(eq(campaignLeads.id, lead.id));
        sent++;
      } catch {
        await db.update(campaignLeads).set({ status: 'FAILED', error: 'فشل الإرسال' }).where(eq(campaignLeads.id, lead.id));
        failed++;
      }
      await new Promise((r) => setTimeout(r, DELAY_MS));
    }
  } finally {
    await db.update(campaigns).set({
      status: 'COMPLETED',
      sentCount: sql`${campaigns.sentCount} + ${sent}`,
      failedCount: sql`${campaigns.failedCount} + ${failed}`,
    }).where(eq(campaigns.id, campaign.id));
  }
}
