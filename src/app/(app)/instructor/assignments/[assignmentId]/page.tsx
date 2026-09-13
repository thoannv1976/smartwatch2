import Link from 'next/link';
import { notFound } from 'next/navigation';
import { LEADERBOARD_SORTS, type LeaderboardSort } from '@/db/models';
import { requireRolePage } from '@/server/auth/guards';
import { hasRole } from '@/server/auth/session';
import {
  getAssignmentAnalytics,
  listLeaderboard,
  listParticipation,
} from '@/server/instructor/queries';
import { getTranslations } from '@/i18n/server';
import { AssignmentToggle } from '@/components/instructor/CourseForms';
import {
  Badge,
  Card,
  CardTitle,
  EmptyState,
  PageHeader,
  StatTile,
  TableScroll,
  Td,
  Th,
} from '@/components/ui/primitives';
import {
  formatDate,
  formatDecimal,
  formatMoneyCompact,
  formatPercent,
  formatScore,
} from '@/lib/format';

export const metadata = { title: 'Bài tập — Smartwatch CEO Challenge' };

const SORT_LABEL_KEY: Record<
  LeaderboardSort,
  'columnScore' | 'columnProfit' | 'columnShare' | 'columnCsat' | 'columnBrand'
> = {
  finalScore: 'columnScore',
  cumulativeProfit: 'columnProfit',
  finalMarketShare: 'columnShare',
  finalCsat: 'columnCsat',
  finalBrand: 'columnBrand',
};

/** Assignment monitoring, aggregates, sortable leaderboard and CSV export (spec 9.4). */
export default async function AssignmentDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ assignmentId: string }>;
  searchParams: Promise<{ sort?: string }>;
}) {
  const { assignmentId } = await params;
  const user = await requireRolePage('INSTRUCTOR', `/instructor/assignments/${assignmentId}`);
  const { t, locale } = await getTranslations();
  const query = await searchParams;

  const sort: LeaderboardSort = LEADERBOARD_SORTS.includes(query.sort as LeaderboardSort)
    ? (query.sort as LeaderboardSort)
    : 'finalScore';

  const analytics = await getAssignmentAnalytics(assignmentId);
  if (!analytics) notFound();

  const course = analytics.course;
  if (!hasRole(user.role, 'ADMIN') && course?.instructorId !== user.uid) notFound();

  const [participation, leaderboard] = await Promise.all([
    listParticipation(assignmentId),
    listLeaderboard(assignmentId, sort),
  ]);

  // Session ids so a row can link straight to the student's six-quarter detail.
  const sessionByUser = new Map(participation.map((p) => [p.member.uid, p.session?.id ?? null]));

  const { assignment } = analytics;

  return (
    <main className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-8 sm:px-6">
      <PageHeader
        title={assignment.title}
        subtitle={course ? `${course.courseName} · ${course.semester}` : undefined}
        right={
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="neutral">
              {assignment.scenarioVersion} · engine {assignment.engineVersion}
            </Badge>
            <AssignmentToggle assignmentId={assignment.id} isOpen={assignment.isOpen} />
            <Link
              href="/instructor"
              className="rounded-md border border-ink-600 bg-ink-800 px-3 py-1.5 text-xs text-ink-100 transition hover:bg-ink-700"
            >
              {t.instructor.title}
            </Link>
          </div>
        }
      />

      <Card>
        <CardTitle hint={t.instructor.seedHint}>
          {t.instructor.officialSeed}: <span className="font-mono">{assignment.officialSeed}</span>
        </CardTitle>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatTile label={t.instructor.enrolled} value={analytics.enrolled} />
          <StatTile label={t.instructor.started} value={analytics.started} />
          <StatTile label={t.instructor.completed} value={analytics.completed} emphasis />
          <StatTile
            label={t.instructor.avgScore}
            value={
              analytics.averageScore === null
                ? '—'
                : formatDecimal(analytics.averageScore, locale, 2)
            }
            emphasis
          />
          <StatTile
            label={t.instructor.maxScore}
            value={
              analytics.highestScore === null
                ? '—'
                : formatDecimal(analytics.highestScore, locale, 2)
            }
          />
          <StatTile
            label={t.instructor.minScore}
            value={
              analytics.lowestScore === null ? '—' : formatDecimal(analytics.lowestScore, locale, 2)
            }
          />
          <StatTile
            label={t.instructor.avgProfit}
            value={
              analytics.averageCumulativeProfit === null
                ? '—'
                : formatMoneyCompact(analytics.averageCumulativeProfit, locale)
            }
          />
          <StatTile
            label={t.instructor.avgShare}
            value={
              analytics.averageFinalMarketShare === null
                ? '—'
                : formatPercent(analytics.averageFinalMarketShare, locale)
            }
          />
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <a
            href={`/api/instructor/export?assignmentId=${assignment.id}&type=results`}
            className="rounded-md bg-brand-500 px-4 py-2 text-sm font-semibold text-ink-950 transition hover:bg-brand-400"
          >
            {t.common.export} · {t.report.scores}
          </a>
          <a
            href={`/api/instructor/export?assignmentId=${assignment.id}&type=quarters`}
            className="rounded-md border border-ink-600 bg-ink-800 px-4 py-2 text-sm font-semibold text-ink-100 transition hover:bg-ink-700"
          >
            {t.common.export} · {t.history.decisionsTable}
          </a>
        </div>
        <p className="mt-2 text-xs text-ink-400">{t.instructor.exportHint}</p>
      </Card>

      {/* Sortable class leaderboard */}
      <Card>
        <CardTitle
          hint={t.leaderboard.tieBreakNote}
          right={
            <div className="flex flex-wrap items-center gap-1.5 text-xs">
              <span className="text-ink-400">{t.leaderboard.sortBy}:</span>
              {LEADERBOARD_SORTS.map((option) => (
                <Link
                  key={option}
                  href={`/instructor/assignments/${assignmentId}?sort=${option}`}
                  className={`rounded-md px-2 py-1 transition ${
                    option === sort
                      ? 'bg-ink-700 font-semibold text-ink-100'
                      : 'text-ink-400 hover:text-ink-200'
                  }`}
                >
                  {t.leaderboard[SORT_LABEL_KEY[option]]}
                </Link>
              ))}
            </div>
          }
        >
          {t.leaderboard.title}
        </CardTitle>

        {leaderboard.length === 0 ? (
          <EmptyState>{t.leaderboard.empty}</EmptyState>
        ) : (
          <TableScroll>
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  <Th align="center">{t.leaderboard.columnRank}</Th>
                  <Th>{t.leaderboard.columnStudent}</Th>
                  <Th>{t.leaderboard.columnCompany}</Th>
                  <Th align="right">{t.leaderboard.columnScore}</Th>
                  <Th align="right">{t.leaderboard.columnProfit}</Th>
                  <Th align="right">{t.leaderboard.columnShare}</Th>
                  <Th align="right">{t.leaderboard.columnCsat}</Th>
                  <Th align="right">{t.leaderboard.columnBrand}</Th>
                  <Th align="center">{t.leaderboard.columnGameRank}</Th>
                  <Th />
                </tr>
              </thead>
              <tbody>
                {leaderboard.map((entry, index) => (
                  <tr key={entry.sessionId}>
                    <Td numeric align="center">{index + 1}</Td>
                    <Td className="text-ink-100">
                      {entry.studentCode ? `${entry.studentCode} · ` : ''}
                      {entry.displayName}
                    </Td>
                    <Td className="text-ink-300">{entry.companyName}</Td>
                    <Td numeric align="right" className="font-semibold">
                      {formatDecimal(entry.finalScore, locale, 2)}
                    </Td>
                    <Td
                      numeric
                      align="right"
                      className={entry.cumulativeProfit < 0 ? 'text-bad-400' : undefined}
                    >
                      {formatMoneyCompact(entry.cumulativeProfit, locale)}
                    </Td>
                    <Td numeric align="right">{formatPercent(entry.finalMarketShare, locale)}</Td>
                    <Td numeric align="right">{formatScore(entry.finalCsat, locale)}</Td>
                    <Td numeric align="right">{formatScore(entry.finalBrand, locale)}</Td>
                    <Td numeric align="center">{entry.gameRank}</Td>
                    <Td align="right">
                      <Link
                        href={`/instructor/students/${entry.sessionId}`}
                        className="text-brand-400 underline-offset-2 hover:underline"
                      >
                        {t.instructor.viewDetail}
                      </Link>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableScroll>
        )}
      </Card>

      {/* Participation, including students who never started */}
      <Card>
        <CardTitle>{t.instructor.participation}</CardTitle>
        {participation.length === 0 ? (
          <EmptyState>{t.common.none}</EmptyState>
        ) : (
          <TableScroll>
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  <Th>{t.instructor.studentCode}</Th>
                  <Th>{t.common.student}</Th>
                  <Th>{t.home.status}</Th>
                  <Th align="center">{t.common.quarter}</Th>
                  <Th align="right">{t.home.finalScore}</Th>
                  <Th>{t.home.startedAt}</Th>
                  <Th />
                </tr>
              </thead>
              <tbody>
                {participation.map((row) => (
                  <tr key={row.member.uid}>
                    <Td className="font-mono text-xs">{row.member.studentCode}</Td>
                    <Td className="text-ink-100">{row.member.displayName}</Td>
                    <Td>
                      <Badge
                        tone={
                          row.status === 'COMPLETED'
                            ? 'good'
                            : row.status === 'IN_PROGRESS'
                              ? 'info'
                              : 'neutral'
                        }
                      >
                        {row.status === 'COMPLETED'
                          ? t.home.statusCompleted
                          : row.status === 'IN_PROGRESS'
                            ? t.home.statusInProgress
                            : t.instructor.notStarted}
                      </Badge>
                    </Td>
                    <Td numeric align="center">{row.quartersPlayed}/6</Td>
                    <Td numeric align="right">
                      {row.result ? formatDecimal(row.result.finalScore, locale, 2) : '—'}
                    </Td>
                    <Td className="text-ink-400">
                      {row.session ? formatDate(row.session.startedAt, locale) : '—'}
                    </Td>
                    <Td align="right">
                      {sessionByUser.get(row.member.uid) ? (
                        <Link
                          href={`/instructor/students/${sessionByUser.get(row.member.uid)}`}
                          className="text-brand-400 underline-offset-2 hover:underline"
                        >
                          {t.instructor.viewDetail}
                        </Link>
                      ) : null}
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
