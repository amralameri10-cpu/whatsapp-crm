import { db } from './drizzle';
import { users, teamMembers, team, instances } from './schema';
import { eq, and } from 'drizzle-orm';
import { getSession } from '@/lib/auth/session';
import { cache } from 'react';

export const getUser = cache(async () => {
  const session = await getSession();
  if (!session) return null;

  const [user] = await db.select().from(users).where(eq(users.id, session.userId)).limit(1);
  return user || null;
});

export const getCurrentMembership = cache(async () => {
  const user = await getUser();
  if (!user) return null;

  const [membership] = await db
    .select()
    .from(teamMembers)
    .where(eq(teamMembers.userId, user.id))
    .limit(1);

  return membership || null;
});

export const getUserContext = cache(async () => {
  const user = await getUser();
  if (!user) return null;

  let membership = await getCurrentMembership();
  
  // If user exists but has no team membership, auto-fix by creating/joining the team
  if (!membership) {
    const teamRow = await getOrCreateTeam();
    const [newMember] = await db
      .insert(teamMembers)
      .values({
        userId: user.id,
        teamId: teamRow.id,
        role: user.role === 'admin' ? 'owner' : 'agent',
        canSeePhone: user.role === 'admin',
        canViewAllChats: user.role === 'admin',
        canUseAI: user.role === 'admin',
      })
      .onConflictDoNothing()
      .returning();
    membership = newMember || null;
    
    // Try fetching again after insert
    if (!membership) {
      const [found] = await db
        .select()
        .from(teamMembers)
        .where(eq(teamMembers.userId, user.id))
        .limit(1);
      membership = found || null;
    }
  }

  if (!membership) return null;

  const isSuperAdmin = user.role === 'admin';
  const teamRole = membership.role;

  return {
    user,
    membership,
    teamId: membership.teamId,
    isSuperAdmin,
    teamRole,
    isTeamAdmin: isSuperAdmin || teamRole === 'owner' || teamRole === 'admin',
    canSeePhone: isSuperAdmin || teamRole === 'owner' || teamRole === 'admin' || membership.canSeePhone,
    canUseAI: isSuperAdmin || teamRole === 'owner' || teamRole === 'admin' || membership.canUseAI,
    canViewAllChats: isSuperAdmin || teamRole === 'owner' || teamRole === 'admin' || membership.canViewAllChats,
    requireApproval: membership.requireApproval,
  };
});

export async function getTeamInstances(teamId: number) {
  return db.select().from(instances).where(eq(instances.teamId, teamId));
}

export async function getOrCreateTeam() {
  const [existing] = await db.select().from(team).limit(1);
  if (existing) return existing;
  const [created] = await db.insert(team).values({ name: 'My Company' }).returning();
  return created;
}
