'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label, Textarea } from '@/components/ui/form-elements';
import { Select } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/form-elements';
import { Badge } from '@/components/ui/misc';
import { ArrowRight, Plus, Trash2, GripVertical, Bot, MessageSquare, UserCheck, Clock } from 'lucide-react';
import { toast } from 'sonner';

type NodeType = 'trigger' | 'send_message' | 'ai_check' | 'assign_department' | 'delay';

type FlowNode = {
  id: string;
  type: NodeType;
  data: Record<string, any>;
};

const nodeIcons: Record<NodeType, React.ReactNode> = {
  trigger: <span className="text-emerald-600">⚡</span>,
  send_message: <MessageSquare className="h-4 w-4 text-sky-500" />,
  ai_check: <Bot className="h-4 w-4 text-violet-500" />,
  assign_department: <UserCheck className="h-4 w-4 text-amber-500" />,
  delay: <Clock className="h-4 w-4 text-zinc-400" />,
};

const nodeLabels: Record<NodeType, string> = {
  trigger: 'مشغّل',
  send_message: 'إرسال رسالة',
  ai_check: 'رد ذكاء اصطناعي',
  assign_department: 'تعيين موظف',
  delay: 'تأخير',
};

function makeId() { return `node_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`; }

function defaultNode(type: NodeType): FlowNode {
  switch (type) {
    case 'send_message': return { id: makeId(), type, data: { text: '' } };
    case 'ai_check': return { id: makeId(), type, data: { prompt: '' } };
    case 'assign_department': return { id: makeId(), type, data: { userId: '' } };
    case 'delay': return { id: makeId(), type, data: { ms: 1000 } };
    default: return { id: makeId(), type, data: {} };
  }
}

export default function AutomationEditorPage() {
  const router = useRouter();
  const params = useParams();
  const isNew = !params?.id || params.id === 'new';
  const automationId = isNew ? null : Number(params.id);

  const [name, setName] = useState('Flow جديد');
  const [triggerType, setTriggerType] = useState<'keyword' | 'any_message'>('keyword');
  const [keywords, setKeywords] = useState('');
  const [nodes, setNodes] = useState<FlowNode[]>([{ id: 'trigger_1', type: 'trigger', data: {} }]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!automationId) return;
    fetch(`/api/automations/${automationId}`)
      .then((r) => r.json())
      .then((data) => {
        setName(data.name || '');
        setTriggerType(data.triggerType || 'keyword');
        setKeywords((data.triggerKeywords || []).join(', '));
        setNodes(data.nodes?.length ? data.nodes : [{ id: 'trigger_1', type: 'trigger', data: {} }]);
      });
  }, [automationId]);

  function addNode(type: NodeType) {
    setNodes((n) => [...n, defaultNode(type)]);
  }

  function removeNode(id: string) {
    setNodes((n) => n.filter((node) => node.id !== id && node.type === 'trigger' ? true : node.id !== id));
  }

  function updateNodeData(id: string, key: string, value: any) {
    setNodes((n) => n.map((node) => node.id === id ? { ...node, data: { ...node.data, [key]: value } } : node));
  }

  async function handleSave() {
    setBusy(true);
    try {
      const kws = keywords.split(',').map((k) => k.trim()).filter(Boolean);
      const edges = nodes.slice(0, -1).map((n, i) => ({ source: n.id, target: nodes[i + 1].id }));

      const body = {
        name,
        triggerType,
        triggerKeywords: kws,
        nodes,
        edges,
        isActive: false,
      };

      const url = automationId ? `/api/automations/${automationId}` : '/api/automations';
      const method = automationId ? 'PATCH' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const d = await res.json();
        toast.error(d.error || 'فشل الحفظ');
        return;
      }

      toast.success('تم حفظ الـ Flow');
      router.push('/dashboard/automation');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-2xl mx-auto p-6 space-y-6">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => router.push('/dashboard/automation')}>
            <ArrowRight className="h-4 w-4" />
          </Button>
          <h1 className="text-xl font-bold">{isNew ? 'Flow جديد' : 'تعديل Flow'}</h1>
        </div>

        <Card>
          <CardContent className="space-y-4 pt-4">
            <div className="space-y-1.5">
              <Label>اسم الـ Flow</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="مثال: رد ترحيبي" />
            </div>

            <div className="space-y-1.5">
              <Label>المشغّل (Trigger)</Label>
              <Select value={triggerType} onChange={(e) => setTriggerType(e.target.value as any)}>
                <option value="keyword">كلمات مفتاحية</option>
                <option value="any_message">أي رسالة واردة</option>
              </Select>
            </div>

            {triggerType === 'keyword' && (
              <div className="space-y-1.5">
                <Label>الكلمات المفتاحية (مفصولة بفواصل)</Label>
                <Input
                  value={keywords}
                  onChange={(e) => setKeywords(e.target.value)}
                  placeholder="مثال: سعر، أسعار، price"
                />
              </div>
            )}
          </CardContent>
        </Card>

        <div className="space-y-3">
          <p className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">خطوات الـ Flow (بالترتيب):</p>

          {nodes.map((node, idx) => (
            <div key={node.id} className="flex gap-2">
              <div className="flex flex-col items-center pt-4">
                <GripVertical className="h-4 w-4 text-zinc-300" />
                {idx < nodes.length - 1 && <div className="w-px flex-1 bg-zinc-200 dark:bg-zinc-800 my-1" />}
              </div>
              <Card className="flex-1">
                <CardContent className="py-3 px-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {nodeIcons[node.type]}
                      <span className="text-sm font-medium">{nodeLabels[node.type]}</span>
                    </div>
                    {node.type !== 'trigger' && (
                      <Button size="icon" variant="ghost" onClick={() => removeNode(node.id)} className="h-7 w-7 text-red-400">
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>

                  {node.type === 'send_message' && (
                    <Textarea
                      value={node.data.text || ''}
                      onChange={(e) => updateNodeData(node.id, 'text', e.target.value)}
                      placeholder="اكتب الرسالة..."
                      rows={3}
                    />
                  )}

                  {node.type === 'ai_check' && (
                    <div className="space-y-1.5">
                      <Label className="text-xs">System Prompt مخصص (اختياري)</Label>
                      <Textarea
                        value={node.data.prompt || ''}
                        onChange={(e) => updateNodeData(node.id, 'prompt', e.target.value)}
                        placeholder="اتركه فارغاً لاستخدام الـ prompt العام من إعدادات AI..."
                        rows={2}
                      />
                    </div>
                  )}

                  {node.type === 'delay' && (
                    <div className="flex items-center gap-2">
                      <Input
                        type="number"
                        value={node.data.ms || 1000}
                        onChange={(e) => updateNodeData(node.id, 'ms', Number(e.target.value))}
                        className="w-28"
                        min={500}
                        max={5000}
                      />
                      <span className="text-sm text-zinc-500">مللي ثانية</span>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          ))}

          <div className="flex gap-2 flex-wrap pt-2">
            <Button size="sm" variant="outline" onClick={() => addNode('send_message')} className="gap-1.5">
              <MessageSquare className="h-3.5 w-3.5" /> رسالة
            </Button>
            <Button size="sm" variant="outline" onClick={() => addNode('ai_check')} className="gap-1.5">
              <Bot className="h-3.5 w-3.5" /> رد AI
            </Button>
            <Button size="sm" variant="outline" onClick={() => addNode('delay')} className="gap-1.5">
              <Clock className="h-3.5 w-3.5" /> تأخير
            </Button>
          </div>
        </div>

        <div className="flex gap-3 pt-4 border-t border-zinc-200 dark:border-zinc-800">
          <Button onClick={handleSave} loading={busy}>حفظ الـ Flow</Button>
          <Button variant="outline" onClick={() => router.push('/dashboard/automation')}>إلغاء</Button>
        </div>
      </div>
    </div>
  );
}
