import { getUserContext } from '@/lib/db/queries';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { ShieldAlert, Settings, Bot, Users, ArrowRight } from 'lucide-react';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const ctx = await getUserContext();
  if (!ctx) redirect('/login');
  if (!ctx.isSuperAdmin) redirect('/dashboard/chat');

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      <header className="h-16 flex items-center gap-3 px-6 border-b border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900">
        <Link href="/dashboard/chat" className="p-2 -mr-2 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800">
          <ArrowRight className="h-4 w-4" />
        </Link>
        <ShieldAlert className="h-5 w-5 text-orange-600" />
        <span className="font-bold">لوحة السوبر أدمن</span>

        <nav className="flex items-center gap-1 mr-auto">
          <Link href="/admin" className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800">
            <Settings className="h-3.5 w-3.5" /> الإعدادات العامة
          </Link>
          <Link href="/admin/ai" className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800">
            <Bot className="h-3.5 w-3.5" /> الذكاء الاصطناعي
          </Link>
        </nav>
      </header>
      <main className="max-w-3xl mx-auto p-6">{children}</main>
    </div>
  );
}
