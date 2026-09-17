import Link from 'next/link';
import { getCurrentUser } from '@/server/auth/session';
import { getRepositories } from '@/db/repositories/firestore';
import { NO_UNLOCKS, guideUnlocks } from '@/lib/guide-unlocks';
import { getTranslations } from '@/i18n/server';
import { interpolate } from '@/i18n';
import { LocaleSwitcher } from '@/components/chrome/LocaleSwitcher';
import { LessonList } from '@/components/guide/LessonList';
import { Card, CardTitle, WarningNote } from '@/components/ui/primitives';

export const metadata = { title: 'Giới thiệu & Hướng dẫn — Smartwatch CEO Challenge' };

/**
 * The student guide: what the game is, what it is for, how to play, and what
 * each part teaches.
 *
 * PUBLIC, AND OUTSIDE THE `(app)` ROUTE GROUP. A student should be able to read
 * this before they have an account, and an instructor should be able to put the
 * link in a syllabus. There is no personal data on the page, so there is
 * nothing to protect — and requiring a login to find out what the exercise is
 * would be exactly backwards.
 *
 * PERSONALISED WHEN SIGNED IN. `getCurrentUser()` returns null rather than
 * redirecting, which is the whole reason this page cannot use
 * `requireUserPage()`. When somebody IS signed in, one read of their final
 * results decides which halves of the lesson answers are open — see
 * `guideUnlocks`.
 */
export default async function GuidePage() {
  const { t } = await getTranslations();

  // Signed out is the normal case here, not an error.
  const user = await getCurrentUser();
  const unlocks = user
    ? guideUnlocks(await getRepositories().finalResults.listByUser(user.uid))
    : NO_UNLOCKS;

  const g = t.guide;

  const soloSteps = [
    { title: g.howTo.s1Title, body: g.howTo.s1Body },
    { title: g.howTo.s2Title, body: g.howTo.s2Body },
    { title: g.howTo.s3Title, body: g.howTo.s3Body },
    { title: g.howTo.s4Title, body: g.howTo.s4Body },
    { title: g.howTo.s5Title, body: g.howTo.s5Body, warning: g.howTo.s5Warning },
    { title: g.howTo.s6Title, body: g.howTo.s6Body },
    { title: g.howTo.s7Title, body: g.howTo.s7Body },
    { title: g.howTo.s8Title, body: g.howTo.s8Body },
  ];

  const groupSteps = [
    { title: g.howTo.g1Title, body: g.howTo.g1Body },
    { title: g.howTo.g2Title, body: g.howTo.g2Body },
    { title: g.howTo.g3Title, body: g.howTo.g3Body },
    { title: g.howTo.g4Title, body: g.howTo.g4Body },
    { title: g.howTo.g5Title, body: g.howTo.g5Body },
  ];

  const facts = [
    { label: g.intro.quartersLabel, value: g.intro.quartersValue },
    { label: g.intro.pointsLabel, value: g.intro.pointsValue },
    { label: g.intro.priceLabel, value: g.intro.priceValue },
    { label: g.intro.marketLabel, value: g.intro.marketValue },
    { label: g.intro.cashLabel, value: g.intro.cashValue },
    { label: g.intro.companiesLabel, value: g.intro.companiesValue },
  ];

  const values = [
    { title: g.value.tradeoffTitle, body: g.value.tradeoffBody },
    { title: g.value.causalTitle, body: g.value.causalBody },
    { title: g.value.calibrationTitle, body: g.value.calibrationBody },
    { title: g.value.incompleteTitle, body: g.value.incompleteBody },
    { title: g.value.peopleTitle, body: g.value.peopleBody },
  ];

  return (
    <div className="min-h-screen">
      {/* Its own header: this page lives outside the authenticated layout, so
          the app header (which needs a user and a role) is not available. */}
      <header className="border-b border-ink-800 bg-ink-950/70 backdrop-blur">
        <div className="mx-auto flex max-w-3xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3 sm:px-6">
          <Link href="/" className="text-sm font-bold tracking-tight text-ink-100">
            <span className="text-brand-500">◷</span> {t.common.appName}
          </Link>
          <div className="ml-auto flex items-center gap-3">
            <LocaleSwitcher />
            <Link
              href={user ? '/home' : '/login'}
              className="rounded-md border border-ink-600 bg-ink-800 px-3 py-1.5 text-xs text-ink-100 transition hover:bg-ink-700"
            >
              {user ? g.backHome : g.signIn}
            </Link>
          </div>
        </div>
      </header>

      {/* max-w-3xl, not 5xl: this is the only prose-length page in the app and
          a 90-character line is unreadable. */}
      <main className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-10 sm:px-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-ink-100 sm:text-4xl">{g.title}</h1>
          <p className="mt-3 max-w-prose text-base leading-relaxed text-ink-300">{g.subtitle}</p>
        </div>

        {/* --- 1. What this is --- */}
        <Card>
          <CardTitle>{g.intro.title}</CardTitle>
          <p className="max-w-prose text-base font-medium leading-relaxed text-ink-200">
            {g.intro.lead}
          </p>
          <p className="mt-3 max-w-prose text-sm leading-relaxed text-ink-300">{g.intro.body}</p>

          <div className="mt-6">
            <p className="text-sm font-semibold text-ink-100">{g.intro.numbersTitle}</p>
            <p className="mt-0.5 text-xs text-ink-500">{g.intro.numbersHint}</p>
            <dl className="mt-3 grid gap-2 sm:grid-cols-2">
              {facts.map((fact) => (
                <div
                  key={fact.label}
                  className="rounded-lg border border-ink-700/60 bg-ink-900/50 px-4 py-2.5"
                >
                  <dt className="text-xs text-ink-400">{fact.label}</dt>
                  <dd className="tnum mt-0.5 text-sm font-semibold text-ink-100">{fact.value}</dd>
                </div>
              ))}
            </dl>
          </div>

          <div className="mt-6">
            <p className="text-sm font-semibold text-ink-100">{g.intro.deterministicTitle}</p>
            <p className="mt-1 max-w-prose text-sm leading-relaxed text-ink-300">
              {g.intro.deterministicBody}
            </p>
          </div>
        </Card>

        {/* The asymmetry, said up front. A student who discovers on their own
            that 6th place was unavoidable loses trust in the whole exercise. */}
        <Card>
          <CardTitle>{g.intro.honestTitle}</CardTitle>
          <p className="max-w-prose text-sm leading-relaxed text-ink-300">{g.intro.honestBody}</p>
          <div className="mt-4">
            <WarningNote>{g.intro.honestConsequence}</WarningNote>
          </div>
          <p className="mt-4 max-w-prose text-sm font-medium leading-relaxed text-ink-200">
            {g.intro.honestPoint}
          </p>
        </Card>

        {/* --- 2. Why it is worth doing --- */}
        <Card>
          <CardTitle hint={g.value.lead}>{g.value.title}</CardTitle>
          <ul className="flex flex-col gap-4">
            {values.map((item) => (
              <li key={item.title} className="border-l-2 border-brand-600/40 pl-4">
                <p className="text-sm font-semibold text-ink-100">{item.title}</p>
                <p className="mt-1 max-w-prose text-sm leading-relaxed text-ink-300">{item.body}</p>
              </li>
            ))}
          </ul>
        </Card>

        {/* --- 3. How to play --- */}
        <Card>
          <CardTitle>{g.howTo.title}</CardTitle>
          <p className="text-sm font-semibold text-brand-400">{g.howTo.part1Title}</p>
          <ol className="mt-3 flex flex-col gap-4">
            {soloSteps.map((step, index) => (
              <li key={step.title} className="border-l-2 border-ink-700 pl-4">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-500">
                  {interpolate(g.howTo.stepLabel, { n: index + 1 })}
                </p>
                <p className="mt-0.5 text-sm font-semibold text-ink-100">{step.title}</p>
                <p className="mt-1 max-w-prose text-sm leading-relaxed text-ink-300">{step.body}</p>
                {step.warning ? (
                  <div className="mt-2">
                    <WarningNote>{step.warning}</WarningNote>
                  </div>
                ) : null}
              </li>
            ))}
          </ol>

          <p className="mt-8 text-sm font-semibold text-brand-400">{g.howTo.part2Title}</p>
          <ol className="mt-3 flex flex-col gap-4">
            {groupSteps.map((step, index) => (
              <li key={step.title} className="border-l-2 border-ink-700 pl-4">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-500">
                  {interpolate(g.howTo.stepLabel, { n: index + 1 })}
                </p>
                <p className="mt-0.5 text-sm font-semibold text-ink-100">{step.title}</p>
                <p className="mt-1 max-w-prose text-sm leading-relaxed text-ink-300">{step.body}</p>
              </li>
            ))}
          </ol>

          <div className="mt-6 rounded-lg border border-ink-700/60 bg-ink-900/50 p-4">
            <p className="text-sm font-semibold text-ink-100">{g.howTo.goldenOffTitle}</p>
            <p className="mt-1 max-w-prose text-sm leading-relaxed text-ink-300">
              {g.howTo.goldenOffBody}
            </p>
          </div>
        </Card>

        {/* --- 4. Lessons, gated --- */}
        <LessonList
          t={t}
          title={g.lessons.part1Title}
          unlocked={unlocks.part1}
          lockedNote={g.lessons.lockedPart1}
          questions={g.part1.questions}
          answers={g.part1.answers}
        />

        <LessonList
          t={t}
          title={g.lessons.part2Title}
          unlocked={unlocks.part2}
          lockedNote={g.lessons.lockedPart2}
          questions={g.part2.questions}
          answers={g.part2.answers}
        />

        {/* --- 5. Closing --- */}
        <Card>
          <CardTitle>{g.closing.title}</CardTitle>
          <p className="max-w-prose text-sm leading-relaxed text-ink-300">{g.closing.body}</p>
          <div className="mt-5 flex flex-wrap gap-3">
            <Link
              href={user ? '/new-game?mode=PRACTICE' : '/login'}
              className="rounded-md bg-brand-500 px-5 py-2.5 text-sm font-semibold text-ink-950 transition hover:bg-brand-400"
            >
              {user ? g.closing.startPractice : g.signIn}
            </Link>
            {user ? (
              <Link
                href="/home"
                className="rounded-md border border-ink-600 bg-ink-800 px-5 py-2.5 text-sm text-ink-100 transition hover:bg-ink-700"
              >
                {g.closing.goHome}
              </Link>
            ) : null}
          </div>
        </Card>
      </main>
    </div>
  );
}
