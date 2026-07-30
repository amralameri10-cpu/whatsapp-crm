'use client';

import useSWR from 'swr';
import { useState } from 'react';
import Link from 'next/link';
import { fetcher } from '@/lib/utils';
import { Card, CardContent } from '@/components/ui/form-elements';
import { Button } from '@/components/ui/button';
import { Badge, Switch } from '@/components/ui/misc';
import { GitMerge, Plus, Trash2, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

type AutomationItem = {
  id: number;
  name: string;
  isActive: boolean;
  triggerType: string;
  triggerKeywords: string[];
};

export default function AutomationPage() {
  const { data, mutate, isLoading } = useSWR<AutomationItem[]>('/api/automations', fetcher);

  async function handleToggle(id: number, isActive: boolean) {
    await fetch(`/api/automations/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isActive }),
    });
    mutate();
  }

  async function handleDelete(id: number) {
    if (!confirm('حذف هذا الـ Flow؟')) return;
    await fetch(`/api/automations/${id}`, { method: 'DELETE' });
    toast.success('تم الحذف');
    mutate();
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-3xl mx-auto p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold">الأتمتة</h1>
            <p className="text-sm text-zinc-500 mt-1">إنشاء ردود تلقائية وقواعد توجيه المحادثات</p>
          </div>
          <Link href="/dashboard/automation/new">
            <Button size="sm" className="gap-1.5">
              <Plus className="h-4 w-4" /> إنشاء Flow جديد
            </Button>
          </Link>
        </div>

        {isLoading && <div className="flex justify-center py-16"><Loader2 className="h-5 w-5 animate-spin text-zinc-400" /></div>}

        {!isLoading && !data?.length && (
          <div className="text-center py-16 text-zinc-400">
            <GitMerge className="h-10 w-10 mx-auto mb-2 opacity-40" />
            <p className="text-sm">لا توجد flows بعد</p>
          </div>
        )}

        <div className="space-y-3">
          {data?.map((a) => (
            <Card key={a.id}>
              <CardContent className="flex items-center gap-4 py-4">
                <GitMerge className="h-5 w-5 text-zinc-400 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm text-zinc-900 dark:text-zinc-50">{a.name}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <Badge variant="secondary" className="text-[11px]">
                      {a.triggerType === 'any_message' ? 'أي رسالة' : `كلمات مفتاحية: ${a.triggerKeywords.slice(0, 3).join(', ')}`}
                    </Badge>
                  </div>
                </div>
                <Switch checked={a.isActive} onCheckedChange={(v) => handleToggle(a.id, v)} />
                <Link href={`/dashboard/automation/${a.id}`}>
                  <Button size="sm" variant="outline">تعديل</Button>
                </Link>
                <Button size="icon" variant="ghost" onClick={() => handleDelete(a.id)} className="text-red-500 hover:bg-red-50">
                  <Trash2 className="h-4 w-4" />
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
