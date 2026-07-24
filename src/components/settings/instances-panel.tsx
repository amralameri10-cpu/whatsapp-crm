'use client';

import useSWR from 'swr';
import { useState, useEffect } from 'react';
import { fetcher } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/form-elements';
import { Button } from '@/components/ui/button';
import { Badge, Avatar } from '@/components/ui/misc';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogClose } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/form-elements';
import { Plus, Smartphone, Trash2, Loader2, QrCode, RefreshCw, Wifi, WifiOff, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import { useSSE } from '@/hooks/use-sse';

type InstanceItem = {
  id: number;
  instanceName: string;
  displayName: string | null;
  phoneNumber: string | null;
  status: string;
  profilePicUrl: string | null;
};

type QRState = {
  instanceId: number;
  instanceName: string;
  qr: string;
};

export function InstancesPanel() {
  const { data: instances, mutate, isLoading } = useSWR<InstanceItem[]>('/api/instances', fetcher, {
    refreshInterval: 8000, // كل 8 ثواني تحديث تلقائي
  });
  const [createOpen, setCreateOpen] = useState(false);
  const [qrState, setQrState] = useState<QRState | null>(null);
  const [connectingId, setConnectingId] = useState<number | null>(null);

  // استقبال QR من Pusher عند QRCODE_UPDATED
  useSSE({
    'qr-update': (data: { instanceId: number; instanceName: string; qr: string }) => {
      // لو الديالوج مفتوح لهذا الـ instance، حدّث الـ QR
      setQrState((prev) => {
        if (prev && prev.instanceId === data.instanceId) {
          return { ...prev, qr: data.qr };
        }
        return prev;
      });
    },
    'instance-update': (data: { instanceId: number; status: string }) => {
      mutate((cur) =>
        cur?.map((i) =>
          i.id === data.instanceId ? { ...i, status: data.status } : i
        ),
        false
      );
      // لو اتصل، أغلق ديالوج QR وابدأ المزامنة
      if (data.status === 'open') {
        setQrState((prev) => (prev?.instanceId === data.instanceId ? null : prev));
        toast.success('✅ تم الاتصال بواتساب بنجاح!');
        // ابدأ مزامنة المحادثات تلقائياً
        setTimeout(() => {
          toast.loading('جاري تحميل المحادثات...');
          fetch(`/api/instances/${data.instanceId}/sync`, { method: 'POST' })
            .then((res) => res.json())
            .then((result) => {
              toast.dismiss();
              if (result.success) {
                  toast.success(`تمت المزامنة: ${result.synced || 0} محادثة، ${result.contacts || 0} جهة اتصال، ${result.messages || 0} رسالة`);
              } else {
                toast.error(result.error || 'فشل تحميل المحادثات');
              }
            })
            .catch((err) => {
              toast.dismiss();
              toast.error('خطأ في تحميل المحادثات');
              console.error(err);
            });
        }, 1000);
      }
    },
  });

  async function handleSync(id: number) {
    toast.loading('جاري مزامنة المحادثات...');
    const res = await fetch(`/api/instances/${id}/sync`, { method: 'POST' });
    const data = await res.json();
    toast.dismiss();
    if (!res.ok) {
      toast.error(data.error || 'فشلت المزامنة');
    } else {
      const repaired = data.repaired ? `، وإصلاح ${data.repaired} سجل قديم` : '';
      toast.success(`تمت المزامنة: ${data.synced || 0} محادثة، ${data.contacts || 0} جهة اتصال، ${data.messages || 0} رسالة${repaired}`);
    }
  }

  async function handleConnect(inst: InstanceItem) {
    setConnectingId(inst.id);
    try {
      const res = await fetch(`/api/instances/${inst.id}/connect`, { method: 'POST' });
      const data = await res.json();

      if (!res.ok) {
        toast.error(data.error || 'فشل جلب رمز QR');
        return;
      }

      if (data.status === 'open') {
        toast.success('الرقم متصل بالفعل');
        mutate();
        return;
      }

      if (data.qr) {
        setQrState({ instanceId: inst.id, instanceName: inst.instanceName, qr: data.qr });
      } else {
        toast.info('جاري تجهيز رمز QR، انتظر لحظة...');
        // QR سيصل عبر Pusher (QRCODE_UPDATED webhook)
        setQrState({ instanceId: inst.id, instanceName: inst.instanceName, qr: '' });
      }

      mutate();
    } finally {
      setConnectingId(null);
    }
  }

  async function handleRefreshQR() {
    if (!qrState) return;
    const res = await fetch(`/api/instances/${qrState.instanceId}/connect`, { method: 'POST' });
    const data = await res.json();
    if (data.qr) {
      setQrState((prev) => prev ? { ...prev, qr: data.qr } : null);
    } else {
      toast.info('QR جديد في الطريق...');
    }
  }

  async function handleDelete(id: number, name: string) {
    if (!confirm(`هل تريد حذف "${name}"؟ سيتم قطع اتصاله من واتساب.`)) return;
    const res = await fetch(`/api/instances/${id}/delete`, { method: 'DELETE' });
    if (!res.ok) {
      const d = await res.json();
      toast.error(d.error || 'فشل الحذف');
      return;
    }
    toast.success('تم الحذف');
    if (qrState?.instanceId === id) setQrState(null);
    mutate();
  }

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>أرقام الواتساب</CardTitle>
            <CardDescription>يمكنك ربط أكثر من رقم واتساب بالنظام عبر QR Code</CardDescription>
          </div>
          <Button size="sm" onClick={() => setCreateOpen(true)} className="gap-1.5">
            <Plus className="h-4 w-4" />
            إضافة رقم
          </Button>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-zinc-400" />
            </div>
          ) : !instances?.length ? (
            <div className="text-center py-8 text-zinc-400">
              <Smartphone className="h-8 w-8 mx-auto mb-2 opacity-40" />
              <p className="text-sm">لا توجد أرقام مضافة بعد</p>
              <p className="text-xs mt-1 text-zinc-300">أضف رقم واتساب للبدء باستقبال الرسائل</p>
            </div>
          ) : (
            <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {instances.map((inst) => (
                <div key={inst.id} className="flex items-center gap-3 py-3.5">
                  <Avatar name={inst.displayName || inst.instanceName} src={inst.profilePicUrl} size={40} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-zinc-900 dark:text-zinc-50 truncate">
                      {inst.displayName || inst.instanceName}
                    </p>
                    <p className="text-xs text-zinc-500 truncate" dir="ltr">
                      {inst.phoneNumber ? `+${inst.phoneNumber}` : inst.instanceName}
                    </p>
                  </div>

                  <StatusBadge status={inst.status} />

                  {inst.status !== 'open' && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleConnect(inst)}
                      disabled={connectingId === inst.id}
                      className="gap-1.5"
                    >
                      {connectingId === inst.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <QrCode className="h-3.5 w-3.5" />
                      )}
                      اتصال
                    </Button>
                  )}

                  {inst.status === 'open' && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleSync(inst.id)}
                      className="gap-1.5 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20"
                      title="تحميل آخر المحادثات من واتساب"
                    >
                      <RefreshCw className="h-3.5 w-3.5" />
                      مزامنة
                    </Button>
                  )}

                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => handleDelete(inst.id, inst.displayName || inst.instanceName)}
                    className="text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {createOpen && (
        <CreateInstanceDialog
          onClose={() => setCreateOpen(false)}
          onCreated={(qr, instanceId, name) => {
            mutate();
            setCreateOpen(false);
            if (instanceId && name) {
              setQrState({ instanceId, instanceName: name, qr: qr || '' });
            }
          }}
        />
      )}

      {qrState && (
        <QRDialog
          qrState={qrState}
          onClose={() => { setQrState(null); mutate(); }}
          onRefresh={handleRefreshQR}
        />
      )}
    </>
  );
}

function StatusBadge({ status }: { status: string }) {
  if (status === 'open') {
    return (
      <div className="flex items-center gap-1 text-emerald-600 text-xs font-medium">
        <Wifi className="h-3.5 w-3.5" />
        متصل
      </div>
    );
  }
  if (status === 'connecting') {
    return (
      <div className="flex items-center gap-1 text-amber-500 text-xs font-medium">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        جاري الاتصال
      </div>
    );
  }
  return (
    <div className="flex items-center gap-1 text-zinc-400 text-xs font-medium">
      <WifiOff className="h-3.5 w-3.5" />
      غير متصل
    </div>
  );
}

function QRDialog({
  qrState,
  onClose,
  onRefresh,
}: {
  qrState: QRState;
  onClose: () => void;
  onRefresh: () => void;
}) {
  const [elapsed, setElapsed] = useState(0);
  const QR_TIMEOUT_SECONDS = 60; // QR صالح 60 ثانية

  useEffect(() => {
    setElapsed(0);
    const interval = setInterval(() => {
      setElapsed((e) => {
        if (e >= QR_TIMEOUT_SECONDS) {
          clearInterval(interval);
          return e;
        }
        return e + 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [qrState.qr]);

  const isExpired = elapsed >= QR_TIMEOUT_SECONDS;
  const remaining = QR_TIMEOUT_SECONDS - elapsed;

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-sm">
        <DialogClose onClick={onClose} />
        <DialogHeader>
          <DialogTitle>ربط واتساب — {qrState.instanceName}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col items-center gap-4">
          {!qrState.qr ? (
            <div className="w-64 h-64 rounded-xl border border-zinc-200 flex flex-col items-center justify-center gap-2 bg-zinc-50">
              <Loader2 className="h-8 w-8 animate-spin text-zinc-400" />
              <p className="text-xs text-zinc-400">جاري تجهيز رمز QR...</p>
            </div>
          ) : isExpired ? (
            <div className="w-64 h-64 rounded-xl border-2 border-dashed border-zinc-300 flex flex-col items-center justify-center gap-3 bg-zinc-50">
              <AlertCircle className="h-8 w-8 text-amber-400" />
              <p className="text-sm text-zinc-500 text-center">انتهت صلاحية الرمز</p>
              <Button size="sm" onClick={onRefresh} className="gap-1.5">
                <RefreshCw className="h-3.5 w-3.5" />
                رمز جديد
              </Button>
            </div>
          ) : (
            <div className="relative">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={qrState.qr}
                alt="QR Code"
                className="w-64 h-64 rounded-xl border border-zinc-200"
              />
              <div className="absolute bottom-2 left-0 right-0 flex justify-center">
                <div className="bg-black/60 text-white text-xs px-2 py-0.5 rounded-full">
                  {remaining}ث
                </div>
              </div>
            </div>
          )}

          <div className="text-center space-y-1">
            <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
              كيف تربط واتساب؟
            </p>
            <ol className="text-xs text-zinc-500 text-right space-y-1 list-none">
              <li>① افتح واتساب على هاتفك</li>
              <li>② اضغط ︙ (ثلاث نقاط) ← الأجهزة المرتبطة</li>
              <li>③ اضغط "ربط جهاز" وامسح الرمز</li>
            </ol>
          </div>

          {qrState.qr && !isExpired && (
            <Button variant="outline" size="sm" onClick={onRefresh} className="gap-1.5 w-full">
              <RefreshCw className="h-3.5 w-3.5" />
              تحديث الرمز
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function CreateInstanceDialog({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (qr: string | null, instanceId: number | null, name: string) => void;
}) {
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit() {
    if (!name.trim()) return;
    setBusy(true);
    setError('');
    try {
      const res = await fetch('/api/instances', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ displayName: name.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'فشل إنشاء الرقم');
        return;
      }
      toast.success('تم إنشاء الرقم');
      onCreated(data.qr || null, data.instance?.id || null, name.trim());
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent>
        <DialogClose onClick={onClose} />
        <DialogHeader>
          <DialogTitle>إضافة رقم واتساب جديد</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="inst-name">اسم الرقم</Label>
            <Input
              id="inst-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="مثال: خدمة العملاء، المبيعات..."
              onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
              autoFocus
            />
            <p className="text-xs text-zinc-400">
              هذا الاسم للتمييز بين الأرقام داخل النظام فقط
            </p>
          </div>

          {error && (
            <p className="text-sm text-red-600 bg-red-50 dark:bg-red-900/20 px-3 py-2 rounded-lg">
              {error}
            </p>
          )}

          <Button
            className="w-full"
            onClick={handleSubmit}
            loading={busy}
            disabled={!name.trim()}
          >
            إنشاء وعرض رمز QR
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
