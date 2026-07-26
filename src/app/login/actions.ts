'use server';

import { db } from '@/lib/db/drizzle';
import { users, teamMembers, team as teamTable, invitations, activityLogs } from '@/lib/db/schema';
import { eq, and, gt } from 'drizzle-orm';
import { comparePasswords, hashPassword, setSession, clearSession } from '@/lib/auth/session';
import { redirect } from 'next/navigation';
import { getOrCreateTeam } from '@/lib/db/queries';

export type ActionState = { error?: string; success?: string };

export async function signIn(_: ActionState, formData: FormData): Promise<ActionState> {
  const email = String(formData.get('email') || '').trim().toLowerCase();
  const password = String(formData.get('password') || '');

  if (!email || !password) return { error: 'الرجاء إدخال البريد وكلمة المرور' };

  const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (!user) return { error: 'بيانات الدخول غير صحيحة' };

  const valid = await comparePasswords(password, user.passwordHash);
  if (!valid) return { error: 'بيانات الدخول غير صحيحة' };

  await setSession(user.id);
  await db.insert(activityLogs).values({ userId: user.id, action: 'sign_in' });

  redirect('/dashboard/chat');
}

export async function signUp(_: ActionState, formData: FormData): Promise<ActionState> {
  const email = String(formData.get('email') || '').trim().toLowerCase();
  const password = String(formData.get('password') || '');
  const name = String(formData.get('name') || '').trim();
  const inviteToken = String(formData.get('token') || '');

  if (!email || !password || password.length < 8) {
    return { error: 'كلمة المرور يجب أن تكون 8 أحرف على الأقل' };
  }

  const [existing] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (existing) return { error: 'هذا البريد مسجل بالفعل' };

  const passwordHash = await hashPassword(password);

  if (inviteToken) {
    // ─── Invitation signup (legacy support) ────────────────────────────────
    const [invite] = await db
      .select()
      .from(invitations)
      .where(and(eq(invitations.token, inviteToken), eq(invitations.email, email)))
      .limit(1);

    if (!invite || invite.usedAt || invite.expiresAt < new Date()) {
      return { error: 'رابط الدعوة غير صالح أو منتهي' };
    }

    const [newUser] = await db.insert(users).values({ email, name, passwordHash, role: 'member' }).returning();

    await db.insert(teamMembers).values({
      userId: newUser.id,
      teamId: invite.teamId,
      role: invite.role,
      canSeePhone: invite.role === 'admin' || invite.role === 'owner',
      canViewAllChats: invite.role === 'admin' || invite.role === 'owner',
    });

    await db.update(invitations).set({ usedAt: new Date() }).where(eq(invitations.id, invite.id));
    await setSession(newUser.id);
    redirect('/dashboard/chat');
  }

  // ─── Direct signup (no invitation needed) ────────────────────────────────
  // If a team exists, auto-join it. If no team, create one and become owner.
  const existingTeam = await db.select().from(teamTable).limit(1);

  const [newUser] = await db.insert(users).values({ email, name, passwordHash, role: 'member' }).returning();

  if (existingTeam.length > 0) {
    // Join the existing team as agent
    await db.insert(teamMembers).values({
      userId: newUser.id,
      teamId: existingTeam[0].id,
      role: 'agent',
    }).onConflictDoNothing();
  } else {
    // No team exists: create one and become owner
    const myTeam = await getOrCreateTeam();
    await db.insert(teamMembers).values({
      userId: newUser.id,
      teamId: myTeam.id,
      role: 'owner',
      canSeePhone: true,
      canViewAllChats: true,
      canUseAI: true,
    });
    await db.insert(activityLogs).values({ teamId: myTeam.id, userId: newUser.id, action: 'system_setup' });
  }

  await setSession(newUser.id);
  redirect('/dashboard/chat');
}

export async function signOut() {
  await clearSession();
  redirect('/login');
}
