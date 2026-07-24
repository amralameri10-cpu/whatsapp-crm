import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/drizzle';
import { teamMembers, users } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { getUserContext } from '@/lib/db/queries';

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const memberId = parseInt(id);

  const ctx = await getUserContext();
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!ctx.isTeamAdmin) return NextResponse.json({ error: 'فقط المسؤول يمكنه تعديل الأدوار' }, { status: 403 });

  const member = await db.query.teamMembers.findFirst({ where: and(eq(teamMembers.id, memberId), eq(teamMembers.teamId, ctx.teamId)) });
  if (!member) return NextResponse.json({ error: 'العضو غير موجود' }, { status: 404 });

  // Only super admin can edit other admins; team admin can edit agents only
  if (!ctx.isSuperAdmin && member.role !== 'agent' && member.userId !== ctx.user.id) {
    return NextResponse.json({ error: 'لا تملك صلاحية تعديل هذا العضو' }, { status: 403 });
  }

  const body = await req.json();
  const updates: Record<string, any> = {};

  if (typeof body.role === 'string' && ['admin', 'agent'].includes(body.role)) updates.role = body.role;
  if (typeof body.canSeePhone === 'boolean') updates.canSeePhone = body.canSeePhone;
  if (typeof body.requireApproval === 'boolean') updates.requireApproval = body.requireApproval;
  if (typeof body.canUseAI === 'boolean') updates.canUseAI = body.canUseAI;
  if (typeof body.canViewAllChats === 'boolean') updates.canViewAllChats = body.canViewAllChats;

  await db.update(teamMembers).set(updates).where(eq(teamMembers.id, memberId));

  return NextResponse.json({ success: true });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const memberId = parseInt(id);

  const ctx = await getUserContext();
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!ctx.isTeamAdmin) return NextResponse.json({ error: 'فقط المسؤول يمكنه حذف الأعضاء' }, { status: 403 });

  const member = await db.query.teamMembers.findFirst({ where: and(eq(teamMembers.id, memberId), eq(teamMembers.teamId, ctx.teamId)) });
  if (!member) return NextResponse.json({ error: 'العضو غير موجود' }, { status: 404 });
  if (member.userId === ctx.user.id) return NextResponse.json({ error: 'لا يمكنك حذف نفسك' }, { status: 400 });

  await db.delete(teamMembers).where(eq(teamMembers.id, memberId));

  return NextResponse.json({ success: true });
}
