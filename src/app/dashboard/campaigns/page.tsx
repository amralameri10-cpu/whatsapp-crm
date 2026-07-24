'use client';

import useSWR from 'swr';
import { useState } from 'react';
import { fetcher } from '@/lib/utils';
import { Card, CardContent } from '@/components/ui/form-elements';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label, Textarea } from '@/components/ui/form-elements';
import { Select } from '@/components/ui/select';
import { Badge } from '@/components/ui/misc';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogClose } from '@/components/ui/dialog';
import { Megaphone, Plus, Loader2, Upload } from 'lucide-react';
import { toast } from 'sonner';

type CampaignItem = { id: number; name: string; status: string; totalLeads: number; sentCount: number; failedCount: number; createdAt: string };
type InstanceItem = { id: number; displayName: string | null; instanceName: string; status: string };

const statusLabels: Record<string, string> = { DRAFT: 'مسودة', SCHEDULED: 'مجدول', PROCESSING: 'جاري الإرسال', COMPLETED: 'مكتمل' };
const statusVariant: Record<string, 'secondary' | 'warning' | 'default' | 'destructive'> = {
  DRAFT: 'secondary', SCHEDULED: 'warning', PROCESSING: 'default', COMPLETED: 'secondary',
};

export default function CampaignsPage() {
  const { data, mutate, isLoading } = useSWR<CampaignItem[]>('/api/campaigns', fetcher);
  const { data: instances } = useSWR<InstanceItem[]>('/api/instances', fetcher);
  const [createOpen, setCreateOpen] = useState(false);

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-3xl mx-auto p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold">الحملات</h1>
            <p className="text-sm text-zinc-500 mt-1">إرسال رسائل جماعية لقائمة أرقام</p>
          </div>
          <Button size="sm" onClick={() => setCreateOpen(true)} className="gap-1.5">
            <Plus className="h-4 w-4" /> حملة جديدة
          </Button>
        </div>

        {isLoading && <div className="flex justify-center py-16"><Loader2 className="h-5 w-5 animate-spin text-zinc-400" /></div>}

        {!isLoading && !data?.length && (
          <div className="text-center py-16 text-zinc-400">
            <Megaphone className="h-10 w-10 mx-auto mb-2 opacity-40" />
            <p className="text-sm">لا توجد حملات بعد</p>
          </div>
        )}

        <div className="space-y-3">
          {data?.map((c) => (
            <Card key={c.id}>
              <CardContent className="flex items-center gap-4 py-4">
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm text-zinc-900 dark:text-zinc-50">{c.name}</p>
                  <p className="text-xs text-zinc-500 mt-0.5">
                    {c.sentCount}/{c.totalLeads} تم الإرسال · {c.failedCount} فشل
                  </p>
                </div>
                <Badge variant={statusVariant[c.status]}>{statusLabels[c.status] || c.status}</Badge>
                {c.status === 'DRAFT' && (
                  <Button size="sm" variant="outline" onClick={async () => {
                    await fetch(`/api/campaigns/${c.id}/start`, { method: 'POST' });
                    toast.success('بدأ الإرسال');
                    mutate();
                  }}>
                    ابدأ الإرسال
                  </Button>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {createOpen && instances && (
        <CreateCampaignDialog
          instances={instances}
          onClose={() => setCreateOpen(false)}
          onCreated={() => { mutate(); setCreateOpen(false); }}
        />
      )}
    </div>
  );
}

function CreateCampaignDialog({ instances, onClose, onCreated }: { instances: InstanceItem[]; onClose: () => void; onCreated: () => void }) {
  const [name, setName] = useState('');
  const [instanceId, setInstanceId] = useState('');
  const [messageText, setMessageText] = useState('');
  const [leadsText, setLeadsText] = useState('');
  const [busy, setBusy] = useState(false);

  async function handleSubmit() {
    setBusy(true);
    try {
      const leads = leadsText
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean)
        .map((phone) => ({ phone: phone.replace(/\D/g, '') }));

      const res = await fetch('/api/campaigns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, instanceId: parseInt(instanceId), messageText, leads }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error || 'فشل الإنشاء'); return; }
      toast.success('تم إنشاء الحملة');
      onCreated();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogClose onClick={onClose} />
        <DialogHeader><DialogTitle>حملة إرسال جديدة</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>اسم الحملة</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="مثال: عروض رمضان" />
          </div>
          <div className="space-y-1.5">
            <Label>رقم الواتساب (Instance)</Label>
            <Select value={instanceId} onChange={(e) => setInstanceId(e.target.value)}>
              <option value="">اختر رقماً...</option>
              {instances.map((i) => (
                <option key={i.id} value={i.id}>{i.displayName || i.instanceName}</option>
              ))}
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>نص الرسالة</Label>
            <Textarea
              value={messageText}
              onChange={(e) => setMessageText(e.target.value)}
              placeholder="اكتب الرسالة هنا..."
              rows={4}
            />
          </div>
          <div className="space-y-1.5">
            <Label>قائمة الأرقام (رقم في كل سطر)</Label>
            <Textarea
              value={leadsText}
              onChange={(e) => setLeadsText(e.target.value)}
              placeholder={"966501234567\n966509876543"}
              rows={5}
              dir="ltr"
            />
          </div>
          <Button className="w-full" onClick={handleSubmit} loading={busy} disabled={!name || !instanceId || !messageText || !leadsText}>
            إنشاء الحملة
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
