import Link from 'next/link';
import { BookOpen, PlayCircle, Sparkles } from 'lucide-react';
import { requireUserPage } from '@/server/auth/guards';
import { getRepositories } from '@/db/repositories/firestore';
import { createEnrollmentService } from '@/server/game/enrollment';
import { listAssignmentsForStudent, listSessionsForStudent } from '@/server/game/queries';
import { getTranslations } from '@/i18n/server';
import {
  Badge,
  Card,
  CardTitle,
  EmptyState,
  TableScroll,
  Td,
  Th,
  WarningNote,
} from '@/components/ui/primitives';
import { formatDate, formatDateOnly, formatDecimal } from '@/lib/format';
import { HeroArt } from '@/components/illustrations/Illustrations';

export const metadata = { title: 'Trang chủ — Smartwatch CEO Challenge' };

/** Student home: practice, official assignments and previous games (spec 12). */
export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const user = await requireUserPage('/home');
  const { t, locale } = await getTranslations();
  const params = await searchParams;

  const [assignments, sessions, enrolled] = await Promise.all([
    listAssignmentsForStudent(user.uid),
    listSessionsForStudent(user.uid),
    createEnrollmentService(getRepositories()).listEnrolled(user.uid),
  ]);

  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-6 px-4 py-8 sm:px-6">
      {/* Welcome banner with the student's numbers at a glance */}
      <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-night-900 via-night-800 to-brand-500 p-6 text-white shadow-xl shadow-brand-500/20 sm:p-8">
        <div
          aria-hidden
          className="absolute -top-20 -right-20 h-60 w-60 rounded-full bg-violet-400/30 blur-3xl"
        />
        <div className="relative flex flex-wrap items-end justify-between gap-6">
          <div>
            <p className="flex items-center gap-1.5 text-xs font-bold tracking-wide text-indigo-200 uppercase">
              <Sparkles className="h-3.5 w-3.5" aria-hidden />
              {t.common.appName}
            </p>
            <h1 className="mt-2 text-2xl font-extrabold tracking-tight sm:text-3xl">
              {t.home.welcome}, {user.displayName} 👋
            </h1>
            <p className="mt-1 max-w-prose text-sm text-indigo-100">{t.common.tagline}</p>
            <div className="mt-5 flex flex-wrap gap-2">
              <Link
                href="/new-game?mode=PRACTICE"
                className="flex items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-bold text-brand-500 shadow-md transition hover:bg-indigo-50"
              >
                <PlayCircle className="h-4 w-4" aria-hidden />
                {t.home.practiceStart}
              </Link>
              <Link
                href="/guide"
                className="flex items-center gap-2 rounded-xl border border-white/30 bg-white/10 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-white/20"
              >
                <BookOpen className="h-4 w-4" aria-hidden />
                {t.guide.title}
              </Link>
            </div>
          </div>
          <HeroArt className="hidden h-auto w-40 shrink-0 lg:block" />
          <dl className="grid grid-cols-3 gap-2">
            {[
              { label: t.home.statAssignments, value: assignments.length },
              { label: t.home.statGames, value: sessions.length },
              {
                label: t.home.statCompleted,
                value: sessions.filter((s) => s.session.status === 'COMPLETED').length,
              },
            ].map((stat) => (
              <div
                key={stat.label}
                className="min-w-[5.5rem] rounded-2xl border border-white/15 bg-white/10 px-3 py-2.5 text-center"
              >
                <dd className="tnum text-2xl font-extrabold">{stat.value}</dd>
                <dt className="mt-0.5 text-[11px] leading-tight text-indigo-100">{stat.label}</dt>
              </div>
            ))}
          </dl>
        </div>
      </section>

      {params.error === 'forbidden' ? <WarningNote>{t.auth.forbidden}</WarningNote> : null}

      {/* Official assignments come first: they are what counts for a grade. */}
      <Card>
        <CardTitle hint={t.home.officialDesc}>{t.home.officialTitle}</CardTitle>
        {assignments.length === 0 ? (
          <div className="flex flex-col items-start gap-3">
            <EmptyState>
              {enrolled.length === 0 ? t.enroll.noCourses : t.home.officialNone}
            </EmptyState>
            <Link
              href="/join"
              className="rounded-lg bg-brand-500 shadow-sm shadow-brand-500/25 px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-400"
            >
              {t.enroll.browse}
            </Link>
          </div>
        ) : (
          <ul className="flex flex-col gap-3">
            {assignments.map(
              ({
                assignment,
                course,
                attemptsUsed,
                inProgressSession,
                completedResult,
                blockedReason,
                mode,
                groupId,
              }) => (
                <li
                  key={assignment.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-ink-700 bg-ink-900 p-4 transition hover:border-brand-100 hover:bg-brand-50/50"
                >
                  <div>
                    <p className="font-semibold text-ink-100">{assignment.title}</p>
                    <p className="mt-0.5 text-xs text-ink-400">
                      {course.courseName} · {course.semester} · {t.home.deadline}:{' '}
                      {formatDateOnly(assignment.deadline, locale)}
                      {mode === 'GROUP'
                        ? ` · ${t.group.title}`
                        : ` · ${t.home.attempts}: ${attemptsUsed}/${assignment.maxAttempts}`}
                    </p>
                    <p className="mt-0.5 font-mono text-xs text-ink-500">
                      {assignment.scenarioVersion} · engine {assignment.engineVersion}
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    {/* A group assignment has one match rather than attempts, so
                        it routes to the group instead of /new-game. */}
                    {mode === 'GROUP' ? (
                      blockedReason && !groupId ? (
                        <Badge tone="warn">
                          {blockedReason === 'archived'
                            ? t.instructorAdmin.archived
                            : blockedReason === 'notOpenYet'
                              ? t.home.officialNotOpen
                              : t.home.officialClosed}
                        </Badge>
                      ) : (
                        <Link
                          href={groupId ? `/group/${groupId}` : '/group/join'}
                          className="rounded-lg bg-brand-500 shadow-sm shadow-brand-500/25 px-4 py-1.5 text-sm font-semibold text-white transition hover:bg-brand-400"
                        >
                          {groupId ? t.group.lobbyTitle : t.group.joinButton}
                        </Link>
                      )
                    ) : completedResult ? (
                      <>
                        <Badge tone="good">
                          {t.home.finalScore}:{' '}
                          {formatDecimal(completedResult.finalScore, locale, 2)}
                        </Badge>
                        <Link
                          href={`/report/${completedResult.sessionId}`}
                          className="rounded-lg border border-ink-700 bg-ink-850 shadow-sm px-3 py-1.5 text-sm font-semibold text-ink-100 transition hover:bg-ink-900"
                        >
                          {t.home.viewReport}
                        </Link>
                        <Link
                          href={`/leaderboard/${assignment.id}`}
                          className="rounded-md border border-ink-600 px-3 py-1.5 text-sm text-ink-200 transition hover:bg-ink-800"
                        >
                          {t.leaderboard.title}
                        </Link>
                      </>
                    ) : inProgressSession ? (
                      <Link
                        href={`/game/${inProgressSession.id}`}
                        className="rounded-lg bg-brand-500 shadow-sm shadow-brand-500/25 px-4 py-1.5 text-sm font-semibold text-white transition hover:bg-brand-400"
                      >
                        {t.home.officialContinue}
                      </Link>
                    ) : blockedReason ? (
                      <Badge tone="warn">
                        {blockedReason === 'archived'
                          ? t.instructorAdmin.archived
                          : blockedReason === 'notOpenYet'
                            ? t.home.officialNotOpen
                            : blockedReason === 'deadlinePassed'
                              ? t.home.officialClosed
                              : t.home.officialUsedUp}
                      </Badge>
                    ) : (
                      <Link
                        href={`/new-game?mode=OFFICIAL&assignmentId=${assignment.id}`}
                        className="rounded-lg bg-brand-500 shadow-sm shadow-brand-500/25 px-4 py-1.5 text-sm font-semibold text-white transition hover:bg-brand-400"
                      >
                        {t.home.officialStart}
                      </Link>
                    )}
                  </div>
                </li>
              ),
            )}
          </ul>
        )}
      </Card>

      <Card>
        <CardTitle
          right={
            <Link
              href="/join"
              className="rounded-lg border border-ink-700 bg-ink-850 shadow-sm px-3 py-1.5 text-xs font-semibold text-ink-100 transition hover:bg-ink-900"
            >
              {t.enroll.browse}
            </Link>
          }
        >
          {t.enroll.myCourses}
        </CardTitle>
        {enrolled.length === 0 ? (
          <EmptyState>{t.enroll.noCourses}</EmptyState>
        ) : (
          <ul className="flex flex-col gap-2">
            {enrolled.map((row) => (
              <li
                key={row.course.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-ink-700/60 bg-ink-900/50 px-4 py-3"
              >
                <span className="text-sm font-medium text-ink-100">
                  {row.course.courseName}{' '}
                  {row.archived ? <Badge tone="warn">{t.enroll.archivedCourse}</Badge> : null}
                </span>
                <span className="text-xs text-ink-400">
                  {row.course.semester} · <span className="font-mono">{row.studentCode}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* Above the practice card, because the order a new student should meet
          these in is: find out what this is, then play a practice game. */}
      <Card>
        <CardTitle hint={t.guide.subtitle}>{t.guide.title}</CardTitle>
        <Link
          href="/guide"
          className="inline-block rounded-lg border border-brand-600/50 bg-brand-500/10 px-4 py-2 text-sm font-semibold text-brand-400 transition hover:bg-brand-500/20"
        >
          {t.guide.title}
        </Link>
      </Card>

      <Card>
        <CardTitle hint={t.home.practiceDesc}>{t.home.practiceTitle}</CardTitle>
        <Link
          href="/new-game?mode=PRACTICE"
          className="inline-block rounded-lg bg-brand-500 shadow-sm shadow-brand-500/25 px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-400"
        >
          {t.home.practiceStart}
        </Link>
      </Card>

      <Card>
        <CardTitle>{t.home.previousGames}</CardTitle>
        {sessions.length === 0 ? (
          <EmptyState>{t.home.noPreviousGames}</EmptyState>
        ) : (
          <TableScroll>
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  <Th>{t.common.company}</Th>
                  <Th>{t.home.mode}</Th>
                  <Th>{t.home.status}</Th>
                  <Th align="center">{t.common.quarter}</Th>
                  <Th align="right">{t.home.finalScore}</Th>
                  <Th>{t.home.startedAt}</Th>
                  <Th />
                </tr>
              </thead>
              <tbody>
                {sessions.map(({ session, finalResult }) => (
                  <tr key={session.id}>
                    <Td className="font-medium text-ink-100">{session.companyName}</Td>
                    <Td>
                      <Badge tone={session.mode === 'OFFICIAL' ? 'brand' : 'neutral'}>
                        {session.mode === 'OFFICIAL' ? t.home.modeOfficial : t.home.modePractice}
                      </Badge>
                    </Td>
                    <Td>
                      {session.status === 'COMPLETED'
                        ? t.home.statusCompleted
                        : t.home.statusInProgress}
                    </Td>
                    <Td numeric align="center">
                      {session.currentRound}/6
                    </Td>
                    <Td numeric align="right">
                      {finalResult ? formatDecimal(finalResult.finalScore, locale, 2) : '—'}
                    </Td>
                    <Td className="text-ink-400">{formatDate(session.startedAt, locale)}</Td>
                    <Td align="right">
                      <Link
                        href={
                          session.status === 'COMPLETED'
                            ? `/report/${session.id}`
                            : `/game/${session.id}`
                        }
                        className="text-brand-400 underline-offset-2 hover:underline"
                      >
                        {session.status === 'COMPLETED' ? t.home.viewReport : t.home.continueGame}
                      </Link>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableScroll>
        )}
      </Card>
    </main>
  );
}
