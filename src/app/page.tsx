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
      <div className="flex flex-wrap items-center gap-3">
        <Link
          href="/login"
          className="w-fit rounded-lg bg-brand-500 px-6 py-3 font-semibold text-ink-950 transition hover:bg-brand-400"
        >
          {t.auth.signIn}
        </Link>
        {/* Before the sign-in wall on purpose: a student should be able to find
            out what the exercise is before they have an account, and an
            instructor should be able to put this link in a syllabus. */}
        <Link
          href="/guide"
          className="w-fit rounded-lg border border-ink-600 bg-ink-900 px-6 py-3 font-semibold text-ink-100 transition hover:bg-ink-800"
        >
          {t.guide.title}
        </Link>
      </div>
    </main>
  );
}
