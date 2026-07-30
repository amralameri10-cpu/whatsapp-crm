'use client';

import { useActionState } from 'react';
import { useSearchParams } from 'next/navigation';
import { signIn, signUp, type ActionState } from './actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/form-elements';
import { MessageCircle } from 'lucide-react';
import Link from 'next/link';

export function LoginForm() {
  const searchParams = useSearchParams();
  const isInvite = searchParams.get('token');
  const mode = isInvite ? 'signup' : (searchParams.get('mode') || 'signin');

  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    mode === 'signup' ? signUp : signIn,
    {}
  );

  return (
    <div className="min-h-screen flex items-center justify-center px-4" style={{background: 'linear-gradient(to bottom, #ecfdf5, #ffffff)'}}>
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-8">
          <div className="h-14 w-14 rounded-2xl bg-emerald-600 flex items-center justify-center mb-4 shadow-lg" style={{boxShadow:'0 10px 25px -5px rgba(16,185,129,0.3)'}}>
            <MessageCircle className="h-7 w-7 text-white" fill="white" />
          </div>
          <h1 className="text-xl font-bold" style={{color:'#18181b'}}>
            {mode === 'signup' ? 'إنشاء حساب جديد' : 'تسجيل الدخول'}
          </h1>
          <p className="text-sm mt-1" style={{color:'#71717a'}}>
            {isInvite ? 'أكمل بياناتك لقبول الدعوة' : 'نظام إدارة محادثات واتساب'}
          </p>
        </div>

        <form action={formAction} className="space-y-4 bg-white p-6 rounded-2xl border shadow-sm" style={{borderColor:'#e4e4e7'}}>
          {isInvite && <input type="hidden" name="token" value={isInvite} />}

          {mode === 'signup' && (
            <div className="space-y-1.5">
              <Label htmlFor="name">الاسم</Label>
              <Input id="name" name="name" placeholder="اسمك الكامل" required />
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="email">البريد الإلكتروني</Label>
            <Input id="email" name="email" type="email" placeholder="you@example.com" required dir="ltr" />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="password">كلمة المرور</Label>
            <Input id="password" name="password" type="password" placeholder="••••••••" required dir="ltr" minLength={8} />
          </div>

          {state?.error && (
            <p className="text-sm px-3 py-2 rounded-lg" style={{color:'#dc2626',background:'#fef2f2'}}>{state.error}</p>
          )}

          <Button type="submit" className="w-full" loading={pending}>
            {mode === 'signup' ? 'إنشاء الحساب' : 'دخول'}
          </Button>
        </form>

        {!isInvite && (
          <p className="text-center text-sm mt-6" style={{color:'#71717a'}}>
            {mode === 'signup' ? (
              <>لديك حساب؟ <Link href="/login" className="font-medium" style={{color:'#059669'}}>سجّل دخولك</Link></>
            ) : (
              <>ليس لديك حساب؟ <Link href="/login?mode=signup" className="font-medium" style={{color:'#059669'}}>أنشئ حساب جديد</Link></>
            )}
          </p>
        )}
      </div>
    </div>
  );
}
