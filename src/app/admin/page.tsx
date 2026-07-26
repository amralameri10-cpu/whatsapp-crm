import { getUserContext } from '@/lib/db/queries';
import { db } from '@/lib/db/drizzle';
import { settings } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { redirect } from 'next/navigation';
import { EvolutionSettingsForm } from '@/components/admin/evolution-settings-form';

export default async function AdminSettingsPage() {
  const ctx = await getUserContext();
  if (!ctx) redirect('/login');

  const [row] = await db.select().from(settings).where(eq(settings.teamId, ctx.teamId)).limit(1);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold">إعدادات الاتصال بالواتساب</h1>
        <p className="text-sm text-zinc-500 mt-1">بيانات سيرفر Evolution API المستخدم لربط أرقام الواتساب</p>
      </div>
      <EvolutionSettingsForm
        initial={{
          evolutionApiUrl: row?.evolutionApiUrl || '',
          evolutionApiKey: row?.evolutionApiKey || '',
          evolutionWebhookToken: row?.evolutionWebhookToken || '',
          pusherAppId: row?.pusherAppId || '',
          pusherKey: row?.pusherKey || '',
          pusherSecret: row?.pusherSecret || '',
          pusherCluster: row?.pusherCluster || '',
        }}
      />
    </div>
  );
}
