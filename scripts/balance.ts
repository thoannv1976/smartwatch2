/**
 * Balance validation harness (spec 17.1).
 *
 * Runs a set of fixed strategies across several seeds and prints a comparison
 * table. This is the tool used to answer the release questions:
 *
 *   - is a premium strategy viable when supported by product/tech/brand/CX?
 *   - does aggressive pricing lift demand but hurt profitability?
 *   - does high marketing with weak distribution leave demand unfulfilled?
 *   - do the highest unit sales fail to guarantee the highest Final Score?
 *   - does any single fixed allocation win every seed?
 *
 * Usage: npm run balance [-- seed1 seed2 ...]
 */
import {
  CHALLENGER_SCENARIO_VERSION,
  SCENARIO_VERSION,
  getGameConfig,
  repeatDecision,
  runFullGame,
  type GameConfig,
  type QuarterDecision,
} from '../src/domain/simulation';

interface Strategy {
  name: string;
  decision: QuarterDecision;
}

const STRATEGIES: Strategy[] = [
  {
    name: 'Balanced 20/20/20/20/20 @100',
    decision: {
      productPoints: 20,
      technologyPoints: 20,
      marketingPoints: 20,
      distributionPoints: 20,
      cxPoints: 20,
      priceIndex: 100,
    },
  },
  {
    name: 'Innovation 35P/35T/10M/10D/10C @110',
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
    name: 'Premium 30P/30T/15M/10D/15C @115',
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
    name: 'Price war 20P/15T/20M/25D/20C @80',
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
    name: 'Marketing blitz 10P/10T/60M/10D/10C @100',
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
    name: 'Marketing + no distribution 15P/15T/55M/0D/15C @95',
    decision: {
      productPoints: 15,
      technologyPoints: 15,
      marketingPoints: 55,
      distributionPoints: 0,
      cxPoints: 15,
      priceIndex: 95,
    },
  },
  {
    name: 'Distribution push 15P/15T/15M/40D/15C @95',
    decision: {
      productPoints: 15,
      technologyPoints: 15,
      marketingPoints: 15,
      distributionPoints: 40,
      cxPoints: 15,
      priceIndex: 95,
    },
  },
  {
    name: 'CX specialist 15P/15T/15M/15D/40C @100',
    decision: {
      productPoints: 15,
      technologyPoints: 15,
      marketingPoints: 15,
      distributionPoints: 15,
      cxPoints: 40,
      priceIndex: 100,
    },
  },
  {
    name: 'Growth all-in 25P/20T/30M/20D/5C @90',
    decision: {
      productPoints: 25,
      technologyPoints: 20,
      marketingPoints: 30,
      distributionPoints: 20,
      cxPoints: 5,
      priceIndex: 90,
    },
  },
  {
    name: 'Product only 100P @105',
    decision: {
      productPoints: 100,
      technologyPoints: 0,
      marketingPoints: 0,
      distributionPoints: 0,
      cxPoints: 0,
      priceIndex: 105,
    },
  },
];

const DEFAULT_SEEDS = [
  'smartwatch-v1-2026',
  'balance-seed-a',
  'balance-seed-b',
  'balance-seed-c',
  'balance-seed-d',
];

interface Row {
  strategy: string;
  seed: string;
  finalScore: number;
  gameRank: number;
  cumulativeProfit: number;
  cumulativeRevenue: number;
  totalUnits: number;
  finalShare: number;
  finalCash: number;
  finalBrand: number;
  finalCsat: number;
  innovation: number;
  unfulfilled: number;
  avgMargin: number;
}

function runRow(strategy: Strategy, seed: string, config: GameConfig): Row {
  const game = runFullGame(repeatDecision(strategy.decision, config), seed, 'Player brand', config);
  const score = game.playerScore;
  if (!score) throw new Error('player score missing');

  const playerResults = game.historiesByCompany.get('player') ?? [];
  const totalUnits = playerResults.reduce((s, r) => s + r.unitsSold, 0);
  const unfulfilled = playerResults.reduce((s, r) => s + r.intermediates.unfulfilledUnits, 0);
  const avgMargin =
    playerResults.length > 0
      ? playerResults.reduce((s, r) => s + r.netProfitMargin, 0) / playerResults.length
      : 0;

  return {
    strategy: strategy.name,
    seed,
    finalScore: score.finalScore,
    gameRank: score.gameRank,
    cumulativeProfit: score.cumulativeProfit,
    cumulativeRevenue: score.cumulativeRevenue,
    totalUnits,
    finalShare: score.finalMarketShare,
    finalCash: score.finalCash,
    finalBrand: score.finalBrand,
    finalCsat: score.finalCsat,
    innovation: score.innovationScore,
    unfulfilled,
    avgMargin,
  };
}

function money(value: number): string {
  return `${(value / 1_000_000).toFixed(1)}M`;
}

function pct(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function pad(value: string, width: number): string {
  return value.length >= width ? value.slice(0, width) : value.padEnd(width);
}

function padStart(value: string, width: number): string {
  return value.padStart(width);
}

/** Coarse sweep of the allocation space, used by the checks that are properties
 * of the strategy space rather than of a hand-picked sample. */
function sweepAllocations(config: GameConfig, seed: string, step: number) {
  const rows: { decision: QuarterDecision; finalScore: number; totalUnits: number }[] = [];
  for (let p = 0; p <= 100; p += step)
    for (let t = 0; p + t <= 100; t += step)
      for (let m = 0; p + t + m <= 100; m += step)
        for (let d = 0; p + t + m + d <= 100; d += step) {
          const cx = 100 - p - t - m - d;
          for (const priceIndex of [80, 90, 100, 110, 120]) {
            const decision: QuarterDecision = {
              productPoints: p,
              technologyPoints: t,
              marketingPoints: m,
              distributionPoints: d,
              cxPoints: cx,
              priceIndex,
            };
            const game = runFullGame(repeatDecision(decision, config), seed, 'Player brand', config);
            const history = game.historiesByCompany.get('player') ?? [];
            rows.push({
              decision,
              finalScore: game.playerScore?.finalScore ?? 0,
              totalUnits: history.reduce((s, r) => s + r.unitsSold, 0),
            });
          }
        }
  return rows;
}

function describeDecision(d: QuarterDecision): string {
  return `P${d.productPoints}/T${d.technologyPoints}/M${d.marketingPoints}/D${d.distributionPoints}/C${d.cxPoints} @${d.priceIndex}`;
}

function reportScenario(scenarioVersion: string, seeds: string[]): void {
  const config = getGameConfig(scenarioVersion);
  const rows: Row[] = [];
  for (const strategy of STRATEGIES) {
    for (const seed of seeds) {
      rows.push(runRow(strategy, seed, config));
    }
  }

  console.log(
    `\n${'='.repeat(126)}\nSCENARIO ${scenarioVersion} (engine ${config.engineVersion}) — ${seeds.length} seed(s), ${STRATEGIES.length} strategies`,
  );
  console.log(
    `player start: brand ${config.playerStart.brandAwareness}, product ${config.playerStart.productQuality}, tech ${config.playerStart.technology}, distribution ${config.playerStart.distribution}, CX ${config.playerStart.customerExperience}\n`,
  );
  console.log(
    pad('Strategy', 40) +
      padStart('Score', 7) +
      padStart('Rank', 6) +
      padStart('Profit', 9) +
      padStart('Revenue', 9) +
      padStart('Units', 9) +
      padStart('Share', 8) +
      padStart('Margin', 8) +
      padStart('Brand', 7) +
      padStart('CSAT', 7) +
      padStart('Innov', 7) +
      padStart('Unfulf', 9),
  );
  console.log('-'.repeat(126));

  const summaries = STRATEGIES.map((strategy) => {
    const subset = rows.filter((r) => r.strategy === strategy.name);
    const avg = (pick: (r: Row) => number) =>
      subset.reduce((s, r) => s + pick(r), 0) / subset.length;
    return {
      name: strategy.name,
      score: avg((r) => r.finalScore),
      rank: avg((r) => r.gameRank),
      bestRank: Math.min(...subset.map((r) => r.gameRank)),
      profit: avg((r) => r.cumulativeProfit),
      revenue: avg((r) => r.cumulativeRevenue),
      units: avg((r) => r.totalUnits),
      share: avg((r) => r.finalShare),
      margin: avg((r) => r.avgMargin),
      brand: avg((r) => r.finalBrand),
      csat: avg((r) => r.finalCsat),
      innovation: avg((r) => r.innovation),
      unfulfilled: avg((r) => r.unfulfilled),
    };
  });

  for (const s of [...summaries].sort((a, b) => b.score - a.score)) {
    console.log(
      pad(s.name, 40) +
        padStart(s.score.toFixed(2), 7) +
        padStart(s.rank.toFixed(1), 6) +
        padStart(money(s.profit), 9) +
        padStart(money(s.revenue), 9) +
        padStart(Math.round(s.units).toLocaleString('en-US'), 9) +
        padStart(pct(s.share), 8) +
        padStart(pct(s.margin), 8) +
        padStart(s.brand.toFixed(1), 7) +
        padStart(s.csat.toFixed(1), 7) +
        padStart(s.innovation.toFixed(1), 7) +
        padStart(Math.round(s.unfulfilled).toLocaleString('en-US'), 9),
    );
  }

  console.log('\nSPEC 17.1 BALANCE CHECKS');
  console.log('-'.repeat(126));

  const byName = new Map(summaries.map((s) => [s.name, s]));
  const priceWar = byName.get('Price war 20P/15T/20M/25D/20C @80');
  const premium = byName.get('Premium 30P/30T/15M/10D/15C @115');
  const blitzNoDist = byName.get('Marketing + no distribution 15P/15T/55M/0D/15C @95');
  const distPush = byName.get('Distribution push 15P/15T/15M/40D/15C @95');
  const innovation = byName.get('Innovation 35P/35T/10M/10D/10C @110');
  const balanced = byName.get('Balanced 20/20/20/20/20 @100');

  const check = (label: string, pass: boolean, detail: string) => {
    console.log(`${pass ? 'PASS' : 'FAIL'}  ${pad(label, 58)} ${detail}`);
  };

  if (priceWar && balanced) {
    check(
      'Low price lifts units but hurts profitability',
      priceWar.units > balanced.units && priceWar.margin < balanced.margin,
      `units ${Math.round(priceWar.units).toLocaleString('en-US')} vs ${Math.round(balanced.units).toLocaleString('en-US')}, margin ${pct(priceWar.margin)} vs ${pct(balanced.margin)}`,
    );
  }
  if (premium && priceWar && balanced) {
    check(
      'Premium beats an undifferentiated price war',
      premium.score > priceWar.score && premium.profit > balanced.profit,
      `premium ${premium.score.toFixed(2)} vs price war ${priceWar.score.toFixed(2)}; profit ${money(premium.profit)} vs balanced ${money(balanced.profit)}`,
    );
  }
  if (blitzNoDist && distPush) {
    check(
      'Marketing without distribution leaves demand unfulfilled',
      blitzNoDist.unfulfilled > distPush.unfulfilled,
      `${Math.round(blitzNoDist.unfulfilled).toLocaleString('en-US')} vs ${Math.round(distPush.unfulfilled).toLocaleString('en-US')} units unfulfilled`,
    );
  }
  if (innovation && balanced) {
    check(
      'Product/technology investment compounds',
      innovation.innovation > balanced.innovation,
      `innovation ${innovation.innovation.toFixed(1)} vs ${balanced.innovation.toFixed(1)}`,
    );
  }

  // Properties of the strategy space, not of the sample above.
  const swept = sweepAllocations(config, seeds[0] ?? DEFAULT_SEEDS[0]!, 20);
  const mostUnits = [...swept].sort((a, b) => b.totalUnits - a.totalUnits)[0]!;
  const bestScore = [...swept].sort((a, b) => b.finalScore - a.finalScore)[0]!;
  check(
    'Highest unit sales is not automatically the best score',
    describeDecision(mostUnits.decision) !== describeDecision(bestScore.decision),
    `most units ${describeDecision(mostUnits.decision)} (score ${mostUnits.finalScore.toFixed(1)}) / best score ${describeDecision(bestScore.decision)} (score ${bestScore.finalScore.toFixed(1)})`,
  );

  const topPrices = new Set(
    [...swept].sort((a, b) => b.finalScore - a.finalScore).slice(0, 20).map((r) => r.decision.priceIndex),
  );
  check(
    'Pricing stays a real decision (top 20 do not share one price)',
    topPrices.size > 1,
    `price indexes in the top 20: ${[...topPrices].sort((a, b) => a - b).join(', ')}`,
  );

  const spread = Math.max(...summaries.map((s) => s.score)) - Math.min(...summaries.map((s) => s.score));
  check(
    'Score spread is wide enough to grade a class',
    spread > 8,
    `${spread.toFixed(1)} points between the best and worst sampled strategy`,
  );

  const bestAchievableRank = Math.min(...summaries.map((s) => s.bestRank));
  const expectedFlat = scenarioVersion === SCENARIO_VERSION;
  check(
    expectedFlat
      ? 'Game rank vs benchmarks is flat (documented for this scenario)'
      : 'Game rank vs benchmarks responds to skill',
    expectedFlat ? bestAchievableRank === 6 : bestAchievableRank < 6,
    `best rank reached by a sampled strategy: ${bestAchievableRank}`,
  );

  console.log('');
}

function main(): void {
  const seeds = process.argv.slice(2).length > 0 ? process.argv.slice(2) : DEFAULT_SEEDS;
  reportScenario(SCENARIO_VERSION, seeds);
  reportScenario(CHALLENGER_SCENARIO_VERSION, seeds);
}

main();
