import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/drizzle';
import { teamMembers, users, invitations } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { getUserContext } from '@/lib/db/queries';
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

export async function POST(req: NextRequest) {
  const ctx = await getUserContext();
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!ctx.isTeamAdmin) return NextResponse.json({ error: 'فقط المسؤول يمكنه دعوة موظفين' }, { status: 403 });

  const body = await req.json();
  const { email, role } = body;
  if (!email) return NextResponse.json({ error: 'البريد الإلكتروني مطلوب' }, { status: 400 });

  const existingUser = await db.query.users.findFirst({ where: eq(users.email, email) });
  if (existingUser) {
    const existingMember = await db.query.teamMembers.findFirst({ where: eq(teamMembers.userId, existingUser.id) });
    if (existingMember) return NextResponse.json({ error: 'هذا المستخدم منضم بالفعل' }, { status: 400 });
  }

  const token = randomUUID();
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  const [invite] = await db
    .insert(invitations)
    .values({ teamId: ctx.teamId, email, role: role || 'agent', token, expiresAt })
    .returning();

  return NextResponse.json({ success: true, invite, inviteUrl: `/login?token=${token}` });
}
