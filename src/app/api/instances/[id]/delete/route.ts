import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/drizzle';
import { campaigns, chats, contacts, instances, messages } from '@/lib/db/schema';
import { and, count, eq, inArray, or, sql } from 'drizzle-orm';
import { getUserContext } from '@/lib/db/queries';
import { getEvolutionConfig, EvolutionClient } from '@/lib/whatsapp/evolution-client';
import { broadcastToTeam } from '@/lib/sse';

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const instanceId = Number.parseInt(id, 10);
    if (!Number.isInteger(instanceId)) {
      return NextResponse.json({ error: 'معرف الإنستنس غير صالح' }, { status: 400 });
    }

    const ctx = await getUserContext();
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!ctx.isTeamAdmin) {
      return NextResponse.json({ error: 'فقط المسؤول يمكنه حذف الإنستنس' }, { status: 403 });
    }

    const instance = await db.query.instances.findFirst({
      where: and(eq(instances.id, instanceId), eq(instances.teamId, ctx.teamId)),
    });
    if (!instance) {
      return NextResponse.json({ error: 'الإنستنس غير موجود' }, { status: 404 });
    }

    // حذف Evolution مستقل عن قاعدة البيانات: حتى إن كان الخادم غير متاح
    // أو الإنستنس غير موجود في Evolution (404)، يكتمل الحذف من DB دائماً.
    let evolutionDeleted = false;
    let evolutionWarning: string | null = null;
    try {
      const config = await getEvolutionConfig(ctx.teamId);
      if (config.apiUrl && config.apiKey) {
        const client = new EvolutionClient(config.apiUrl, config.apiKey);
        // logout أولاً — نتجاهل الخطأ دائماً (ممكن يكون غير متصل)
        await client.logoutInstance(instance.instanceName).catch(() => undefined);
        try {
          await client.deleteInstance(instance.instanceName);
          evolutionDeleted = true;
        } catch (evoError: any) {
          // 404 = الإنستنس مش موجود في Evolution — هذا مقبول، نكمل الحذف
          const status = evoError?.status ?? evoError?.statusCode;
          if (status === 404 || String(evoError?.message || '').toLowerCase().includes('not found')) {
            evolutionDeleted = true; // اعتبره محذوف
          } else {
            evolutionWarning = evoError instanceof Error ? evoError.message : 'تعذر حذف الإنستنس من Evolution';
            console.warn('[Instance Delete - Evolution]', evoError);
          }
        }
      } else {
        evolutionWarning = 'لم يتم حذف الإنستنس من Evolution لأن إعدادات الاتصال غير مكتملة';
      }
    } catch (error) {
      evolutionWarning = error instanceof Error ? error.message : 'تعذر الاتصال بـ Evolution';
      console.warn('[Instance Delete - Evolution]', error);
    }

    // نضع مهلة قفل قصيرة على هذه المعاملة فقط: لو كان هناك عملية أخرى
    // (مزامنة/webhook) ماسكة قفل على نفس الصفوف، تفشل المعاملة بعد ثوانٍ
    // برسالة واضحة بدلاً من التعليق إلى ما لا نهاية (وهذا كان يسبب
    // "ما يصير شي" في الواجهة لأن الطلب يظل معلقاً بدون رد).
    const deleted = await db.transaction(async (tx) => {
      await tx.execute(sql`SET LOCAL lock_timeout = '8s'`);

      const chatRows = await tx
        .select({ id: chats.id })
        .from(chats)
        .where(and(eq(chats.instanceId, instance.id), eq(chats.teamId, ctx.teamId)));
      const chatIds = chatRows.map((row) => row.id);

      const contactCondition = chatIds.length > 0
        ? or(eq(contacts.instanceId, instance.id), inArray(contacts.chatId, chatIds))!
        : eq(contacts.instanceId, instance.id);

      const [contactTotal] = await tx
        .select({ value: count() })
        .from(contacts)
        .where(contactCondition);

      const [messageTotal] = chatIds.length > 0
        ? await tx.select({ value: count() }).from(messages).where(inArray(messages.chatId, chatIds))
        : [{ value: 0 }];

      const [campaignTotal] = await tx
        .select({ value: count() })
        .from(campaigns)
        .where(eq(campaigns.instanceId, instance.id));

      // نحذف جهات الاتصال صراحةً لمعالجة السجلات القديمة التي كانت علاقتها
      // بالمحادثة ON DELETE SET NULL. البقية تُحذف تلقائياً بواسطة CASCADE:
      // chats -> messages, pending_messages, chat_tags
      // campaigns -> campaign_leads
      await tx.delete(contacts).where(contactCondition);
      await tx.delete(instances).where(
        and(eq(instances.id, instance.id), eq(instances.teamId, ctx.teamId)),
      );

      return {
        chats: chatIds.length,
        messages: Number(messageTotal.value || 0),
        contacts: Number(contactTotal.value || 0),
        campaigns: Number(campaignTotal.value || 0),
      };
    });

    broadcastToTeam(ctx.teamId, 'instance-deleted', {
      instanceId: instance.id,
      deleted,
    });

    return NextResponse.json({
      success: true,
      deleted,
      evolutionDeleted,
      warning: evolutionWarning,
    });
  } catch (error: any) {
    // أي خطأ غير متوقع (قفل معلّق من مزامنة/webhook متزامن، انقطاع اتصال DB، إلخ)
    // يجب أن يرجع دائماً JSON صالح بدلاً من صفحة خطأ عامة، وإلا فشل
    // res.json() في الواجهة بصمت ولا يظهر أي toast للمستخدم.
    console.error('[Instance Delete]', error);
    const message = error?.cause?.message || error?.message || 'فشل حذف الإنستنس، حاول مجدداً';
    const isLockTimeout = /lock timeout/i.test(String(message));
    return NextResponse.json({
      error: isLockTimeout
        ? 'تعذر الحذف: هناك عملية مزامنة جارية على نفس البيانات، حاول مجدداً بعد قليل'
        : message,
    }, { status: 500 });
  }
}
