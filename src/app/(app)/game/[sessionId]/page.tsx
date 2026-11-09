import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import {
  PLAYER_COMPANY_KEY,
  getGameConfig,
  getMarketEvent,
  type CompanyQuarterResult,
} from '@/domain/simulation';
import { requireUserPage } from '@/server/auth/guards';
import { getRepositories } from '@/db/repositories/firestore';
import { createGameService } from '@/server/game/service';
import { isGameError } from '@/server/game/errors';
import { getTranslations } from '@/i18n/server';
import { RankingTable } from '@/components/game/RankingTable';
import { QuarterStepper } from '@/components/game/QuarterStepper';
import { EventBanner, bannerButtonClass } from '@/components/game/EventBanner';
import {
  ArrowRight,
  Banknote,
  HeartHandshake,
  PackageCheck,
  PieChart,
  TrendingUp,
  Wallet,
} from 'lucide-react';
import {
  Badge,
  CapabilityBar,
  Card,
  CardTitle,
  InfoNote,
  PageHeader,
  StatTile,
  WarningNote,
} from '@/components/ui/primitives';
import { seriesColor } from '@/components/charts/series';
import {
  formatInteger,
  formatMoneyCompact,
  formatPercent,
  formatPercentagePoints,
  formatScore,
  formatSignedPercent,
  relativeChange,
} from '@/lib/format';

export const metadata = { title: 'Bảng điều khiển CEO — Smartwatch CEO Challenge' };

/** CEO dashboard (spec 12): quarter, event, KPIs, capabilities and ranking. */
export default async function GameDashboardPage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const { sessionId } = await params;
  const user = await requireUserPage(`/game/${sessionId}`);
  const { t, locale } = await getTranslations();

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

  const lastQuarter = quarters[quarters.length - 1] ?? null;
  const previousQuarter = quarters[quarters.length - 2] ?? null;

  const playerResult =
    lastQuarter?.results.find((r) => r.companyKey === PLAYER_COMPANY_KEY) ?? null;
  const previousResult =
    previousQuarter?.results.find((r) => r.companyKey === PLAYER_COMPANY_KEY) ?? null;

  const nextQuarter = session.currentRound + 1;
  const finished = session.currentRound >= config.quarters;
  if (finished && session.status === 'COMPLETED') {
    // Nothing left to decide; the report is the useful destination.
    redirect(`/report/${sessionId}`);
  }

  const upcomingEvent = finished ? null : getMarketEvent(nextQuarter, config, session.randomSeed);
  const playerState = session.companies.find((c) => c.companyKey === PLAYER_COMPANY_KEY);

  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-6 px-4 py-8 sm:px-6">
      <PageHeader
        title={session.companyName}
        subtitle={`${session.productName} · ${t.positioning[session.positioning]}`}
        right={
          <div className="flex items-center gap-2">
            <Badge tone={session.mode === 'OFFICIAL' ? 'brand' : 'neutral'}>
              {session.mode === 'OFFICIAL' ? t.home.modeOfficial : t.home.modePractice}
            </Badge>
            <Badge tone="info">
              {t.common.quarterShort}
              {Math.min(nextQuarter, config.quarters)} / {config.quarters}
            </Badge>
          </div>
        }
      />

      <QuarterStepper
        total={config.quarters}
        completed={session.currentRound}
        label={t.dashboard.progress}
      />

      {/* The upcoming quarter's event, shown BEFORE the decision (spec 3.1 step 1) */}
      {upcomingEvent ? (
        <EventBanner
          eyebrow={`${t.common.quarterShort}${nextQuarter} · ${t.dashboard.marketEvent}`}
          eventKey={upcomingEvent.key}
          title={t.events[upcomingEvent.key]}
          description={t.eventDesc[upcomingEvent.key]}
          footnote={`${t.dashboard.marketSize}: ${formatInteger(upcomingEvent.marketUnits, locale)} ${t.dashboard.units}`}
          action={
            <Link href={`/game/${sessionId}/decision`} className={bannerButtonClass}>
              {t.dashboard.goToDecision}
              <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
          }
        />
      ) : (
        <Card>
          <InfoNote>{t.dashboard.gameCompleted}</InfoNote>
          <div className="mt-3 flex gap-2">
            <Link
              href={`/report/${sessionId}`}
              className="rounded-lg bg-brand-500 shadow-sm shadow-brand-500/25 px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-400"
            >
              {t.dashboard.viewReport}
            </Link>
          </div>
        </Card>
      )}

      {playerState && playerState.cash < 0 ? (
        <WarningNote>{t.dashboard.cashWarning}</WarningNote>
      ) : null}

      {/* Previous quarter performance (spec 3.1 step 2) */}
      {playerResult ? (
        <>
          <Card>
            <CardTitle>
              {t.result.title} · {t.common.quarterShort}
              {playerResult.quarter}
            </CardTitle>
            <KpiGrid
              result={playerResult}
              previous={previousResult}
              locale={locale}
              labels={t.kpi}
              vsPrevious={t.result.vsPrevious}
            />
          </Card>

          <Card>
            <CardTitle>{t.dashboard.ranking}</CardTitle>
            <RankingTable
              results={lastQuarter!.results}
              locale={locale}
              playerCompanyName={session.companyName}
            />
          </Card>
        </>
      ) : (
        <Card>
          <InfoNote>{t.dashboard.noResultYet}</InfoNote>
        </Card>
      )}

      {/* Current capabilities */}
      {playerState ? (
        <Card>
          <CardTitle>{t.decision.currentCapability}</CardTitle>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <CapabilityBar
              label={t.kpi.productQuality}
              value={playerState.productQuality}
              previous={previousResult?.productQuality}
              color={seriesColor('player')}
            />
            <CapabilityBar
              label={t.kpi.technology}
              value={playerState.technology}
              previous={previousResult?.technology}
              color={seriesColor('player')}
            />
            <CapabilityBar
              label={t.kpi.brandAwareness}
              value={playerState.brandAwareness}
              previous={previousResult?.brandAwareness}
              color={seriesColor('player')}
            />
            <CapabilityBar
              label={t.kpi.distribution}
              value={playerState.distribution}
              previous={previousResult?.distribution}
              color={seriesColor('player')}
            />
            <CapabilityBar
              label={t.kpi.customerExperience}
              value={playerState.customerExperience}
              previous={previousResult?.customerExperience}
              color={seriesColor('player')}
            />
            <CapabilityBar
              label={t.kpi.customerSatisfaction}
              value={playerState.customerSatisfaction}
              previous={previousResult?.customerSatisfaction}
              color={seriesColor('player')}
            />
          </div>
        </Card>
      ) : null}

      <div className="flex flex-wrap gap-3">
        {lastQuarter ? (
          <Link
            href={`/game/${sessionId}/result/${lastQuarter.quarter}`}
            className="rounded-lg border border-ink-700 bg-ink-850 shadow-sm px-4 py-2 text-sm font-semibold text-ink-100 transition hover:bg-ink-900"
          >
            {t.dashboard.viewLastResult}
          </Link>
        ) : null}
        <Link
          href={`/game/${sessionId}/history`}
          className="rounded-lg border border-ink-700 bg-ink-850 shadow-sm px-4 py-2 text-sm font-semibold text-ink-100 transition hover:bg-ink-900"
        >
          {t.dashboard.viewHistory}
        </Link>
      </div>
    </main>
  );
}

/** KPI tiles with quarter-over-quarter deltas (spec 8.1). */
function KpiGrid({
  result,
  previous,
  locale,
  labels,
  vsPrevious,
}: {
  result: CompanyQuarterResult;
  previous: CompanyQuarterResult | null;
  locale: 'vi' | 'en';
  labels: Record<string, string>;
  vsPrevious: string;
}) {
  const revenueChange = previous ? relativeChange(result.revenue, previous.revenue) : null;
  const profitChange = previous ? relativeChange(result.netProfit, previous.netProfit) : null;
  const shareChange = previous ? result.marketShare - previous.marketShare : null;
  const unitsChange = previous ? relativeChange(result.unitsSold, previous.unitsSold) : null;

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      <StatTile
        accent="indigo"
        icon={<Banknote className="h-4 w-4" aria-hidden />}
        label={labels.revenue}
        value={formatMoneyCompact(result.revenue, locale)}
        delta={
          revenueChange === null
            ? undefined
            : `${formatSignedPercent(revenueChange, locale)} ${vsPrevious}`
        }
        deltaTone={revenueChange === null ? 'neutral' : revenueChange >= 0 ? 'good' : 'bad'}
      />
      <StatTile
        accent="emerald"
        icon={<TrendingUp className="h-4 w-4" aria-hidden />}
        label={labels.netProfit}
        value={formatMoneyCompact(result.netProfit, locale)}
        delta={
          profitChange === null
            ? undefined
            : `${formatSignedPercent(profitChange, locale)} ${vsPrevious}`
        }
        deltaTone={result.netProfit >= 0 ? 'good' : 'bad'}
      />
      <StatTile
        accent="violet"
        icon={<PieChart className="h-4 w-4" aria-hidden />}
        label={labels.marketShare}
        value={formatPercent(result.marketShare, locale)}
        delta={shareChange === null ? undefined : formatPercentagePoints(shareChange, locale)}
        deltaTone={shareChange === null ? 'neutral' : shareChange >= 0 ? 'good' : 'bad'}
      />
      <StatTile
        accent="sky"
        icon={<PackageCheck className="h-4 w-4" aria-hidden />}
        label={labels.unitsSold}
        value={formatInteger(result.unitsSold, locale)}
        delta={unitsChange === null ? undefined : formatSignedPercent(unitsChange, locale)}
        deltaTone={unitsChange === null ? 'neutral' : unitsChange >= 0 ? 'good' : 'bad'}
      />
      <StatTile
        accent="amber"
        icon={<Wallet className="h-4 w-4" aria-hidden />}
        label={labels.cash}
        value={formatMoneyCompact(result.cash, locale)}
        deltaTone={result.cash >= 0 ? 'neutral' : 'bad'}
        delta={result.cash < 0 ? '⚠' : undefined}
      />
      <StatTile
        accent="rose"
        icon={<HeartHandshake className="h-4 w-4" aria-hidden />}
        label={labels.customerSatisfaction}
        value={formatScore(result.customerSatisfaction, locale)}
        delta={
          previous
            ? `${(result.customerSatisfaction - previous.customerSatisfaction).toFixed(1)} ${vsPrevious}`
            : undefined
        }
        deltaTone={
          previous
            ? result.customerSatisfaction >= previous.customerSatisfaction
              ? 'good'
              : 'bad'
            : 'neutral'
        }
      />
    </div>
  );
}
