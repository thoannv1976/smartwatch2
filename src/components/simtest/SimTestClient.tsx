'use client';

import { useMemo, useState } from 'react';
import {
  CHALLENGER_SCENARIO_VERSION,
  OFFICIAL_SEED_EXAMPLE,
  PLAYER_COMPANY_KEY,
  SCENARIO_VERSION,
  createInitialCompanies,
  getGameConfig,
  groupResultsByCompany,
  computeGameFinalScores,
  playQuarter,
  repeatDecision,
  runFullGame,
  type CompanyState,
  type PlayedQuarter,
  type QuarterDecision,
} from '@/domain/simulation';
import { useI18n } from '@/i18n/client';
import { DecisionInputs } from '@/components/game/DecisionInputs';
import {
  Badge,
  Card,
  CardTitle,
  InfoNote,
  PageHeader,
  TableScroll,
  Td,
  Th,
} from '@/components/ui/primitives';
import { seriesColor } from '@/components/charts/series';
import {
  formatDecimal,
  formatInteger,
  formatMoney,
  formatMoneyCompact,
  formatPercent,
  formatScore,
} from '@/lib/format';

/**
 * Internal simulation test mode (spec 14.1).
 *
 * Runs entirely on the pure engine in the browser: no database, no persistence,
 * no authentication side effects. This is the tool for balancing the game — it
 * exposes the five AI decisions, the event modifiers and every intermediate
 * value that the student never sees.
 */

const DEFAULT_DECISION: QuarterDecision = {
  productPoints: 20,
  technologyPoints: 20,
  marketingPoints: 20,
  distributionPoints: 20,
  cxPoints: 20,
  priceIndex: 100,
};

const COMPARISON_STRATEGIES: { name: string; decision: QuarterDecision }[] = [
  { name: 'Balanced 20/20/20/20/20 @100', decision: DEFAULT_DECISION },
  {
    name: 'Innovation 35/35/10/10/10 @110',
    decision: {
      productPoints: 35,
      technologyPoints: 35,
      marketingPoints: 10,
      distributionPoints: 10,
      cxPoints: 10,
      priceIndex: 110,
    },
  },
  {
    name: 'Premium 30/30/15/10/15 @115',
    decision: {
      productPoints: 30,
      technologyPoints: 30,
      marketingPoints: 15,
      distributionPoints: 10,
      cxPoints: 15,
      priceIndex: 115,
    },
  },
  {
    name: 'Price war 20/15/20/25/20 @80',
    decision: {
      productPoints: 20,
      technologyPoints: 15,
      marketingPoints: 20,
      distributionPoints: 25,
      cxPoints: 20,
      priceIndex: 80,
    },
  },
  {
    name: 'Marketing blitz 10/10/60/10/10 @100',
    decision: {
      productPoints: 10,
      technologyPoints: 10,
      marketingPoints: 60,
      distributionPoints: 10,
      cxPoints: 10,
      priceIndex: 100,
    },
  },
  {
    name: 'Marketing, no distribution 15/15/55/0/15 @95',
    decision: {
      productPoints: 15,
      technologyPoints: 15,
      marketingPoints: 55,
      distributionPoints: 0,
      cxPoints: 15,
      priceIndex: 95,
    },
  },
];

export function SimTestClient() {
  const { t, locale } = useI18n();

  const [scenarioVersion, setScenarioVersion] = useState<string>(SCENARIO_VERSION);
  const [seed, setSeed] = useState(OFFICIAL_SEED_EXAMPLE);
  const [decision, setDecision] = useState<QuarterDecision>(DEFAULT_DECISION);
  const [states, setStates] = useState<CompanyState[]>(() =>
    createInitialCompanies('Test brand', getGameConfig(SCENARIO_VERSION)),
  );
  const [played, setPlayed] = useState<PlayedQuarter[]>([]);
  const [comparison, setComparison] = useState<
    { name: string; finalScore: number; gameRank: number; profit: number; share: number; units: number }[]
  >([]);

  const config = useMemo(() => getGameConfig(scenarioVersion), [scenarioVersion]);
  const nextQuarter = played.length + 1;
  const finished = played.length >= config.quarters;
  const totalPoints =
    decision.productPoints +
    decision.technologyPoints +
    decision.marketingPoints +
    decision.distributionPoints +
    decision.cxPoints;
  const canRun = totalPoints === config.strategyPoints && !finished;

  const reset = (nextScenario = scenarioVersion) => {
    const cfg = getGameConfig(nextScenario);
    setStates(createInitialCompanies('Test brand', cfg));
    setPlayed([]);
    setComparison([]);
  };

  const runOne = () => {
    if (!canRun) return;
    const previous = played[played.length - 1]?.decisions ?? null;
    const result = playQuarter(
      nextQuarter,
      states,
      decision,
      played.map((p) => p.simulation),
      seed,
      config,
      previous,
    );
    setPlayed([...played, result]);
    setStates(result.simulation.nextStates);
  };

  const runAll = () => {
    if (totalPoints !== config.strategyPoints) return;
    let currentStates = createInitialCompanies('Test brand', config);
    const quarters: PlayedQuarter[] = [];
    let previousDecisions: Record<string, QuarterDecision> | null = null;

    for (let quarter = 1; quarter <= config.quarters; quarter += 1) {
      const result = playQuarter(
        quarter,
        currentStates,
        decision,
        quarters.map((q) => q.simulation),
        seed,
        config,
        previousDecisions,
      );
      quarters.push(result);
      currentStates = result.simulation.nextStates;
      previousDecisions = result.decisions;
    }
    setPlayed(quarters);
    setStates(currentStates);
  };

  const runComparison = () => {
    const rows = COMPARISON_STRATEGIES.map((strategy) => {
      const game = runFullGame(
        repeatDecision(strategy.decision, config),
        seed,
        'Test brand',
        config,
      );
      const score = game.playerScore;
      const history = game.historiesByCompany.get(PLAYER_COMPANY_KEY) ?? [];
      return {
        name: strategy.name,
        finalScore: score?.finalScore ?? 0,
        gameRank: score?.gameRank ?? 0,
        profit: score?.cumulativeProfit ?? 0,
        share: score?.finalMarketShare ?? 0,
        units: history.reduce((sum, r) => sum + r.unitsSold, 0),
      };
    }).sort((a, b) => b.finalScore - a.finalScore);
    setComparison(rows);
  };

  const last = played[played.length - 1];
  const playerState = states.find((s) => s.companyKey === PLAYER_COMPANY_KEY);

  const finalScores = useMemo(() => {
    if (played.length === 0) return [];
    const all = played.flatMap((p) => p.simulation.companyResults);
    return computeGameFinalScores(groupResultsByCompany(all), config);
  }, [played, config]);

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-8 sm:px-6">
      <PageHeader
        title={t.simTest.title}
        subtitle={t.simTest.subtitle}
        right={<Badge tone="warn">INTERNAL</Badge>}
      />

      {/* Scenario controls */}
      <Card>
        <CardTitle>{t.instructor.scenarioVersion}</CardTitle>
        <div className="flex flex-wrap items-end gap-4">
          <label className="flex flex-col gap-1 text-xs text-ink-300">
            {t.instructor.scenarioVersion}
            <select
              value={scenarioVersion}
              onChange={(e) => {
                setScenarioVersion(e.target.value);
                reset(e.target.value);
              }}
              className="rounded-md border border-ink-600 bg-ink-950 px-3 py-2 text-sm text-ink-100"
            >
              <option value={SCENARIO_VERSION}>{SCENARIO_VERSION}</option>
              <option value={CHALLENGER_SCENARIO_VERSION}>{CHALLENGER_SCENARIO_VERSION}</option>
            </select>
          </label>

          <label className="flex flex-col gap-1 text-xs text-ink-300">
            {t.simTest.seed}
            <input
              value={seed}
              onChange={(e) => setSeed(e.target.value)}
              className="w-64 rounded-md border border-ink-600 bg-ink-950 px-3 py-2 font-mono text-sm text-ink-100"
            />
          </label>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={runOne}
              disabled={!canRun}
              className="rounded-md bg-brand-500 px-4 py-2 text-sm font-semibold text-ink-950 transition hover:bg-brand-400 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {finished ? t.simTest.allQuartersDone : `${t.simTest.runOne} (Q${nextQuarter})`}
            </button>
            <button
              type="button"
              onClick={runAll}
              disabled={totalPoints !== config.strategyPoints}
              className="rounded-md border border-ink-600 bg-ink-800 px-4 py-2 text-sm font-semibold text-ink-100 transition hover:bg-ink-700 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {t.simTest.runAll}
            </button>
            <button
              type="button"
              onClick={() => reset()}
              className="rounded-md border border-ink-600 bg-ink-900 px-4 py-2 text-sm text-ink-200 transition hover:bg-ink-800"
            >
              {t.simTest.reset}
            </button>
          </div>
        </div>
        <p className="mt-3 text-xs text-ink-400">
          engine {config.engineVersion} · {t.dashboard.currentQuarter}:{' '}
          {finished ? t.simTest.allQuartersDone : `Q${nextQuarter}`} · {config.quarters} quarters ·{' '}
          {t.instructor.seedHint}
        </p>
      </Card>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        {/* Player decision */}
        <Card>
          <CardTitle hint={t.simTest.playerDecision}>{t.decision.title}</CardTitle>
          <DecisionInputs
            value={decision}
            onChange={setDecision}
            config={config}
            capabilities={
              playerState
                ? {
                    productQuality: playerState.productQuality,
                    technology: playerState.technology,
                    distribution: playerState.distribution,
                    customerExperience: playerState.customerExperience,
                  }
                : undefined
            }
          />
        </Card>

        <div className="flex flex-col gap-6">
          {/* Event modifiers */}
          {last ? (
            <Card>
              <CardTitle hint={t.simTest.eventModifiers}>
                Q{last.simulation.quarter} · {t.events[last.event.key]}
              </CardTitle>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs sm:grid-cols-3">
                <Fact label={t.dashboard.marketSize} value={formatInteger(last.event.marketUnits, locale)} />
                <Fact
                  label="product ×"
                  value={formatDecimal(last.event.productContributionMultiplier, locale, 2)}
                />
                <Fact
                  label="technology ×"
                  value={formatDecimal(last.event.technologyContributionMultiplier, locale, 2)}
                />
                <Fact
                  label="marketing ×"
                  value={formatDecimal(last.event.marketingStrengthMultiplier, locale, 2)}
                />
              </dl>
              <p className="mt-3 text-xs font-semibold text-ink-300">{t.simTest.weights}</p>
              <dl className="mt-1 grid grid-cols-3 gap-x-4 gap-y-1 text-xs sm:grid-cols-6">
                {Object.entries(last.simulation.weights).map(([key, weight]) => (
                  <Fact key={key} label={key} value={formatPercent(weight, locale, 0)} />
                ))}
              </dl>
            </Card>
          ) : (
            <Card>
              <InfoNote>{t.dashboard.noResultYet}</InfoNote>
            </Card>
          )}

          {/* Intermediates for the player */}
          {last ? <IntermediatesCard played={last} /> : null}
        </div>
      </div>

      {/* AI decisions — visible here and nowhere a student can reach */}
      {played.length > 0 ? (
        <Card>
          <CardTitle hint={t.simTest.aiDecisions}>{t.simTest.aiDecisions}</CardTitle>
          <TableScroll>
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  <Th>{t.common.quarter}</Th>
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
                {played.flatMap((quarter) =>
                  Object.entries(quarter.decisions).map(([companyKey, d]) => (
                    <tr key={`${quarter.simulation.quarter}-${companyKey}`}>
                      <Td numeric>Q{quarter.simulation.quarter}</Td>
                      <Td>
                        <span className="inline-flex items-center gap-2">
                          <span
                            aria-hidden
                            className="inline-block h-2 w-2 rounded-full"
                            style={{ background: seriesColor(companyKey) }}
                          />
                          <span
                            className={
                              companyKey === PLAYER_COMPANY_KEY ? 'font-semibold text-ink-100' : ''
                            }
                          >
                            {companyKey}
                          </span>
                        </span>
                      </Td>
                      <Td numeric align="right">{d.productPoints}</Td>
                      <Td numeric align="right">{d.technologyPoints}</Td>
                      <Td numeric align="right">{d.marketingPoints}</Td>
                      <Td numeric align="right">{d.distributionPoints}</Td>
                      <Td numeric align="right">{d.cxPoints}</Td>
                      <Td numeric align="right">{d.priceIndex}</Td>
                    </tr>
                  )),
                )}
              </tbody>
            </table>
          </TableScroll>
        </Card>
      ) : null}

      {/* Quarter results */}
      {last ? (
        <Card>
          <CardTitle>
            {t.simTest.stateAfter} Q{last.simulation.quarter}
          </CardTitle>
          <TableScroll>
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  <Th align="center">{t.kpi.rank}</Th>
                  <Th>{t.common.company}</Th>
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
                </tr>
              </thead>
              <tbody>
                {[...last.simulation.companyResults]
                  .sort((a, b) => a.rank - b.rank)
                  .map((r) => (
                    <tr
                      key={r.companyKey}
                      className={r.companyKey === PLAYER_COMPANY_KEY ? 'bg-brand-500/5' : ''}
                    >
                      <Td numeric align="center">{r.rank}</Td>
                      <Td>
                        <span className="inline-flex items-center gap-2">
                          <span
                            aria-hidden
                            className="inline-block h-2 w-2 rounded-full"
                            style={{ background: seriesColor(r.companyKey) }}
                          />
                          <span
                            className={
                              r.companyKey === PLAYER_COMPANY_KEY ? 'font-semibold text-ink-100' : ''
                            }
                          >
                            {r.companyName}
                          </span>
                        </span>
                      </Td>
                      <Td numeric align="right">{formatInteger(r.unitsSold, locale)}</Td>
                      <Td numeric align="right">{formatMoneyCompact(r.revenue, locale)}</Td>
                      <Td numeric align="right">{formatMoneyCompact(r.netProfit, locale)}</Td>
                      <Td numeric align="right">{formatPercent(r.marketShare, locale)}</Td>
                      <Td numeric align="right">{formatMoneyCompact(r.cash, locale)}</Td>
                      <Td numeric align="right">{formatScore(r.productQuality, locale)}</Td>
                      <Td numeric align="right">{formatScore(r.technology, locale)}</Td>
                      <Td numeric align="right">{formatScore(r.brandAwareness, locale)}</Td>
                      <Td numeric align="right">{formatScore(r.distribution, locale)}</Td>
                      <Td numeric align="right">{formatScore(r.customerExperience, locale)}</Td>
                      <Td numeric align="right">{formatScore(r.customerSatisfaction, locale)}</Td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </TableScroll>
        </Card>
      ) : null}

      {/* Final scores once six quarters have run */}
      {finished && finalScores.length > 0 ? (
        <Card>
          <CardTitle>{t.report.scores}</CardTitle>
          <TableScroll>
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  <Th align="center">{t.common.rank}</Th>
                  <Th>{t.common.company}</Th>
                  <Th align="right">{t.report.finalScore}</Th>
                  <Th align="right">{t.report.profitScore}</Th>
                  <Th align="right">{t.report.marketShareScore}</Th>
                  <Th align="right">{t.report.brandScore}</Th>
                  <Th align="right">{t.report.csatScore}</Th>
                  <Th align="right">{t.report.innovationScore}</Th>
                  <Th align="right">{t.report.cumulativeProfit}</Th>
                </tr>
              </thead>
              <tbody>
                {finalScores.map((s) => (
                  <tr
                    key={s.companyKey}
                    className={s.companyKey === PLAYER_COMPANY_KEY ? 'bg-brand-500/5' : ''}
                  >
                    <Td numeric align="center">{s.gameRank}</Td>
                    <Td className={s.companyKey === PLAYER_COMPANY_KEY ? 'font-semibold' : ''}>
                      {s.companyName}
                    </Td>
                    <Td numeric align="right" className="font-semibold">
                      {formatDecimal(s.finalScore, locale, 2)}
                    </Td>
                    <Td numeric align="right">{formatDecimal(s.profitScore, locale, 1)}</Td>
                    <Td numeric align="right">{formatDecimal(s.marketShareScore, locale, 1)}</Td>
                    <Td numeric align="right">{formatDecimal(s.brandScore, locale, 1)}</Td>
                    <Td numeric align="right">{formatDecimal(s.csatScore, locale, 1)}</Td>
                    <Td numeric align="right">{formatDecimal(s.innovationScore, locale, 1)}</Td>
                    <Td numeric align="right">{formatMoneyCompact(s.cumulativeProfit, locale)}</Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableScroll>
        </Card>
      ) : null}

      {/* Strategy comparison */}
      <Card>
        <CardTitle
          hint={t.simTest.compareDesc}
          right={
            <button
              type="button"
              onClick={runComparison}
              className="rounded-md border border-ink-600 bg-ink-800 px-3 py-1.5 text-xs font-semibold text-ink-100 transition hover:bg-ink-700"
            >
              {t.simTest.compareRun}
            </button>
          }
        >
          {t.simTest.compareTitle}
        </CardTitle>
        {comparison.length === 0 ? (
          <p className="text-sm text-ink-400">{t.simTest.compareDesc}</p>
        ) : (
          <TableScroll>
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  <Th>{t.simTest.strategy}</Th>
                  <Th align="right">{t.simTest.finalScore}</Th>
                  <Th align="right">{t.report.gameRank}</Th>
                  <Th align="right">{t.simTest.cumulativeProfit}</Th>
                  <Th align="right">{t.simTest.finalShare}</Th>
                  <Th align="right">{t.kpi.unitsSold}</Th>
                </tr>
              </thead>
              <tbody>
                {comparison.map((row) => (
                  <tr key={row.name}>
                    <Td>{row.name}</Td>
                    <Td numeric align="right" className="font-semibold">
                      {formatDecimal(row.finalScore, locale, 2)}
                    </Td>
                    <Td numeric align="right">{row.gameRank}</Td>
                    <Td numeric align="right">{formatMoneyCompact(row.profit, locale)}</Td>
                    <Td numeric align="right">{formatPercent(row.share, locale)}</Td>
                    <Td numeric align="right">{formatInteger(row.units, locale)}</Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableScroll>
        )}
      </Card>
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-ink-400">{label}</dt>
      <dd className="tnum text-ink-100">{value}</dd>
    </div>
  );
}

function IntermediatesCard({ played }: { played: PlayedQuarter }) {
  const { t, locale } = useI18n();
  const player = played.simulation.companyResults.find((r) => r.companyKey === PLAYER_COMPANY_KEY);
  if (!player) return null;
  const i = player.intermediates;

  return (
    <Card>
      <CardTitle hint={t.simTest.intermediates}>{t.simTest.intermediates}</CardTitle>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs sm:grid-cols-3">
        <Fact label="priceAttractiveness" value={formatDecimal(i.priceAttractiveness, locale, 2)} />
        <Fact
          label="productAttractiveness"
          value={formatDecimal(i.productAttractiveness, locale, 2)}
        />
        <Fact label="marketingStrength" value={formatDecimal(i.marketingStrength, locale, 2)} />
        <Fact label="rawDemandScore" value={formatDecimal(i.rawDemandScore, locale, 3)} />
        <Fact label="randomFactor" value={formatDecimal(i.randomFactor, locale, 4)} />
        <Fact label="adjustedDemandScore" value={formatDecimal(i.adjustedDemandScore, locale, 3)} />
        <Fact label="potentialDemandShare" value={formatPercent(i.potentialDemandShare, locale, 2)} />
        <Fact label="potentialUnits" value={formatInteger(i.potentialUnits, locale)} />
        <Fact
          label="fulfilmentCapacityFactor"
          value={formatDecimal(i.fulfilmentCapacityFactor, locale, 4)}
        />
        <Fact
          label="fulfilledPotentialUnits"
          value={formatInteger(i.fulfilledPotentialUnits, locale)}
        />
        <Fact label="conversionModifier" value={formatDecimal(i.conversionModifier, locale, 4)} />
        <Fact label="unitProductCost" value={formatMoney(i.unitProductCost, locale)} />
        <Fact label="returnRate" value={formatPercent(i.returnRate, locale, 2)} />
        <Fact label="unfulfilledUnits" value={formatInteger(i.unfulfilledUnits, locale)} />
        <Fact label="unitsSold" value={formatInteger(player.unitsSold, locale)} />
      </dl>
    </Card>
  );
}
