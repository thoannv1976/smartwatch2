import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  PLAYER_COMPANY_KEY,
  boardLetter,
  customerVoices,
  getGameConfig,
  pressHeadlines,
  reviewQuarter,
  scoreForecast,
} from '@/domain/simulation';
import { requireUserPage } from '@/server/auth/guards';
import { getRepositories } from '@/db/repositories/firestore';
import { quarterForecast } from '@/db/models';
import { createGameService } from '@/server/game/service';
import { isGameError } from '@/server/game/errors';
import { getTranslations } from '@/i18n/server';
import { interpolate } from '@/i18n';
import { RankingTable } from '@/components/game/RankingTable';
import { QuarterReviewCard } from '@/components/game/QuarterReview';
import { ForecastReviewCard } from '@/components/game/ForecastReview';
import { BoardLetterCard, PressRoom } from '@/components/game/PressRoom';
import {
  Badge,
  Card,
  CardTitle,
  PageHeader,
  StatTile,
  TableScroll,
  Td,
  Th,
  WarningNote,
} from '@/components/ui/primitives';
import {
  formatInteger,
  formatMoney,
  formatMoneyCompact,
  formatPercent,
  formatPercentagePoints,
  formatScore,
  formatSignedPercent,
  relativeChange,
} from '@/lib/format';

export const metadata = { title: 'Kết quả quý — Smartwatch CEO Challenge' };

/** Quarter result screen (spec 8.1). */
export default async function QuarterResultPage({
  params,
}: {
  params: Promise<{ sessionId: string; quarter: string }>;
}) {
  const { sessionId, quarter: quarterParam } = await params;
  const user = await requireUserPage(`/game/${sessionId}`);
  const { t, locale } = await getTranslations();

  const quarterNumber = Number(quarterParam);
  if (!Number.isInteger(quarterNumber)) notFound();

  const service = createGameService(getRepositories());
  let session;
  try {
    session = await service.getOwnedSession(sessionId, user.uid);
  } catch (error) {
    if (isGameError(error)) notFound();
    throw error;
  }

  const config = getGameConfig(session.scenarioVersion);
  const quarters = await service.listQuarters(sessionId);
  const current = quarters.find((q) => q.quarter === quarterNumber);
  if (!current) notFound();

  const previous = quarters.find((q) => q.quarter === quarterNumber - 1) ?? null;
  const result = current.results.find((r) => r.companyKey === PLAYER_COMPANY_KEY);
  if (!result) notFound();

  const previousResult = previous?.results.find((r) => r.companyKey === PLAYER_COMPANY_KEY) ?? null;
  const decision = current.decisions[PLAYER_COMPANY_KEY];

  // Absent for every quarter played before predictions existed, so the card is
  // simply not rendered rather than showing a miss the student never made.
  const forecast = quarterForecast(current);
  const forecastScore = forecast ? scoreForecast(forecast, result) : null;

  // The market told as something that happened, derived from the same figures
  // the tiles above already show. Pure — see `press.ts`.
  const pressFacts = decision
    ? {
        companyName: session.companyName,
        quarter: quarterNumber,
        eventKey: current.eventKey,
        weights: current.weights,
        decision,
        result,
        previous: previousResult,
        config,
      }
    : null;
  const headlines = pressFacts ? pressHeadlines(pressFacts) : [];
  const voices = pressFacts ? customerVoices(pressFacts) : [];
  const letter = pressFacts
    ? boardLetter(
        pressFacts,
        quarters
          .filter((q) => q.quarter < quarterNumber)
          .map((q) => q.results.find((r) => r.companyKey === PLAYER_COMPANY_KEY))
          .filter((row): row is NonNullable<typeof row> => Boolean(row)),
      )
    : null;

  const revenueChange = previousResult ? relativeChange(result.revenue, previousResult.revenue) : null;
  const profitChange = previousResult
    ? relativeChange(result.netProfit, previousResult.netProfit)
    : null;
  const shareChange = previousResult ? result.marketShare - previousResult.marketShare : null;

  // The review reads the demand weights STORED on this quarter, so a session
  // played under an older scenario is judged against the market it faced.
  const reviewNotes = decision
    ? reviewQuarter(
        { quarter: quarterNumber, weights: current.weights, decision, result },
        previousResult,
      )
    : [];

  const isLastQuarter = quarterNumber >= config.quarters;
  const hasNextQuarter = session.currentRound < config.quarters;

  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-6 px-4 py-8 sm:px-6">
      <PageHeader
        title={`${t.common.quarterShort}${quarterNumber} · ${t.result.title}`}
        subtitle={session.companyName}
        right={<Badge tone="info">{t.events[current.eventKey]}</Badge>}
      />

      <Card>
        <CardTitle>{t.result.eventContext}</CardTitle>
        <p className="max-w-prose text-sm text-ink-300">{t.eventDesc[current.eventKey]}</p>
        <p className="tnum mt-2 text-xs text-ink-400">
          {t.dashboard.marketSize}: {formatInteger(current.marketUnits, locale)} {t.dashboard.units}
        </p>
      </Card>

      <Card>
        <CardTitle>{t.result.title}</CardTitle>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatTile
            emphasis
            label={t.kpi.revenue}
            value={formatMoneyCompact(result.revenue, locale)}
            delta={revenueChange === null ? undefined : formatSignedPercent(revenueChange, locale)}
            deltaTone={revenueChange === null ? 'neutral' : revenueChange >= 0 ? 'good' : 'bad'}
          />
          <StatTile
            emphasis
            label={t.kpi.netProfit}
            value={formatMoneyCompact(result.netProfit, locale)}
            delta={profitChange === null ? undefined : formatSignedPercent(profitChange, locale)}
            deltaTone={result.netProfit >= 0 ? 'good' : 'bad'}
          />
          <StatTile
            emphasis
            label={t.kpi.marketShare}
            value={formatPercent(result.marketShare, locale)}
            delta={shareChange === null ? undefined : formatPercentagePoints(shareChange, locale)}
            deltaTone={shareChange === null ? 'neutral' : shareChange >= 0 ? 'good' : 'bad'}
          />
          <StatTile
            emphasis
            label={t.kpi.rank}
            value={`${result.rank} / ${current.results.length}`}
          />
          <StatTile label={t.kpi.unitsSold} value={formatInteger(result.unitsSold, locale)} />
          <StatTile label={t.kpi.actualPrice} value={formatMoney(result.actualPrice, locale)} />
          <StatTile
            label={t.kpi.grossProfit}
            value={formatMoneyCompact(result.grossProfit, locale)}
          />
          <StatTile
            label={t.kpi.netProfitMargin}
            value={formatPercent(result.netProfitMargin, locale)}
            deltaTone={result.netProfitMargin >= 0 ? 'good' : 'bad'}
          />
          <StatTile
            label={t.kpi.customerSatisfaction}
            value={formatScore(result.customerSatisfaction, locale)}
          />
          <StatTile
            label={t.kpi.cash}
            value={formatMoneyCompact(result.cash, locale)}
            deltaTone={result.cash >= 0 ? 'neutral' : 'bad'}
          />
          <StatTile label={t.kpi.cogs} value={formatMoneyCompact(result.cogs, locale)} />
          <StatTile
            label={t.kpi.returnCost}
            value={formatMoneyCompact(result.returnCost, locale)}
          />
        </div>

        {result.intermediates.unfulfilledUnits > 0 ? (
          <div className="mt-4">
            <WarningNote>
              {t.result.unfulfilledDemand}:{' '}
              <span className="tnum font-semibold">
                {formatInteger(result.intermediates.unfulfilledUnits, locale)}
              </span>{' '}
              {t.dashboard.units} — {t.result.unfulfilledHint}
            </WarningNote>
          </div>
        ) : null}

        {result.cash < 0 ? (
          <div className="mt-3">
            <WarningNote>{t.dashboard.cashWarning}</WarningNote>
          </div>
        ) : null}
      </Card>

      {decision ? (
        <Card>
          <CardTitle>{t.result.yourDecision}</CardTitle>
          <TableScroll>
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  <Th align="right">{t.decision.product}</Th>
                  <Th align="right">{t.decision.technology}</Th>
                  <Th align="right">{t.decision.marketing}</Th>
                  <Th align="right">{t.decision.distribution}</Th>
                  <Th align="right">{t.decision.cx}</Th>
                  <Th align="right">{t.decision.priceIndex}</Th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <Td numeric align="right">{decision.productPoints}</Td>
                  <Td numeric align="right">{decision.technologyPoints}</Td>
                  <Td numeric align="right">{decision.marketingPoints}</Td>
                  <Td numeric align="right">{decision.distributionPoints}</Td>
                  <Td numeric align="right">{decision.cxPoints}</Td>
                  <Td numeric align="right">{decision.priceIndex}</Td>
                </tr>
              </tbody>
            </table>
          </TableScroll>
        </Card>
      ) : null}

      <Card>
        <CardTitle>{t.dashboard.ranking}</CardTitle>
        <RankingTable
          results={current.results}
          locale={locale}
          playerCompanyName={session.companyName}
        />
      </Card>

      {/* Competitor intelligence: qualitative sentences only. Exact AI point
          allocations are never sent to a student (spec 7.3). */}
      <Card>
        <CardTitle hint={t.result.intelDisclaimer}>{t.result.competitorIntel}</CardTitle>
        <ul className="flex flex-col gap-2">
          {current.intel.map((entry) => (
            <li key={entry.companyKey} className="text-sm text-ink-300">
              • {interpolate(t.intel[entry.key], { company: entry.companyName })}
            </li>
          ))}
        </ul>
      </Card>

      {/* The rule-based review of this quarter's decision, directly below the
          competitor intelligence. */}
      <PressRoom t={t} locale={locale} headlines={headlines} voices={voices} />

      {forecastScore ? <ForecastReviewCard t={t} score={forecastScore} /> : null}

      <QuarterReviewCard t={t} notes={reviewNotes} />

      {letter ? <BoardLetterCard t={t} locale={locale} letter={letter} /> : null}

      <div className="flex flex-wrap gap-3">
        {isLastQuarter || !hasNextQuarter ? (
          <Link
            href={`/report/${sessionId}`}
            className="rounded-md bg-brand-500 px-5 py-2.5 text-sm font-semibold text-ink-950 transition hover:bg-brand-400"
          >
            {t.result.finish}
          </Link>
        ) : (
          <Link
            href={`/game/${sessionId}/decision`}
            className="rounded-md bg-brand-500 px-5 py-2.5 text-sm font-semibold text-ink-950 transition hover:bg-brand-400"
          >
            {t.result.continueNext}
          </Link>
        )}
        <Link
          href={`/game/${sessionId}/history`}
          className="rounded-md border border-ink-600 bg-ink-800 px-5 py-2.5 text-sm text-ink-100 transition hover:bg-ink-700"
        >
          {t.dashboard.viewHistory}
        </Link>
        <Link
          href={`/game/${sessionId}`}
          className="rounded-md border border-ink-600 px-5 py-2.5 text-sm text-ink-200 transition hover:bg-ink-800"
        >
          {t.dashboard.title}
        </Link>
      </div>
    </main>
  );
}
