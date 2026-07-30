'use client';

import { useEffect } from 'react';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[App Error]', error);
  }, [error]);

  return (
    <html lang="ar" dir="rtl">
      <body style={{ fontFamily: 'Arial, sans-serif', margin: 0, background: '#fafafa' }}>
        <div style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '1rem',
        }}>
          <div style={{
            background: 'white',
            border: '1px solid #e4e4e7',
            borderRadius: '16px',
            padding: '2rem',
            maxWidth: '480px',
            width: '100%',
            textAlign: 'center',
            boxShadow: '0 4px 24px rgba(0,0,0,0.06)',
          }}>
            <div style={{
              width: 56, height: 56,
              borderRadius: 14,
              background: '#fef2f2',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 1.25rem',
              fontSize: 28,
            }}>⚠️</div>

            <h1 style={{ fontSize: 20, fontWeight: 700, color: '#18181b', margin: '0 0 0.5rem' }}>
              حدث خطأ في النظام
            </h1>

            <p style={{ color: '#71717a', fontSize: 14, margin: '0 0 1.25rem', lineHeight: 1.6 }}>
              {error?.message?.includes('DATABASE_URL')
                ? 'لم يتم ضبط رابط قاعدة البيانات. تأكد من إضافة DATABASE_URL في الإعدادات.'
                : error?.message?.includes('connect')
                ? 'تعذّر الاتصال بقاعدة البيانات. تأكد من صحة DATABASE_URL والشبكة.'
                : 'حدث خطأ غير متوقع. حاول مجدداً أو راجع لوجز السيرفر.'}
            </p>

            {error?.message && (
              <pre style={{
                background: '#f4f4f5',
                borderRadius: 8,
                padding: '0.75rem 1rem',
                fontSize: 11,
                color: '#52525b',
                textAlign: 'right',
                direction: 'ltr',
                overflowX: 'auto',
                margin: '0 0 1.25rem',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-all',
              }}>
                {error.message}
              </pre>
            )}

            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center' }}>
              <button
                onClick={reset}
                style={{
                  padding: '0.6rem 1.25rem',
                  background: '#059669',
                  color: 'white',
                  border: 'none',
                  borderRadius: 10,
                  cursor: 'pointer',
                  fontSize: 14,
                  fontWeight: 600,
                }}
              >
                إعادة المحاولة
              </button>
              <a
                href="/login"
                style={{
                  padding: '0.6rem 1.25rem',
                  background: '#f4f4f5',
                  color: '#3f3f46',
                  border: 'none',
                  borderRadius: 10,
                  cursor: 'pointer',
                  fontSize: 14,
                  fontWeight: 600,
                  textDecoration: 'none',
                }}
              >
                صفحة الدخول
              </a>
            </div>

            <p style={{ color: '#a1a1aa', fontSize: 11, marginTop: '1.25rem' }}>
              راجع لوجز EasyPanel لمعرفة تفاصيل الخطأ الكامل
            </p>
          </div>
        </div>
      </body>
    </html>
  );
}
