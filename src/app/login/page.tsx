import { Suspense } from 'react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { LoginForm } from '@/components/auth/LoginForm';
import { LocaleSwitcher } from '@/components/chrome/LocaleSwitcher';
import { HeroArt } from '@/components/illustrations/Illustrations';
import { getCurrentUser } from '@/server/auth/session';
import { getTranslations } from '@/i18n/server';

export const metadata = { title: 'Đăng nhập — Smartwatch CEO Challenge' };

export default async function LoginPage() {
  const { t } = await getTranslations();
  const user = await getCurrentUser().catch(() => null);
  if (user) redirect('/home');

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 px-4 py-12">
      <Link href="/" className="flex flex-col items-center text-center">
        <HeroArt className="h-auto w-48 sm:w-56" />
        <h1 className="mt-1 text-2xl font-extrabold tracking-tight text-ink-100">
          {t.common.appName}
        </h1>
        <p className="mt-1 max-w-md text-sm text-ink-400">{t.common.tagline}</p>
      </Link>

      <Suspense fallback={null}>
        <LoginForm />
      </Suspense>

      <LocaleSwitcher />
    </main>
  );
}
