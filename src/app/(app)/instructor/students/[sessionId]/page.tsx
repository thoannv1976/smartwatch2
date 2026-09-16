import Link from 'next/link';
import { notFound } from 'next/navigation';
import { PLAYER_COMPANY_KEY } from '@/domain/simulation';
import { requireRolePage } from '@/server/auth/guards';
import { getRepositories } from '@/db/repositories/firestore';
import { goldenUsedQuarters } from '@/db/models';
import { hasRole } from '@/server/auth/session';
import { createGameService } from '@/server/game/service';
import { getStudentDetail } from '@/server/instructor/queries';
import { getTranslations } from '@/i18n/server';
import { interpolate } from '@/i18n';
import { seriesColor } from '@/components/charts/series';
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
  formatInteger,
  formatMoneyCompact,
  formatPercent,
  formatScore,
} from '@/lib/format';

export const metadata = { title: 'Chi tiết sinh viên — Smartwatch CEO Challenge' };

/**
 * Student detail (spec 9.4, 13.4).
 *
 * Shows the full six-quarter audit trail — every decision next to the result it
 * produced — including the five AI competitors' exact allocations, which
 * instructors and admins may see and students may not (spec 7.3).
 */
export default async function StudentDetailPage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const { sessionId } = await params;
  const user = await requireRolePage('INSTRUCTOR', `/instructor/students/${sessionId}`);
  const { t, locale } = await getTranslations();

  const detail = await getStudentDetail(sessionId);
  if (!detail) notFound();
  const { session, quarters, result, user: student } = detail;

  const repos = getRepositories();

  // An instructor may only inspect sessions from a course they own.
  if (!hasRole(user.role, 'ADMIN')) {
    if (!session.assignmentId) notFound();
    const assignment = await repos.assignments.get(session.assignmentId);
    const course = assignment ? await repos.courses.get(assignment.courseId) : null;
    if (!course || course.instructorId !== user.uid) notFound();
  }

  const scores = quarters.length > 0 ? createGameService(repos).scoreSession(session, quarters) : [];
  const analysis = quarters.length > 0 ? createGameService(repos).analyse(session, quarters) : null;
  const playerScore = scores.find((s) => s.companyKey === PLAYER_COMPANY_KEY) ?? null;
  const coachedQuarters = goldenUsedQuarters(session);

  return (
    <main className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-8 sm:px-6">
      <PageHeader
        title={student?.displayName ?? session.userId}
        subtitle={`${session.companyName} · ${session.productName} · ${t.positioning[session.positioning]}`}
        right={
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={session.mode === 'OFFICIAL' ? 'brand' : 'neutral'}>
              {session.mode === 'OFFICIAL' ? t.home.modeOfficial : t.home.modePractice}
            </Badge>
            <Badge tone="neutral">
              {session.scenarioVersion} · {session.engineVersion}
            </Badge>
            {/* Two scores are not directly comparable if one of them was
                coached, so this is shown next to the identity, not buried. */}
            <Badge tone={coachedQuarters.length > 0 ? 'warn' : 'neutral'}>
              {coachedQuarters.length > 0
                ? `${t.printing.goldenUsed} ${coachedQuarters.join(', ')}`
                : t.printing.goldenNone}
            </Badge>
            {session.assignmentId ? (
              <Link
                href={`/instructor/assignments/${session.assignmentId}`}
                className="rounded-md border border-ink-600 bg-ink-800 px-3 py-1.5 text-xs text-ink-100 transition hover:bg-ink-700"
              >
                {t.instructor.assignments}
              </Link>
            ) : null}
          </div>
        }
      />

      <Card>
        <CardTitle>
          {t.home.startedAt}: {formatDate(session.startedAt, locale)} ·{' '}
          {t.instructor.officialSeed}: <span className="font-mono">{session.randomSeed}</span>
        </CardTitle>
        {result || playerScore ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatTile
              emphasis
              label={t.report.finalScore}
              value={formatDecimal((result?.finalScore ?? playerScore?.finalScore) ?? 0, locale, 2)}
            />
            <StatTile
              label={t.report.gameRank}
              value={`${result?.gameRank ?? playerScore?.gameRank ?? '—'} / 6`}
            />
            <StatTile
              label={t.report.cumulativeProfit}
              value={formatMoneyCompact(
                (result?.cumulativeProfit ?? playerScore?.cumulativeProfit) ?? 0,
                locale,
              )}
            />
            <StatTile
              label={t.report.finalMarketShare}
              value={formatPercent(
                (result?.finalMarketShare ?? playerScore?.finalMarketShare) ?? 0,
                locale,
              )}
            />
          </div>
        ) : (
          <EmptyState>{t.report.notCompleted}</EmptyState>
        )}
      </Card>

      {quarters.length === 0 ? (
        <EmptyState>{t.history.noData}</EmptyState>
      ) : (
        <>
          <Card>
            <CardTitle>{t.history.decisionsTable}</CardTitle>
            <TableScroll>
              <table className="w-full border-collapse">
                <thead>
                  <tr>
                    <Th align="center">{t.common.quarter}</Th>
                    <Th>{t.dashboard.marketEvent}</Th>
                    <Th align="right">{t.decision.product}</Th>
                    <Th align="right">{t.decision.technology}</Th>
                    <Th align="right">{t.decision.marketing}</Th>
                    <Th align="right">{t.decision.distribution}</Th>
                    <Th align="right">{t.decision.cx}</Th>
                    <Th align="right">{t.decision.priceIndex}</Th>
                    <Th align="right">{t.kpi.unitsSold}</Th>
                    <Th align="right">{t.kpi.revenue}</Th>
                    <Th align="right">{t.kpi.netProfit}</Th>
                    <Th align="right">{t.kpi.marketShare}</Th>
                    <Th align="center">{t.kpi.rank}</Th>
                  </tr>
                </thead>
                <tbody>
                  {quarters.map((quarter) => {
                    const decision = quarter.decisions[PLAYER_COMPANY_KEY];
                    const row = quarter.results.find((r) => r.companyKey === PLAYER_COMPANY_KEY);
                    return (
                      <tr key={quarter.quarter}>
                        <Td numeric align="center" className="font-semibold">
                          {t.common.quarterShort}
                          {quarter.quarter}
                        </Td>
                        <Td className="text-ink-300">{t.events[quarter.eventKey]}</Td>
                        <Td numeric align="right">{decision?.productPoints ?? '—'}</Td>
                        <Td numeric align="right">{decision?.technologyPoints ?? '—'}</Td>
                        <Td numeric align="right">{decision?.marketingPoints ?? '—'}</Td>
                        <Td numeric align="right">{decision?.distributionPoints ?? '—'}</Td>
                        <Td numeric align="right">{decision?.cxPoints ?? '—'}</Td>
                        <Td numeric align="right">{decision?.priceIndex ?? '—'}</Td>
                        <Td numeric align="right">
                          {row ? formatInteger(row.unitsSold, locale) : '—'}
                        </Td>
                        <Td numeric align="right">
                          {row ? formatMoneyCompact(row.revenue, locale) : '—'}
                        </Td>
                        <Td
                          numeric
                          align="right"
                          className={row && row.netProfit < 0 ? 'text-bad-400' : undefined}
                        >
                          {row ? formatMoneyCompact(row.netProfit, locale) : '—'}
                        </Td>
                        <Td numeric align="right">
                          {row ? formatPercent(row.marketShare, locale) : '—'}
                        </Td>
                        <Td numeric align="center">{row?.rank ?? '—'}</Td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </TableScroll>
          </Card>

          <Card>
            <CardTitle>{t.history.resultsTable}</CardTitle>
            <TableScroll>
              <table className="w-full border-collapse">
                <thead>
                  <tr>
                    <Th align="center">{t.common.quarter}</Th>
                    <Th align="right">{t.kpi.productQuality}</Th>
                    <Th align="right">{t.kpi.technology}</Th>
                    <Th align="right">{t.kpi.brandAwareness}</Th>
                    <Th align="right">{t.kpi.distribution}</Th>
                    <Th align="right">{t.kpi.customerExperience}</Th>
                    <Th align="right">{t.kpi.customerSatisfaction}</Th>
                    <Th align="right">{t.kpi.cash}</Th>
                    <Th align="right">{t.kpi.netProfitMargin}</Th>
                  </tr>
                </thead>
                <tbody>
                  {quarters.map((quarter) => {
                    const row = quarter.results.find((r) => r.companyKey === PLAYER_COMPANY_KEY);
                    if (!row) return null;
                    return (
                      <tr key={quarter.quarter}>
                        <Td numeric align="center" className="font-semibold">
                          {t.common.quarterShort}
                          {quarter.quarter}
                        </Td>
                        <Td numeric align="right">{formatScore(row.productQuality, locale)}</Td>
                        <Td numeric align="right">{formatScore(row.technology, locale)}</Td>
                        <Td numeric align="right">{formatScore(row.brandAwareness, locale)}</Td>
                        <Td numeric align="right">{formatScore(row.distribution, locale)}</Td>
                        <Td numeric align="right">
                          {formatScore(row.customerExperience, locale)}
                        </Td>
                        <Td numeric align="right">
                          {formatScore(row.customerSatisfaction, locale)}
                        </Td>
                        <Td
                          numeric
                          align="right"
                          className={row.cash < 0 ? 'text-bad-400' : undefined}
                        >
                          {formatMoneyCompact(row.cash, locale)}
                        </Td>
                        <Td numeric align="right">{formatPercent(row.netProfitMargin, locale)}</Td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </TableScroll>
          </Card>

          {/* Instructor-only: the exact competitor allocations. */}
          <Card>
            <CardTitle hint={t.simTest.aiDecisions}>
              {t.simTest.aiDecisions} · <Badge tone="warn">INTERNAL</Badge>
            </CardTitle>
            <TableScroll>
              <table className="w-full border-collapse">
                <thead>
                  <tr>
                    <Th align="center">{t.common.quarter}</Th>
                    <Th>{t.common.company}</Th>
                    <Th align="right">{t.decision.product}</Th>
                    <Th align="right">{t.decision.technology}</Th>
                    <Th align="right">{t.decision.marketing}</Th>
                    <Th align="right">{t.decision.distribution}</Th>
                    <Th align="right">{t.decision.cx}</Th>
                    <Th align="right">{t.decision.priceIndex}</Th>
                  </tr>
                </thead>
                <tbody>
                  {quarters.flatMap((quarter) =>
                    Object.entries(quarter.decisions)
                      .filter(([key]) => key !== PLAYER_COMPANY_KEY)
                      .map(([companyKey, decision]) => (
                        <tr key={`${quarter.quarter}-${companyKey}`}>
                          <Td numeric align="center">
                            {t.common.quarterShort}
                            {quarter.quarter}
                          </Td>
                          <Td>
                            <span className="inline-flex items-center gap-2">
                              <span
                                aria-hidden
                                className="inline-block h-2 w-2 rounded-full"
                                style={{ background: seriesColor(companyKey) }}
                              />
                              {companyKey}
                            </span>
                          </Td>
                          <Td numeric align="right">{decision.productPoints}</Td>
                          <Td numeric align="right">{decision.technologyPoints}</Td>
                          <Td numeric align="right">{decision.marketingPoints}</Td>
                          <Td numeric align="right">{decision.distributionPoints}</Td>
                          <Td numeric align="right">{decision.cxPoints}</Td>
                          <Td numeric align="right">{decision.priceIndex}</Td>
                        </tr>
                      )),
                  )}
                </tbody>
              </table>
            </TableScroll>
          </Card>

          {analysis ? (
            <Card>
              <CardTitle>{t.report.strategyAnalysis}</CardTitle>
              <div className="flex flex-wrap gap-2">
                {analysis.labels.map((label) => (
                  <Badge key={label} tone="info">
                    {t.strategyLabels[label]}
                  </Badge>
                ))}
              </div>
              <ol className="mt-4 flex flex-col gap-2">
                {analysis.lessons.map((lesson, index) => (
                  <li key={lesson.key} className="text-sm text-ink-300">
                    {index + 1}. {interpolate(t.lessons[lesson.key], lesson.values)}
                  </li>
                ))}
              </ol>
            </Card>
          ) : null}
        </>
      )}
    </main>
  );
}
