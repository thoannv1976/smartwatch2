import Link from 'next/link';
import { notFound } from 'next/navigation';
import { PLAYER_COMPANY_KEY, classPercentile, getGameConfig } from '@/domain/simulation';
import { requireUserPage } from '@/server/auth/guards';
import { getRepositories } from '@/db/repositories/firestore';
import { createGameService } from '@/server/game/service';
import { isGameError } from '@/server/game/errors';
import { getClassRank } from '@/server/game/queries';
import { getTranslations } from '@/i18n/server';
import { interpolate } from '@/i18n';
import { BarChart } from '@/components/charts/BarChart';
import { HindsightPanel } from '@/components/game/HindsightPanel';
import { TenureReviewCard } from '@/components/game/TenureReview';
import { PrintButton } from '@/components/ui/PrintButton';
import { seriesColor } from '@/components/charts/series';
import {
  Badge,
  Card,
  CardTitle,
  EmptyState,
  InfoNote,
  PageHeader,
  StatTile,
  TableScroll,
  Td,
  Th,
  WarningNote,
} from '@/components/ui/primitives';
import {
  formatDecimal,
  formatMoneyCompact,
  formatPercent,
  formatScore,
} from '@/lib/format';

export const metadata = { title: 'Báo cáo tổng kết — Smartwatch CEO Challenge' };

/** Final report (spec 8.4): results, scores, class rank and rule-based analysis. */
export default async function ReportPage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const { sessionId } = await params;
  const user = await requireUserPage(`/report/${sessionId}`);
  const { t, locale } = await getTranslations();

  const repos = getRepositories();
  const service = createGameService(repos);

  let session;
  try {
    session = await service.getOwnedSession(sessionId, user.uid);
  } catch (error) {
    if (isGameError(error)) notFound();
    throw error;
  }

  const config = getGameConfig(session.scenarioVersion);
  const quarters = await service.listQuarters(sessionId);

  if (quarters.length < config.quarters) {
    return (
      <main className="mx-auto flex max-w-4xl flex-col gap-6 px-4 py-8 sm:px-6">
        <PageHeader title={t.report.title} subtitle={session.companyName} />
        <EmptyState>{t.report.notCompleted}</EmptyState>
        <Link
          href={`/game/${sessionId}`}
          className="w-fit rounded-md bg-brand-500 px-5 py-2.5 text-sm font-semibold text-ink-950 transition hover:bg-brand-400"
        >
          {t.home.continueGame}
        </Link>
      </main>
    );
  }

  const scores = service.scoreSession(session, quarters);
  const playerScore = scores.find((s) => s.companyKey === PLAYER_COMPANY_KEY);
  if (!playerScore) notFound();

  const analysis = service.analyse(session, quarters);
  const tenure = service.tenure(session, quarters, playerScore.finalScore);
  const goldenQuarters = service.goldenUses(session);
  const storedResult = await repos.finalResults.get(sessionId);
  const classRank = storedResult ? await getClassRank(storedResult) : null;
  // Null in a class too small to say anything without identifying people.
  const percentile = classRank ? classPercentile(classRank.rank, classRank.total) : null;

  const lastQuarter = quarters[quarters.length - 1]!;

  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-6 px-4 py-8 sm:px-6">
      {/* Identifies a printed copy as a submission. Hidden on screen. */}
      <div className="print-only text-xs">
        <p className="text-base font-bold">{t.report.title}</p>
        <p>
          {t.printing.player}: {user.displayName || user.email} · {session.companyName} ·{' '}
          {session.productName}
        </p>
        <p>
          {session.scenarioVersion} · {session.engineVersion} · {sessionId}
        </p>
        <p>
          {goldenQuarters.length > 0
            ? `${t.printing.goldenUsed} ${goldenQuarters.join(', ')}`
            : t.printing.goldenNone}
        </p>
      </div>

      <PageHeader
        title={t.report.title}
        subtitle={`${session.companyName} · ${session.productName} · ${t.report.subtitle}`}
        right={
          <div className="flex items-center gap-2">
            <Badge tone={session.mode === 'OFFICIAL' ? 'brand' : 'neutral'}>
              {session.mode === 'OFFICIAL' ? t.home.modeOfficial : t.home.modePractice}
            </Badge>
            <Badge tone="neutral">
              {session.scenarioVersion} · {session.engineVersion}
            </Badge>
          </div>
        }
      />

      {/* The headline number */}
      <Card className="border-brand-600/50 bg-brand-500/5">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs font-semibold tracking-wide text-brand-400 uppercase">
              {t.report.finalScore}
            </p>
            <p className="tnum mt-1 text-5xl font-bold text-ink-100">
              {formatDecimal(playerScore.finalScore, locale, 2)}
              <span className="ml-2 text-xl font-normal text-ink-400">/ 100</span>
            </p>
          </div>
          <div className="flex gap-6 text-right">
            <div>
              <p className="text-xs text-ink-400">{t.report.gameRank}</p>
              <p className="tnum text-2xl font-bold text-ink-100">
                {playerScore.gameRank} / {scores.length}
              </p>
            </div>
            {classRank ? (
              <div>
                <p className="text-xs text-ink-400">{t.report.classRank}</p>
                <p className="tnum text-2xl font-bold text-ink-100">
                  {classRank.rank} / {classRank.total}
                </p>
              </div>
            ) : null}
          </div>
        </div>

        {classRank ? (
          <div className="mt-4 border-t border-brand-600/20 pt-4">
            <p className="text-xs font-semibold tracking-wide text-brand-400 uppercase">
              {t.percentile.title}
            </p>
            {percentile ? (
              <p className="mt-1 text-sm text-ink-200">
                <span className="font-semibold">{t.percentile[percentile.band]}</span> ·{' '}
                {interpolate(t.percentile.youBeat, { value: percentile.percentile })}
              </p>
            ) : (
              <p className="mt-1 text-sm text-ink-400">{t.percentile.tooSmall}</p>
            )}
          </div>
        ) : null}
      </Card>

      {/* The verdict on all six quarters, above the three spec lessons — which
          stay exactly as they were. */}
      <TenureReviewCard t={t} locale={locale} review={tenure} />

      {/* Score breakdown: the weights are shown so a student can see what drove it */}
      <Card>
        <CardTitle>{t.report.scores}</CardTitle>
        <TableScroll>
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <Th>{t.report.scores}</Th>
                <Th align="right">{t.report.weight}</Th>
                <Th align="right">{t.common.total}</Th>
              </tr>
            </thead>
            <tbody>
              <ScoreRow
                label={t.report.profitScore}
                weight={config.scoreWeights.profit}
                value={playerScore.profitScore}
                locale={locale}
              />
              <ScoreRow
                label={t.report.marketShareScore}
                weight={config.scoreWeights.marketShare}
                value={playerScore.marketShareScore}
                locale={locale}
              />
              <ScoreRow
                label={t.report.brandScore}
                weight={config.scoreWeights.brand}
                value={playerScore.brandScore}
                locale={locale}
              />
              <ScoreRow
                label={t.report.csatScore}
                weight={config.scoreWeights.csat}
                value={playerScore.csatScore}
                locale={locale}
              />
              <ScoreRow
                label={t.report.innovationScore}
                weight={config.scoreWeights.innovation}
                value={playerScore.innovationScore}
                locale={locale}
              />
              <tr>
                <Td className="font-bold text-ink-100">{t.report.finalScore}</Td>
                <Td numeric align="right">
                  100%
                </Td>
                <Td numeric align="right" className="text-lg font-bold text-brand-400">
                  {formatDecimal(playerScore.finalScore, locale, 2)}
                </Td>
              </tr>
            </tbody>
          </table>
        </TableScroll>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardTitle>{t.report.financial}</CardTitle>
          <div className="grid gap-3 sm:grid-cols-2">
            <StatTile
              label={t.report.cumulativeRevenue}
              value={formatMoneyCompact(playerScore.cumulativeRevenue, locale)}
            />
            <StatTile
              label={t.report.cumulativeProfit}
              value={formatMoneyCompact(playerScore.cumulativeProfit, locale)}
              deltaTone={playerScore.cumulativeProfit >= 0 ? 'good' : 'bad'}
            />
            <StatTile
              label={t.report.finalMargin}
              value={formatPercent(playerScore.finalNetProfitMargin, locale)}
              deltaTone={playerScore.finalNetProfitMargin >= 0 ? 'good' : 'bad'}
            />
            <StatTile
              label={t.report.finalCash}
              value={formatMoneyCompact(playerScore.finalCash, locale)}
              deltaTone={playerScore.finalCash >= 0 ? 'neutral' : 'bad'}
            />
          </div>
          {playerScore.finalCash < 0 ? (
            <div className="mt-3">
              <WarningNote>{t.dashboard.cashWarning}</WarningNote>
            </div>
          ) : null}
        </Card>

        <Card>
          <CardTitle>{`${t.report.competitive} · ${t.report.product} · ${t.report.customer}`}</CardTitle>
          <div className="grid gap-3 sm:grid-cols-2">
            <StatTile
              label={t.report.finalMarketShare}
              value={formatPercent(playerScore.finalMarketShare, locale)}
            />
            <StatTile
              label={t.kpi.brandAwareness}
              value={formatScore(playerScore.finalBrand, locale)}
            />
            <StatTile
              label={t.kpi.productQuality}
              value={formatScore(playerScore.finalProductQuality, locale)}
            />
            <StatTile
              label={t.kpi.technology}
              value={formatScore(playerScore.finalTechnology, locale)}
            />
            <StatTile
              label={t.kpi.customerSatisfaction}
              value={formatScore(playerScore.finalCsat, locale)}
            />
          </div>
        </Card>
      </div>

      {/* Six-company comparison on the measure that decides the game */}
      <Card>
        <CardTitle>{`${t.dashboard.ranking} · ${t.report.finalScore}`}</CardTitle>
        <BarChart
          data={scores.map((score) => ({
            key: score.companyKey,
            label:
              score.companyKey === PLAYER_COMPANY_KEY ? session.companyName : score.companyName,
            value: score.finalScore,
            formattedValue: formatDecimal(score.finalScore, locale, 2),
            color: seriesColor(score.companyKey),
            emphasis: score.companyKey === PLAYER_COMPANY_KEY,
          }))}
        />
      </Card>

      {/* Rule-based analysis: no LLM, reproducible from the decisions (spec 8.4) */}
      <Card>
        <CardTitle hint={t.report.averageDecisions}>{t.report.strategyAnalysis}</CardTitle>

        <div className="flex flex-wrap gap-2">
          {analysis.labels.map((label) => (
            <Badge key={label} tone="info">
              {t.strategyLabels[label]}
            </Badge>
          ))}
        </div>

        <dl className="mt-4 grid grid-cols-2 gap-3 text-xs sm:grid-cols-3 lg:grid-cols-6">
          <Average label={t.decision.product} value={analysis.averages.productPoints} locale={locale} />
          <Average
            label={t.decision.technology}
            value={analysis.averages.technologyPoints}
            locale={locale}
          />
          <Average
            label={t.decision.marketing}
            value={analysis.averages.marketingPoints}
            locale={locale}
          />
          <Average
            label={t.decision.distribution}
            value={analysis.averages.distributionPoints}
            locale={locale}
          />
          <Average label={t.decision.cx} value={analysis.averages.cxPoints} locale={locale} />
          <Average
            label={t.decision.priceIndex}
            value={analysis.averages.priceIndex}
            locale={locale}
          />
        </dl>

        {analysis.positioningConsistent !== null ? (
          <div className="mt-4">
            <InfoNote>
              {t.report.positioningCheck}:{' '}
              {interpolate(
                analysis.positioningConsistent
                  ? t.lessons.positioningMatch
                  : t.lessons.positioningMismatch,
                { positioning: t.positioning[session.positioning] },
              )}
            </InfoNote>
          </div>
        ) : null}
      </Card>

      <Card>
        <CardTitle>{t.report.lessons}</CardTitle>
        <ol className="flex flex-col gap-3">
          {analysis.lessons.map((lesson, index) => (
            <li key={lesson.key} className="flex gap-3">
              <span className="tnum mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-500/15 text-xs font-bold text-brand-400">
                {index + 1}
              </span>
              <p className="text-sm text-ink-200">
                {interpolate(t.lessons[lesson.key], lesson.values)}
              </p>
            </li>
          ))}
        </ol>
      </Card>

      <HindsightPanel sessionId={sessionId} />

      <div className="no-print flex flex-wrap gap-3">
        <PrintButton />
        <Link
          href={`/game/${sessionId}/history`}
          className="rounded-md border border-ink-600 bg-ink-800 px-5 py-2.5 text-sm text-ink-100 transition hover:bg-ink-700"
        >
          {t.dashboard.viewHistory}
        </Link>
        <Link
          href={`/game/${sessionId}/result/${lastQuarter.quarter}`}
          className="rounded-md border border-ink-600 px-5 py-2.5 text-sm text-ink-200 transition hover:bg-ink-800"
        >
          {t.result.title} · {t.common.quarterShort}
          {lastQuarter.quarter}
        </Link>
        {session.assignmentId ? (
          <Link
            href={`/leaderboard/${session.assignmentId}`}
            className="rounded-md border border-ink-600 px-5 py-2.5 text-sm text-ink-200 transition hover:bg-ink-800"
          >
            {t.leaderboard.title}
          </Link>
        ) : null}
        <Link
          href="/home"
          className="rounded-md border border-ink-600 px-5 py-2.5 text-sm text-ink-200 transition hover:bg-ink-800"
        >
          {t.home.title}
        </Link>
      </div>
    </main>
  );
}

function ScoreRow({
  label,
  weight,
  value,
  locale,
}: {
  label: string;
  weight: number;
  value: number;
  locale: 'vi' | 'en';
}) {
  return (
    <tr>
      <Td className="text-ink-200">{label}</Td>
      <Td numeric align="right" className="text-ink-400">
        {formatPercent(weight, locale, 0)}
      </Td>
      <Td numeric align="right">
        {formatDecimal(value, locale, 1)}
      </Td>
    </tr>
  );
}

function Average({
  label,
  value,
  locale,
}: {
  label: string;
  value: number;
  locale: 'vi' | 'en';
}) {
  return (
    <div className="rounded-lg border border-ink-700/60 bg-ink-900/50 p-2.5">
      <dt className="truncate text-ink-400" title={label}>
        {label}
      </dt>
      <dd className="tnum mt-0.5 text-base font-semibold text-ink-100">
        {formatDecimal(value, locale, 1)}
      </dd>
    </div>
  );
}
