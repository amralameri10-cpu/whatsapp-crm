'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/form-elements';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/form-elements';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

type FormData = {
  evolutionApiUrl: string;
  evolutionApiKey: string;
  evolutionWebhookToken: string;
  pusherAppId: string;
  pusherKey: string;
  pusherSecret: string;
  pusherCluster: string;
};

export function EvolutionSettingsForm({ initial }: { initial: FormData }) {
  const [form, setForm] = useState(initial);
  const [busy, setBusy] = useState(false);

  function update(key: keyof FormData, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleSave() {
    setBusy(true);
    try {
      const res = await fetch('/api/admin/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || 'فشل الحفظ');
        return;
      }
      toast.success('تم حفظ الإعدادات بنجاح');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Evolution API</CardTitle>
          <CardDescription>سيرفر الاتصال بالواتساب (QR Code)</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Field label="رابط السيرفر" value={form.evolutionApiUrl} onChange={(v) => update('evolutionApiUrl', v)} placeholder="https://your-evolution-server.com" />
          <Field label="مفتاح API" value={form.evolutionApiKey} onChange={(v) => update('evolutionApiKey', v)} type="password" />
          <Field label="رمز الـ Webhook (اختياري)" value={form.evolutionWebhookToken} onChange={(v) => update('evolutionWebhookToken', v)} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Pusher (الإشعارات الفورية)</CardTitle>
          <CardDescription>لتحديث المحادثات لحظياً بدون تحديث الصفحة</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Field label="App ID" value={form.pusherAppId} onChange={(v) => update('pusherAppId', v)} />
          <Field label="Key" value={form.pusherKey} onChange={(v) => update('pusherKey', v)} />
          <Field label="Secret" value={form.pusherSecret} onChange={(v) => update('pusherSecret', v)} type="password" />
          <Field label="Cluster" value={form.pusherCluster} onChange={(v) => update('pusherCluster', v)} placeholder="eu" />
        </CardContent>
      </Card>

      <Button onClick={handleSave} loading={busy}>حفظ الإعدادات</Button>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  type = 'text',
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <Input value={value} onChange={(e) => onChange(e.target.value)} type={type} dir="ltr" placeholder={placeholder} />
    </div>
  );
}
