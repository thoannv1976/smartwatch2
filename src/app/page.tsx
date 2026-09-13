import Link from 'next/link';
import { getTranslations } from '@/i18n/server';

export default async function LandingPage() {
  const { t } = await getTranslations();

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col justify-center gap-8 px-6 py-16">
      <div>
        <p className="text-sm font-semibold tracking-[0.2em] text-brand-500 uppercase">
          Version 1 · smartwatch-v1
        </p>
        <h1 className="mt-3 text-4xl font-bold tracking-tight sm:text-5xl">{t.common.appName}</h1>
        <p className="mt-4 text-lg text-ink-300">{t.common.tagline}</p>
      </div>
      <Link
        href="/login"
        className="w-fit rounded-lg bg-brand-500 px-6 py-3 font-semibold text-ink-950 transition hover:bg-brand-400"
      >
        {t.auth.signIn}
      </Link>
    </main>
  );
}
