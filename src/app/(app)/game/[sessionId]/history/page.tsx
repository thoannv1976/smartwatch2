import Link from 'next/link';
import { notFound } from 'next/navigation';
import { PLAYER_COMPANY_KEY } from '@/domain/simulation';
import { requireUserPage } from '@/server/auth/guards';
import { getRepositories } from '@/db/repositories/firestore';
import { createGameService } from '@/server/game/service';
import { isGameError } from '@/server/game/errors';
import { getTranslations } from '@/i18n/server';
import { HistoryCharts } from '@/components/game/HistoryCharts';
import {
  Card,
  CardTitle,
  EmptyState,
  PageHeader,
  TableScroll,
  Td,
  Th,
} from '@/components/ui/primitives';
import {
  formatInteger,
  formatMoneyCompact,
  formatPercent,
  formatScore,
} from '@/lib/format';

export const metadata = { title: 'Lịch sử chiến lược — Smartwatch CEO Challenge' };

/** Strategy history (spec 12): the Q1-Q6 decision and performance tables plus charts. */
export default async function HistoryPage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const { sessionId } = await params;
  const user = await requireUserPage(`/game/${sessionId}/history`);
  const { t, locale } = await getTranslations();

  const service = createGameService(getRepositories());
  let session;
  try {
    session = await service.getOwnedSession(sessionId, user.uid);
  } catch (error) {
    if (isGameError(error)) notFound();
    throw error;
  }

  const quarters = await service.listQuarters(sessionId);

  if (quarters.length === 0) {
    return (
      <main className="mx-auto flex max-w-5xl flex-col gap-6 px-4 py-8 sm:px-6">
        <PageHeader title={t.history.title} subtitle={session.companyName} />
        <EmptyState>{t.history.noData}</EmptyState>
      </main>
    );
  }

  const playerRows = quarters.map((q) => ({
    quarter: q.quarter,
    eventKey: q.eventKey,
    decision: q.decisions[PLAYER_COMPANY_KEY],
    result: q.results.find((r) => r.companyKey === PLAYER_COMPANY_KEY),
  }));

  return (
    <main className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-8 sm:px-6">
      <PageHeader
        title={t.history.title}
        subtitle={`${session.companyName} · ${session.productName}`}
        right={
          <Link
            href={`/game/${sessionId}`}
            className="rounded-md border border-ink-600 bg-ink-800 px-4 py-2 text-sm text-ink-100 transition hover:bg-ink-700"
          >
            {t.dashboard.title}
          </Link>
        }
      />

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
              </tr>
            </thead>
            <tbody>
              {playerRows.map(({ quarter, eventKey, decision }) => (
                <tr key={quarter}>
                  <Td numeric align="center" className="font-semibold">
                    {t.common.quarterShort}
                    {quarter}
                  </Td>
                  <Td className="text-ink-300">{t.events[eventKey]}</Td>
                  <Td numeric align="right">{decision?.productPoints ?? '—'}</Td>
                  <Td numeric align="right">{decision?.technologyPoints ?? '—'}</Td>
                  <Td numeric align="right">{decision?.marketingPoints ?? '—'}</Td>
                  <Td numeric align="right">{decision?.distributionPoints ?? '—'}</Td>
                  <Td numeric align="right">{decision?.cxPoints ?? '—'}</Td>
                  <Td numeric align="right">{decision?.priceIndex ?? '—'}</Td>
                </tr>
              ))}
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
                <Th align="right">{t.kpi.unitsSold}</Th>
                <Th align="right">{t.kpi.revenue}</Th>
                <Th align="right">{t.kpi.netProfit}</Th>
                <Th align="right">{t.kpi.marketShare}</Th>
                <Th align="right">{t.kpi.cash}</Th>
                <Th align="right">{t.kpi.productQuality}</Th>
                <Th align="right">{t.kpi.technology}</Th>
                <Th align="right">{t.kpi.brandAwareness}</Th>
                <Th align="right">{t.kpi.distribution}</Th>
                <Th align="right">{t.kpi.customerExperience}</Th>
                <Th align="right">{t.kpi.customerSatisfaction}</Th>
                <Th align="center">{t.kpi.rank}</Th>
              </tr>
            </thead>
            <tbody>
              {playerRows.map(({ quarter, result }) => (
                <tr key={quarter}>
                  <Td numeric align="center" className="font-semibold">
                    {t.common.quarterShort}
                    {quarter}
                  </Td>
                  <Td numeric align="right">
                    {result ? formatInteger(result.unitsSold, locale) : '—'}
                  </Td>
                  <Td numeric align="right">
                    {result ? formatMoneyCompact(result.revenue, locale) : '—'}
                  </Td>
                  <Td
                    numeric
                    align="right"
                    className={result && result.netProfit < 0 ? 'text-bad-400' : undefined}
                  >
                    {result ? formatMoneyCompact(result.netProfit, locale) : '—'}
                  </Td>
                  <Td numeric align="right">
                    {result ? formatPercent(result.marketShare, locale) : '—'}
                  </Td>
                  <Td
                    numeric
                    align="right"
                    className={result && result.cash < 0 ? 'text-bad-400' : undefined}
                  >
                    {result ? formatMoneyCompact(result.cash, locale) : '—'}
                  </Td>
                  <Td numeric align="right">
                    {result ? formatScore(result.productQuality, locale) : '—'}
                  </Td>
                  <Td numeric align="right">
                    {result ? formatScore(result.technology, locale) : '—'}
                  </Td>
                  <Td numeric align="right">
                    {result ? formatScore(result.brandAwareness, locale) : '—'}
                  </Td>
                  <Td numeric align="right">
                    {result ? formatScore(result.distribution, locale) : '—'}
                  </Td>
                  <Td numeric align="right">
                    {result ? formatScore(result.customerExperience, locale) : '—'}
                  </Td>
                  <Td numeric align="right">
                    {result ? formatScore(result.customerSatisfaction, locale) : '—'}
                  </Td>
                  <Td numeric align="center">{result?.rank ?? '—'}</Td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableScroll>
      </Card>

      <HistoryCharts
        resultsByQuarter={quarters.map((q) => ({ quarter: q.quarter, results: q.results }))}
        playerCompanyName={session.companyName}
      />
    </main>
  );
}
