'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import {
  MessageCircle,
  Users,
  Settings,
  GitMerge,
  Megaphone,
  ShieldAlert,
  LogOut,
  Contact,
} from 'lucide-react';
import { signOut } from '@/app/login/actions';
import { Avatar } from '@/components/ui/misc';

type NavItem = { href: string; label: string; icon: any; show?: boolean };

export function Sidebar({
  userName,
  userEmail,
  isSuperAdmin,
  isTeamAdmin,
}: {
  userName: string;
  userEmail: string;
  isSuperAdmin: boolean;
  isTeamAdmin: boolean;
}) {
  const pathname = usePathname();

  const items: NavItem[] = [
    { href: '/dashboard/chat', label: 'المحادثات', icon: MessageCircle },
    { href: '/dashboard/contacts', label: 'جهات الاتصال', icon: Contact },
    { href: '/dashboard/automation', label: 'الأتمتة', icon: GitMerge, show: isTeamAdmin },
    { href: '/dashboard/campaigns', label: 'الحملات', icon: Megaphone, show: isTeamAdmin },
    { href: '/dashboard/settings', label: 'الموظفين والإعدادات', icon: Users, show: isTeamAdmin },
  ];

  return (
    <aside className="hidden md:flex w-64 shrink-0 flex-col border-l border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 h-screen sticky top-0">
      <div className="h-16 flex items-center gap-2.5 px-5 border-b border-zinc-200 dark:border-zinc-800">
        <div className="h-8 w-8 rounded-lg bg-emerald-600 flex items-center justify-center">
          <MessageCircle className="h-4 w-4 text-white" fill="white" />
        </div>
        <span className="font-bold text-zinc-900 dark:text-zinc-50">واتساب CRM</span>
      </div>

      <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
        {items.filter((i) => i.show !== false).map(({ href, label, icon: Icon }) => {
          const active = pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
                active
                  ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400'
                  : 'text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-900'
              )}
            >
              <Icon className="h-4 w-4" />
              {label}
            </Link>
          );
        })}

        {isSuperAdmin && (
          <>
            <div className="h-px bg-zinc-200 dark:bg-zinc-800 my-3" />
            <Link
              href="/admin"
              className={cn(
                'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
                pathname.startsWith('/admin')
                  ? 'bg-orange-50 text-orange-700 dark:bg-orange-900/20 dark:text-orange-400'
                  : 'text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-900'
              )}
            >
              <ShieldAlert className="h-4 w-4" />
              لوحة السوبر أدمن
            </Link>
          </>
        )}
      </nav>

      <div className="p-3 border-t border-zinc-200 dark:border-zinc-800">
        <div className="flex items-center gap-2.5 px-2 py-2">
          <Avatar name={userName || userEmail} size={32} />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-zinc-900 dark:text-zinc-50 truncate">{userName || userEmail}</p>
            <p className="text-xs text-zinc-500 truncate" dir="ltr">{userEmail}</p>
          </div>
          <form action={signOut}>
            <button type="submit" className="p-2 rounded-lg text-zinc-400 hover:bg-zinc-100 hover:text-red-600 dark:hover:bg-zinc-800">
              <LogOut className="h-4 w-4" />
            </button>
          </form>
        </div>
      </div>
    </aside>
  );
}
