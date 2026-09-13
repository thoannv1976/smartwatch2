import Link from 'next/link';
import { notFound } from 'next/navigation';
import { LEADERBOARD_SORTS, type LeaderboardSort } from '@/db/models';
import { requireUserPage } from '@/server/auth/guards';
import { getRepositories } from '@/db/repositories/firestore';
import { hasRole } from '@/server/auth/session';
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
} from '@/components/ui/primitives';
import { formatDecimal, formatMoneyCompact, formatPercent, formatScore } from '@/lib/format';

export const metadata = { title: 'Bảng xếp hạng lớp — Smartwatch CEO Challenge' };

const SORT_LABEL_KEY: Record<LeaderboardSort, 'columnScore' | 'columnProfit' | 'columnShare' | 'columnCsat' | 'columnBrand'> = {
  finalScore: 'columnScore',
  cumulativeProfit: 'columnProfit',
  finalMarketShare: 'columnShare',
  finalCsat: 'columnCsat',
  finalBrand: 'columnBrand',
};

/**
 * Class leaderboard (spec 8.3).
 *
 * Only entries from the same assignment are listed, and the scenario/engine
 * version is shown, because results are only comparable within one
 * assignment/scenario/engine combination (spec 13.3).
 */
export default async function LeaderboardPage({
  params,
  searchParams,
}: {
  params: Promise<{ assignmentId: string }>;
  searchParams: Promise<{ sort?: string }>;
}) {
  const { assignmentId } = await params;
  const user = await requireUserPage(`/leaderboard/${assignmentId}`);
  const { t, locale } = await getTranslations();
  const query = await searchParams;

  const sort: LeaderboardSort = LEADERBOARD_SORTS.includes(query.sort as LeaderboardSort)
    ? (query.sort as LeaderboardSort)
    : 'finalScore';

  const repos = getRepositories();
  const assignment = await repos.assignments.get(assignmentId);
  if (!assignment) notFound();

  // A student may only see the board of a course they belong to.
  const isStaff = hasRole(user.role, 'INSTRUCTOR');
  if (!isStaff) {
    const member = await repos.courses.getMember(assignment.courseId, user.uid);
    if (!member) notFound();
  }

  const entries = await repos.finalResults.listByAssignment(assignmentId, sort);
  const course = await repos.courses.get(assignment.courseId);

  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-6 px-4 py-8 sm:px-6">
      <PageHeader
        title={t.leaderboard.title}
        subtitle={`${assignment.title}${course ? ` · ${course.courseName}` : ''}`}
        right={
          <Badge tone="neutral">
            {assignment.scenarioVersion} · engine {assignment.engineVersion}
          </Badge>
        }
      />

      <Card>
        <CardTitle
          hint={`${t.leaderboard.subtitle} ${t.leaderboard.tieBreakNote}`}
          right={
            <div className="flex flex-wrap items-center gap-1.5 text-xs">
              <span className="text-ink-400">{t.leaderboard.sortBy}:</span>
              {LEADERBOARD_SORTS.map((option) => (
                <Link
                  key={option}
                  href={`/leaderboard/${assignmentId}?sort=${option}`}
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
          {entries.length} {t.instructor.completed}
        </CardTitle>

        {entries.length === 0 ? (
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
                </tr>
              </thead>
              <tbody>
                {entries.map((entry, index) => {
                  const isMe = entry.userId === user.uid;
                  return (
                    <tr key={entry.sessionId} className={isMe ? 'bg-brand-500/10' : ''}>
                      <Td numeric align="center" className={isMe ? 'font-bold' : ''}>
                        {index + 1}
                      </Td>
                      <Td className={isMe ? 'font-bold text-ink-100' : 'text-ink-200'}>
                        {entry.studentCode ? `${entry.studentCode} · ` : ''}
                        {entry.displayName}
                        {isMe ? (
                          <span className="ml-2 rounded-full border border-brand-600/60 bg-brand-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-brand-400">
                            {t.common.you}
                          </span>
                        ) : null}
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
                      <Td numeric align="right">
                        {formatPercent(entry.finalMarketShare, locale)}
                      </Td>
                      <Td numeric align="right">{formatScore(entry.finalCsat, locale)}</Td>
                      <Td numeric align="right">{formatScore(entry.finalBrand, locale)}</Td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </TableScroll>
        )}
      </Card>

      <Link
        href="/home"
        className="w-fit rounded-md border border-ink-600 px-5 py-2.5 text-sm text-ink-200 transition hover:bg-ink-800"
      >
        {t.home.title}
      </Link>
    </main>
  );
}
