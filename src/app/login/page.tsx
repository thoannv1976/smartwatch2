import { Suspense } from 'react';
import Link from 'next/link';
import { Watch } from 'lucide-react';
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
      <Link href="/" className="flex flex-col items-center text-center">
        <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-500 to-violet-500 text-white shadow-lg shadow-brand-500/30">
          <Watch className="h-6 w-6" aria-hidden />
        </span>
        <h1 className="mt-3 text-2xl font-extrabold tracking-tight text-ink-100">
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
