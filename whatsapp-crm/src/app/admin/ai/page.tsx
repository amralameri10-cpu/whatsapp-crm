import { getUserContext } from '@/lib/db/queries';
import { db } from '@/lib/db/drizzle';
import { aiConfig } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { redirect } from 'next/navigation';
import { AISettingsForm } from '@/components/admin/ai-settings-form';

export default async function AdminAIPage() {
  const ctx = await getUserContext();
  if (!ctx) redirect('/login');

  const [row] = await db.select().from(aiConfig).where(eq(aiConfig.teamId, ctx.teamId)).limit(1);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold">إعدادات الذكاء الاصطناعي</h1>
        <p className="text-sm text-zinc-500 mt-1">اختر مزود AI والنموذج وبرمجة الشخصية</p>
      </div>
      <AISettingsForm
        initial={{
          provider: (row?.provider as any) || 'anthropic',
          model: row?.model || '',
          systemPrompt: row?.systemPrompt || '',
          temperature: row?.temperature ?? 70,
          maxTokens: row?.maxTokens ?? 500,
        }}
      />
    </div>
  );
}
