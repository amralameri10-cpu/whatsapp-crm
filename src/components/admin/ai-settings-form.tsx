'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/form-elements';
import { Input } from '@/components/ui/input';
import { Label, Textarea } from '@/components/ui/form-elements';
import { Select } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

type FormData = {
  provider: 'anthropic' | 'openai' | 'gemini';
  model: string;
  systemPrompt: string;
  temperature: number;
  maxTokens: number;
};

const providerDefaults: Record<string, string> = {
  anthropic: 'claude-sonnet-4-6',
  openai: 'gpt-4o-mini',
  gemini: 'gemini-2.0-flash',
};

export function AISettingsForm({ initial }: { initial: FormData }) {
  const [form, setForm] = useState(initial);
  const [busy, setBusy] = useState(false);

  function update<K extends keyof FormData>(key: K, value: FormData[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleSave() {
    setBusy(true);
    try {
      const res = await fetch('/api/admin/ai', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error || 'فشل الحفظ'); return; }
      toast.success('تم حفظ إعدادات الذكاء الاصطناعي');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>مزود الذكاء الاصطناعي</CardTitle>
        <CardDescription>أضف مفتاح API من مزودك المفضل في ملف .env</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="space-y-1.5">
          <Label>المزود</Label>
          <Select
            value={form.provider}
            onChange={(e) => {
              const p = e.target.value as FormData['provider'];
              update('provider', p);
              update('model', providerDefaults[p] || '');
            }}
          >
            <option value="anthropic">Anthropic Claude</option>
            <option value="openai">OpenAI GPT</option>
            <option value="gemini">Google Gemini</option>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label>النموذج</Label>
          <Input
            value={form.model}
            onChange={(e) => update('model', e.target.value)}
            dir="ltr"
            placeholder={providerDefaults[form.provider]}
          />
          <p className="text-xs text-zinc-500">
            {form.provider === 'anthropic' && 'مثال: claude-sonnet-4-6، claude-haiku-4-5-20251001'}
            {form.provider === 'openai' && 'مثال: gpt-4o-mini، gpt-4o'}
            {form.provider === 'gemini' && 'مثال: gemini-2.0-flash، gemini-1.5-pro'}
          </p>
        </div>

        <div className="space-y-1.5">
          <Label>System Prompt (شخصية المساعد)</Label>
          <Textarea
            value={form.systemPrompt}
            onChange={(e) => update('systemPrompt', e.target.value)}
            rows={5}
            placeholder="أنت مساعد خدمة عملاء ودود ومحترف. رد بإيجاز ووضوح باللغة العربية..."
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label>درجة الإبداعية ({form.temperature}%)</Label>
            <input
              type="range"
              min={0}
              max={100}
              value={form.temperature}
              onChange={(e) => update('temperature', Number(e.target.value))}
              className="w-full accent-emerald-600"
            />
            <div className="flex justify-between text-[10px] text-zinc-400">
              <span>دقيق</span>
              <span>إبداعي</span>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>أقصى طول للرد</Label>
            <Input
              type="number"
              value={form.maxTokens}
              onChange={(e) => update('maxTokens', Number(e.target.value))}
              min={100}
              max={4000}
            />
          </div>
        </div>

        <Button onClick={handleSave} loading={busy}>حفظ الإعدادات</Button>
      </CardContent>
    </Card>
  );
}
