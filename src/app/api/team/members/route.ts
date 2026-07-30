import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/drizzle';
import { teamMembers, users, invitations } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { getUserContext } from '@/lib/db/queries';
import { hashPassword } from '@/lib/auth/session';
import { randomUUID } from 'crypto';

export async function GET() {
  const ctx = await getUserContext();
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const members = await db
    .select({
      id: teamMembers.id,
      userId: teamMembers.userId,
      name: users.name,
      email: users.email,
      role: teamMembers.role,
      canSeePhone: teamMembers.canSeePhone,
      requireApproval: teamMembers.requireApproval,
      canUseAI: teamMembers.canUseAI,
      canViewAllChats: teamMembers.canViewAllChats,
      isSuperAdmin: users.role,
    })
    .from(teamMembers)
    .innerJoin(users, eq(teamMembers.userId, users.id))
    .where(eq(teamMembers.teamId, ctx.teamId));

  const pendingInvites = await db.select().from(invitations).where(eq(invitations.teamId, ctx.teamId));

  return NextResponse.json({
    members: members.map((m) => ({ ...m, isSuperAdmin: m.isSuperAdmin === 'admin' })),
    invitations: pendingInvites.filter((i) => !i.usedAt),
  });
}

/**
 * POST: Create a new team member directly with email/password.
 * No invitation system needed - just add the user to the team.
 */
export async function POST(req: NextRequest) {
  const ctx = await getUserContext();
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!ctx.isTeamAdmin) return NextResponse.json({ error: 'فقط المسؤول يمكنه إضافة موظفين' }, { status: 403 });

  const body = await req.json();
  const { email, password, name, role } = body;
  
  if (!email) return NextResponse.json({ error: 'البريد الإلكتروني مطلوب' }, { status: 400 });
  if (!password || password.length < 8) {
    return NextResponse.json({ error: 'كلمة المرور يجب أن تكون 8 أحرف على الأقل' }, { status: 400 });
  }

  const existingUser = await db.query.users.findFirst({ where: eq(users.email, email) });

  if (existingUser) {
    // User already exists - check if already a member
    const existingMember = await db.query.teamMembers.findFirst({ 
      where: eq(teamMembers.userId, existingUser.id),
    });
    if (existingMember) {
      return NextResponse.json({ error: 'هذا المستخدم منضم بالفعل' }, { status: 400 });
    }
    // Add existing user to team
    await db.insert(teamMembers).values({
      userId: existingUser.id,
      teamId: ctx.teamId,
      role: role || 'agent',
      canSeePhone: role === 'admin' || role === 'owner',
      canViewAllChats: role === 'admin' || role === 'owner',
    });
    return NextResponse.json({ success: true, member: { userId: existingUser.id, email, name: existingUser.name || email } });
  }

  // Create new user with password
  const passwordHash = await hashPassword(password);
  const [newUser] = await db
    .insert(users)
    .values({ 
      email, 
      name: name || email.split('@')[0], 
      passwordHash, 
      role: 'member' 
    })
    .returning();

  await db.insert(teamMembers).values({
    userId: newUser.id,
    teamId: ctx.teamId,
    role: role || 'agent',
    canSeePhone: role === 'admin' || role === 'owner',
    canViewAllChats: role === 'admin' || role === 'owner',
  });

  return NextResponse.json({ 
    success: true, 
    member: { userId: newUser.id, email, name: newUser.name } 
  });
}
