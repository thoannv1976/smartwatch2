import Link from 'next/link';
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
  PageHeader,
  TableScroll,
  Td,
  Th,
  WarningNote,
} from '@/components/ui/primitives';
import { formatDate, formatDateOnly, formatDecimal } from '@/lib/format';

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
      <PageHeader title={`${t.home.welcome}, ${user.displayName}`} subtitle={t.common.tagline} />

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
              className="rounded-md bg-brand-500 px-4 py-2 text-sm font-semibold text-ink-950 transition hover:bg-brand-400"
            >
              {t.enroll.browse}
            </Link>
          </div>
        ) : (
          <ul className="flex flex-col gap-3">
            {assignments.map(
              ({ assignment, course, attemptsUsed, inProgressSession, completedResult, blockedReason }) => (
                <li
                  key={assignment.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-ink-700/60 bg-ink-900/50 p-4"
                >
                  <div>
                    <p className="font-semibold text-ink-100">{assignment.title}</p>
                    <p className="mt-0.5 text-xs text-ink-400">
                      {course.courseName} · {course.semester} · {t.home.deadline}:{' '}
                      {formatDateOnly(assignment.deadline, locale)} · {t.home.attempts}:{' '}
                      {attemptsUsed}/{assignment.maxAttempts}
                    </p>
                    <p className="mt-0.5 font-mono text-xs text-ink-500">
                      {assignment.scenarioVersion} · engine {assignment.engineVersion}
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    {completedResult ? (
                      <>
                        <Badge tone="good">
                          {t.home.finalScore}: {formatDecimal(completedResult.finalScore, locale, 2)}
                        </Badge>
                        <Link
                          href={`/report/${completedResult.sessionId}`}
                          className="rounded-md border border-ink-600 bg-ink-800 px-3 py-1.5 text-sm text-ink-100 transition hover:bg-ink-700"
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
                        className="rounded-md bg-brand-500 px-4 py-1.5 text-sm font-semibold text-ink-950 transition hover:bg-brand-400"
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
                        className="rounded-md bg-brand-500 px-4 py-1.5 text-sm font-semibold text-ink-950 transition hover:bg-brand-400"
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
              className="rounded-md border border-ink-600 bg-ink-800 px-3 py-1.5 text-xs font-semibold text-ink-100 transition hover:bg-ink-700"
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
                  {row.course.semester} ·{' '}
                  <span className="font-mono">{row.studentCode}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card>
        <CardTitle hint={t.home.practiceDesc}>{t.home.practiceTitle}</CardTitle>
        <Link
          href="/new-game?mode=PRACTICE"
          className="inline-block rounded-md bg-brand-500 px-4 py-2 text-sm font-semibold text-ink-950 transition hover:bg-brand-400"
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
