import { getUserContext } from '@/lib/db/queries';
import { redirect } from 'next/navigation';
import { TeamSettingsClient } from '@/components/settings/team-settings-client';

export default async function SettingsPage() {
  const ctx = await getUserContext();
  if (!ctx) redirect('/login');
  if (!ctx.isTeamAdmin) redirect('/dashboard/chat');

  return (
    <TeamSettingsClient
      isSuperAdmin={ctx.isSuperAdmin}
      currentUserId={ctx.user.id}
    />
  );
}
