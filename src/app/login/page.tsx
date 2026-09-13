import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { LoginForm } from '@/components/auth/LoginForm';
import { LocaleSwitcher } from '@/components/chrome/LocaleSwitcher';
import { getCurrentUser } from '@/server/auth/session';
import { getTranslations } from '@/i18n/server';

export const metadata = { title: 'Đăng nhập — Smartwatch CEO Challenge' };

export default async function LoginPage() {
  const { t } = await getTranslations();
  const user = await getCurrentUser().catch(() => null);
  if (user) redirect('/home');

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 px-4 py-12">
      <div className="text-center">
        <p className="text-xs font-semibold tracking-[0.2em] text-brand-500 uppercase">
          smartwatch-v1
        </p>
        <h1 className="mt-2 text-2xl font-bold">{t.common.appName}</h1>
        <p className="mt-1 max-w-md text-sm text-ink-300">{t.common.tagline}</p>
      </div>

      <Suspense fallback={null}>
        <LoginForm />
      </Suspense>

      <LocaleSwitcher />
    </main>
  );
}
