import { redirect } from 'next/navigation';
import { getUserContext } from '@/lib/db/queries';
import { Sidebar } from '@/components/layout/sidebar';
import { MobileNav } from '@/components/layout/mobile-nav';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const ctx = await getUserContext();
  if (!ctx) redirect('/login');

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar
        userName={ctx.user.name || ''}
        userEmail={ctx.user.email}
        isSuperAdmin={ctx.isSuperAdmin}
        isTeamAdmin={ctx.isTeamAdmin}
      />
      <main className="flex-1 overflow-hidden pb-14 md:pb-0">{children}</main>
      <MobileNav isTeamAdmin={ctx.isTeamAdmin} />
    </div>
  );
}
