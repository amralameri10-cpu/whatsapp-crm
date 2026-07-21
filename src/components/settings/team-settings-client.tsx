'use client';

import useSWR from 'swr';
import { useState } from 'react';
import { fetcher, cn } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/form-elements';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/form-elements';
import { Select } from '@/components/ui/select';
import { Avatar, Badge, Switch } from '@/components/ui/misc';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogClose } from '@/components/ui/dialog';
import { UserPlus, Trash2, Shield, Eye, Lock, Bot, Layers, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { InstancesPanel } from './instances-panel';

type Member = {
  id: number;
  userId: number;
  name: string | null;
  email: string;
  role: 'owner' | 'admin' | 'agent';
  canSeePhone: boolean;
  requireApproval: boolean;
  canUseAI: boolean;
  canViewAllChats: boolean;
  isSuperAdmin: boolean;
};

const roleLabels: Record<string, string> = { owner: 'مالك (سوبر أدمن)', admin: 'أدمن', agent: 'موظف' };
const roleBadgeColors: Record<string, 'default' | 'warning' | 'secondary'> = { owner: 'default', admin: 'warning', agent: 'secondary' };

export function TeamSettingsClient({ isSuperAdmin, currentUserId }: { isSuperAdmin: boolean; currentUserId: number }) {
  const { data, mutate, isLoading } = useSWR<{ members: Member[]; invitations: any[] }>('/api/team/members', fetcher);
  const [addMemberOpen, setAddMemberOpen] = useState(false);
  const [editMember, setEditMember] = useState<Member | null>(null);

  async function handleDelete(memberId: number) {
    if (!confirm('هل أنت متأكد من حذف هذا الموظف؟')) return;
    const res = await fetch(`/api/team/members/${memberId}`, { method: 'DELETE' });
    if (!res.ok) {
      const d = await res.json();
      toast.error(d.error || 'فشل الحذف');
      return;
    }
    toast.success('تم حذف الموظف');
    mutate();
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-4xl mx-auto p-4 md:p-8 space-y-8">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">الموظفين والإعدادات</h1>
          <p className="text-sm text-zinc-500 mt-1">إدارة فريقك وصلاحيات كل موظف</p>
        </div>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>الفريق</CardTitle>
              <CardDescription>الموظفون المسجلون وأدوارهم</CardDescription>
            </div>
            <Button size="sm" onClick={() => setAddMemberOpen(true)} className="gap-1.5">
              <UserPlus className="h-4 w-4" />
              إضافة موظف
            </Button>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-zinc-400" /></div>
            ) : (
              <div className="space-y-1">
                {data?.members.map((m) => (
                  <div key={m.id} className="flex items-center gap-3 py-3 border-b border-zinc-100 dark:border-zinc-800 last:border-0">
                    <Avatar name={m.name || m.email} size={38} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium text-zinc-900 dark:text-zinc-50 truncate">{m.name || m.email}</p>
                        {m.isSuperAdmin && <Badge variant="default">سوبر أدمن</Badge>}
                      </div>
                      <p className="text-xs text-zinc-500 truncate" dir="ltr">{m.email}</p>
                    </div>
                    <Badge variant={roleBadgeColors[m.role]}>{roleLabels[m.role]}</Badge>
                    <div className="flex items-center gap-1">
                      <Button size="sm" variant="ghost" onClick={() => setEditMember(m)}>
                        <Shield className="h-4 w-4" />
                      </Button>
                      {m.userId !== currentUserId && (
                        <Button size="sm" variant="ghost" onClick={() => handleDelete(m.id)} className="text-red-500 hover:bg-red-50">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <InstancesPanel />
      </div>

      {addMemberOpen && <AddMemberDialog onClose={() => setAddMemberOpen(false)} onAdded={() => { mutate(); setAddMemberOpen(false); }} />}
      {editMember && (
        <PermissionsDialog
          member={editMember}
          isSuperAdmin={isSuperAdmin}
          onClose={() => setEditMember(null)}
          onSaved={() => { mutate(); setEditMember(null); }}
        />
      )}
    </div>
  );
}

function AddMemberDialog({ onClose, onAdded }: { onClose: () => void; onAdded: () => void }) {
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('agent');
  const [busy, setBusy] = useState(false);

  async function handleSubmit() {
    setBusy(true);
    try {
      const res = await fetch('/api/team/members', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, name, password, role }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || 'فشل إضافة الموظف');
        return;
      }
      toast.success('تم إضافة الموظف بنجاح');
      onAdded();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent>
        <DialogClose onClick={onClose} />
        <DialogHeader>
          <DialogTitle>إضافة موظف جديد</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>البريد الإلكتروني</Label>
            <Input value={email} onChange={(e) => setEmail(e.target.value)} type="email" dir="ltr" placeholder="agent@example.com" />
          </div>

          <div className="space-y-1.5">
            <Label>الاسم</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="اسم الموظف" />
          </div>

          <div className="space-y-1.5">
            <Label>كلمة المرور</Label>
            <Input value={password} onChange={(e) => setPassword(e.target.value)} type="password" dir="ltr" placeholder="••••••••" minLength={8} />
          </div>

          <div className="space-y-1.5">
            <Label>الدور</Label>
            <Select value={role} onChange={(e) => setRole(e.target.value)}>
              <option value="agent">موظف</option>
              <option value="admin">أدمن</option>
            </Select>
          </div>

          <Button className="w-full" onClick={handleSubmit} loading={busy} disabled={!email || !password || password.length < 8}>
            إضافة الموظف
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function PermissionsDialog({
  member,
  isSuperAdmin,
  onClose,
  onSaved,
}: {
  member: Member;
  isSuperAdmin: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [role, setRole] = useState(member.role);
  const [canSeePhone, setCanSeePhone] = useState(member.canSeePhone);
  const [requireApproval, setRequireApproval] = useState(member.requireApproval);
  const [canUseAI, setCanUseAI] = useState(member.canUseAI);
  const [canViewAllChats, setCanViewAllChats] = useState(member.canViewAllChats);
  const [busy, setBusy] = useState(false);

  const isElevated = role === 'admin' || role === 'owner';

  async function handleSave() {
    setBusy(true);
    try {
      const res = await fetch(`/api/team/members/${member.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          role: role === 'owner' ? undefined : role,
          canSeePhone,
          requireApproval,
          canUseAI,
          canViewAllChats,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || 'فشل الحفظ');
        return;
      }
      toast.success('تم تحديث الصلاحيات');
      onSaved();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent>
        <DialogClose onClick={onClose} />
        <DialogHeader>
          <DialogTitle>صلاحيات {member.name || member.email}</DialogTitle>
        </DialogHeader>

        <div className="space-y-5">
          {member.role !== 'owner' && (
            <div className="space-y-1.5">
              <Label>الدور</Label>
              <Select value={role} onChange={(e) => setRole(e.target.value as any)}>
                <option value="agent">موظف (Agent)</option>
                {isSuperAdmin && <option value="admin">أدمن (Admin)</option>}
              </Select>
            </div>
          )}

          {!isElevated && (
            <div className="space-y-3 rounded-xl border border-zinc-200 dark:border-zinc-800 p-4">
              <PermissionRow
                icon={<Eye className="h-4 w-4 text-sky-500" />}
                label="رؤية رقم الهاتف"
                description="إظهار رقم العميل الكامل للموظف"
                checked={canSeePhone}
                onChange={setCanSeePhone}
              />
              <PermissionRow
                icon={<Lock className="h-4 w-4 text-amber-500" />}
                label="يحتاج موافقة قبل الإرسال"
                description="كل رد يكتبه هذا الموظف يحتاج موافقة الأدمن أولاً"
                checked={requireApproval}
                onChange={setRequireApproval}
              />
              <PermissionRow
                icon={<Bot className="h-4 w-4 text-violet-500" />}
                label="استخدام الذكاء الاصطناعي"
                description="السماح له باقتراح ردود بالذكاء الاصطناعي"
                checked={canUseAI}
                onChange={setCanUseAI}
              />
              <PermissionRow
                icon={<Layers className="h-4 w-4 text-emerald-500" />}
                label="رؤية كل المحادثات"
                description="بدلاً من المحادثات المعينة له فقط"
                checked={canViewAllChats}
                onChange={setCanViewAllChats}
              />
            </div>
          )}

          {isElevated && (
            <p className="text-sm text-zinc-500 bg-zinc-50 dark:bg-zinc-900 p-3 rounded-lg">
              الأدمن لديه كل الصلاحيات تلقائياً (رؤية الأرقام، الموافقات، الذكاء الاصطناعي، كل المحادثات).
            </p>
          )}

          <Button className="w-full" onClick={handleSave} loading={busy}>
            حفظ التغييرات
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function PermissionRow({
  icon,
  label,
  description,
  checked,
  onChange,
}: {
  icon: React.ReactNode;
  label: string;
  description: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center gap-3">
      {icon}
      <div className="flex-1">
        <p className="text-sm font-medium text-zinc-900 dark:text-zinc-50">{label}</p>
        <p className="text-xs text-zinc-500">{description}</p>
      </div>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}
