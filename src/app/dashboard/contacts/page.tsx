'use client';

import useSWR from 'swr';
import { fetcher } from '@/lib/utils';
import { Avatar, Badge } from '@/components/ui/misc';
import { Loader2, Contact as ContactIcon } from 'lucide-react';

type ContactItem = {
  id: number;
  name: string | null;
  phone: string | null;
  email: string | null;
  notes: string | null;
  chatId: number | null;
};

export default function ContactsPage() {
  const { data, isLoading } = useSWR<ContactItem[]>('/api/contacts', fetcher);

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-3xl mx-auto p-6">
        <h1 className="text-xl font-bold mb-6">جهات الاتصال</h1>

        {isLoading && (
          <div className="flex justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-zinc-400" />
          </div>
        )}

        {!isLoading && (!data || data.length === 0) && (
          <div className="text-center py-16 text-zinc-400">
            <ContactIcon className="h-10 w-10 mx-auto mb-2 opacity-40" />
            <p className="text-sm">لا توجد جهات اتصال بعد</p>
            <p className="text-xs mt-1">اضغط «مزامنة الآن» من الإعدادات لسحب جهات اتصال واتساب وأسمائها</p>
          </div>
        )}

        <div className="space-y-1">
          {data?.map((c) => (
            <div key={c.id} className="flex items-center gap-3 py-3 border-b border-zinc-100 dark:border-zinc-800 last:border-0">
              <Avatar name={c.name || c.phone || '?'} size={40} />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-zinc-900 dark:text-zinc-50">{c.name || c.phone || 'جهة اتصال'}</p>
                {c.phone && <p className="text-xs text-zinc-500" dir="ltr">{c.phone}</p>}
                {c.email && <p className="text-xs text-zinc-400" dir="ltr">{c.email}</p>}
              </div>
              {c.chatId && (
                <a href={`/dashboard/chat`} className="text-xs text-emerald-600 hover:underline">فتح المحادثة</a>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
