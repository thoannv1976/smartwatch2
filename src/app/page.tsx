import Link from 'next/link';
import {
  ArrowRight,
  BookOpen,
  GraduationCap,
  ShieldCheck,
  Sparkles,
  UserRound,
  Watch,
  type LucideIcon,
} from 'lucide-react';
import { LocaleSwitcher } from '@/components/chrome/LocaleSwitcher';
import { HeroArt } from '@/components/illustrations/Illustrations';
import { getTranslations } from '@/i18n/server';

const ROLE_ICONS: Record<string, { icon: LucideIcon; tone: string }> = {
  student: { icon: UserRound, tone: 'bg-brand-50 text-brand-500' },
  instructor: { icon: GraduationCap, tone: 'bg-emerald-50 text-emerald-600' },
  admin: { icon: ShieldCheck, tone: 'bg-rose-50 text-rose-600' },
};

export default async function LandingPage() {
  const { t } = await getTranslations();
  const l = t.landing;

  return (
    <main className="min-h-screen">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4 sm:px-6">
        <span className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-brand-500 to-violet-500 text-white shadow-md shadow-brand-500/30">
            <Watch className="h-5 w-5" aria-hidden />
          </span>
          <span className="text-sm font-extrabold tracking-tight text-ink-100">
            {t.common.appName}
          </span>
        </span>
        <LocaleSwitcher />
      </div>

      <div className="mx-auto max-w-6xl px-4 pb-16 sm:px-6">
        {/* Hero */}
        <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-night-900 via-night-800 to-brand-500 px-6 py-12 text-white shadow-xl shadow-brand-500/20 sm:px-12 sm:py-16">
          <div
            aria-hidden
            className="absolute -top-24 -right-24 h-72 w-72 rounded-full bg-violet-400/30 blur-3xl"
          />
          <div className="relative flex flex-col gap-8 lg:flex-row lg:items-center lg:justify-between">
            <div className="max-w-2xl">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-semibold">
                <Sparkles className="h-3.5 w-3.5" aria-hidden />
                {l.badge}
              </span>
              <h1 className="mt-4 text-3xl leading-tight font-extrabold tracking-tight sm:text-5xl">
                {l.title}
              </h1>
              <p className="mt-4 text-base text-indigo-100 sm:text-lg">{l.subtitle}</p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Link
                  href="/login"
                  className="flex items-center gap-2 rounded-xl bg-white px-6 py-3 font-bold text-brand-500 shadow-lg transition hover:bg-indigo-50"
                >
                  {l.start}
                  <ArrowRight className="h-4 w-4" aria-hidden />
                </Link>
                {/* Before the sign-in wall on purpose: a student should be able to find
                  out what the exercise is before they have an account, and an
                  instructor should be able to put this link in a syllabus. */}
                <Link
                  href="/guide"
                  className="flex items-center gap-2 rounded-xl border border-white/30 bg-white/10 px-6 py-3 font-semibold text-white transition hover:bg-white/20"
                >
                  <BookOpen className="h-4 w-4" aria-hidden />
                  {l.learnMore}
                </Link>
              </div>
            </div>
            <HeroArt className="mx-auto h-auto w-60 shrink-0 sm:w-72 lg:mx-0 lg:w-80" />
          </div>
        </section>

        {/* Key facts */}
        <section className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {l.facts.map((f) => (
            <div
              key={f.label}
              className="rounded-2xl border border-ink-700 bg-ink-850 p-4 shadow-sm shadow-slate-200/70"
            >
              <p className="text-xl font-extrabold text-brand-500 sm:text-2xl">{f.value}</p>
              <p className="mt-1 text-xs font-medium text-ink-400">{f.label}</p>
            </div>
          ))}
        </section>

        <div className="mt-10 grid gap-6 lg:grid-cols-5">
          {/* Roles */}
          <section className="lg:col-span-3">
            <h2 className="text-lg font-extrabold text-ink-100">{l.rolesTitle}</h2>
            <div className="mt-3 grid gap-3 sm:grid-cols-3">
              {l.roles.map((r) => {
                const { icon: Icon, tone } = ROLE_ICONS[r.key] ?? ROLE_ICONS.student!;
                return (
                  <div
                    key={r.key}
                    className="rounded-2xl border border-ink-700 bg-ink-850 p-4 shadow-sm shadow-slate-200/70"
                  >
                    <span
                      className={`flex h-10 w-10 items-center justify-center rounded-xl ${tone}`}
                    >
                      <Icon className="h-5 w-5" aria-hidden />
                    </span>
                    <p className="mt-3 text-sm font-bold text-ink-100">{r.title}</p>
                    <p className="mt-1 text-xs leading-relaxed text-ink-400">{r.text}</p>
                  </div>
                );
              })}
            </div>
          </section>

          {/* Steps */}
          <section className="lg:col-span-2">
            <h2 className="text-lg font-extrabold text-ink-100">{l.stepsTitle}</h2>
            <ol className="mt-3 flex flex-col gap-2">
              {l.steps.map((step, i) => (
                <li
                  key={step}
                  className="flex items-start gap-3 rounded-2xl border border-ink-700 bg-ink-850 p-3 shadow-sm shadow-slate-200/70"
                >
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-500 shadow-sm shadow-brand-500/25 text-xs font-bold text-white">
                    {i + 1}
                  </span>
                  <span className="pt-1 text-sm text-ink-300">{step}</span>
                </li>
              ))}
            </ol>
          </section>
        </div>
      </div>
    </main>
  );
}
