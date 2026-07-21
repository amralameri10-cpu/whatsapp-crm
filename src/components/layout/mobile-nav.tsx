'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { MessageCircle, Users, GitMerge, Megaphone, Contact } from 'lucide-react';

export function MobileNav({ isTeamAdmin }: { isTeamAdmin: boolean }) {
  const pathname = usePathname();
  const items = [
    { href: '/dashboard/chat', label: 'محادثات', icon: MessageCircle },
    { href: '/dashboard/contacts', label: 'جهات اتصال', icon: Contact },
    ...(isTeamAdmin
      ? [
          { href: '/dashboard/automation', label: 'أتمتة', icon: GitMerge },
          { href: '/dashboard/settings', label: 'الفريق', icon: Users },
        ]
      : []),
  ];

  return (
    <nav className="md:hidden fixed bottom-0 inset-x-0 z-30 bg-white dark:bg-zinc-950 border-t border-zinc-200 dark:border-zinc-800 flex">
      {items.map(({ href, label, icon: Icon }) => {
        const active = pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            className={cn(
              'flex-1 flex flex-col items-center gap-1 py-2.5 text-[11px] font-medium',
              active ? 'text-emerald-600' : 'text-zinc-400'
            )}
          >
            <Icon className="h-5 w-5" />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
