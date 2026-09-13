import { describe, expect, it } from 'vitest';
import {
  CHALLENGER_SCENARIO_VERSION,
  getGameConfig,
  repeatDecision,
  runFullGame,
  type GameConfig,
  type QuarterDecision,
} from '@/domain/simulation';
import { config, decision } from './helpers';

/**
 * Balance validation before release (spec 17.1).
 *
 * These are guardrails, not exploratory tuning: `npm run balance` is the tool for
 * exploring the strategy space, and each check below freezes one property that
 * must stay true as coefficients are tuned.
 */

const SEEDS = [
  'smartwatch-v1-2026',
  'balance-seed-a',
  'balance-seed-b',
  'balance-seed-c',
  'balance-seed-d',
];

interface Outcome {
  finalScore: number;
  gameRank: number;
  cumulativeProfit: number;
  totalUnits: number;
  finalShare: number;
  avgMargin: number;
  unfulfilled: number;
  innovation: number;
  finalBrand: number;
  finalCsat: number;
}

function play(
  strategy: QuarterDecision,
  seed: string,
  cfg: GameConfig = config,
): Outcome {
  const game = runFullGame(repeatDecision(strategy, cfg), seed, 'Player brand', cfg);
  const score = game.playerScore!;
  const history = game.historiesByCompany.get('player') ?? [];
  return {
    finalScore: score.finalScore,
    gameRank: score.gameRank,
    cumulativeProfit: score.cumulativeProfit,
    totalUnits: history.reduce((s, r) => s + r.unitsSold, 0),
    finalShare: score.finalMarketShare,
    avgMargin: history.reduce((s, r) => s + r.netProfitMargin, 0) / Math.max(1, history.length),
    unfulfilled: history.reduce((s, r) => s + r.intermediates.unfulfilledUnits, 0),
    innovation: score.innovationScore,
    finalBrand: score.finalBrand,
    finalCsat: score.finalCsat,
  };
}

/** Averages one strategy's outcome across every seed, so a lucky seed proves nothing. */
function playAcrossSeeds(strategy: QuarterDecision, cfg: GameConfig = config): Outcome {
  const outcomes = SEEDS.map((seed) => play(strategy, seed, cfg));
  const avg = (pick: (o: Outcome) => number) =>
    outcomes.reduce((s, o) => s + pick(o), 0) / outcomes.length;
  return {
    finalScore: avg((o) => o.finalScore),
    gameRank: avg((o) => o.gameRank),
    cumulativeProfit: avg((o) => o.cumulativeProfit),
    totalUnits: avg((o) => o.totalUnits),
    finalShare: avg((o) => o.finalShare),
    avgMargin: avg((o) => o.avgMargin),
    unfulfilled: avg((o) => o.unfulfilled),
    innovation: avg((o) => o.innovation),
    finalBrand: avg((o) => o.finalBrand),
    finalCsat: avg((o) => o.finalCsat),
  };
}

const STRATEGIES = {
  balanced: decision({
    productPoints: 20,
    technologyPoints: 20,
    marketingPoints: 20,
    distributionPoints: 20,
    cxPoints: 20,
    priceIndex: 100,
  }),
  priceWar: decision({
    productPoints: 20,
    technologyPoints: 15,
    marketingPoints: 20,
    distributionPoints: 25,
    cxPoints: 20,
    priceIndex: 80,
  }),
  premium: decision({
    productPoints: 30,
    technologyPoints: 30,
    marketingPoints: 15,
    distributionPoints: 10,
    cxPoints: 15,
    priceIndex: 115,
  }),
  innovation: decision({
    productPoints: 35,
    technologyPoints: 35,
    marketingPoints: 10,
    distributionPoints: 10,
    cxPoints: 10,
    priceIndex: 110,
  }),
  marketingNoDistribution: decision({
    productPoints: 15,
    technologyPoints: 15,
    marketingPoints: 55,
    distributionPoints: 0,
    cxPoints: 15,
    priceIndex: 95,
  }),
  distributionLed: decision({
    productPoints: 15,
    technologyPoints: 15,
    marketingPoints: 15,
    distributionPoints: 40,
    cxPoints: 15,
    priceIndex: 95,
  }),
} as const;

describe('spec 17.1 — aggressive low pricing lifts demand but damages profitability', () => {
  it('sells more units than the balanced strategy but earns a worse margin', () => {
    const priceWar = playAcrossSeeds(STRATEGIES.priceWar);
    const balanced = playAcrossSeeds(STRATEGIES.balanced);

    expect(priceWar.totalUnits).toBeGreaterThan(balanced.totalUnits);
    expect(priceWar.avgMargin).toBeLessThan(balanced.avgMargin);
    expect(priceWar.cumulativeProfit).toBeLessThan(balanced.cumulativeProfit);
  });
});

describe('spec 17.1 — a premium strategy is viable when product, tech, brand and CX support it', () => {
  it('out-scores an undifferentiated price war', () => {
    expect(playAcrossSeeds(STRATEGIES.premium).finalScore).toBeGreaterThan(
      playAcrossSeeds(STRATEGIES.priceWar).finalScore,
    );
  });

  it('earns more profit than the balanced strategy despite selling fewer units', () => {
    const premium = playAcrossSeeds(STRATEGIES.premium);
    const balanced = playAcrossSeeds(STRATEGIES.balanced);
    expect(premium.totalUnits).toBeLessThan(balanced.totalUnits);
    expect(premium.cumulativeProfit).toBeGreaterThan(balanced.cumulativeProfit);
  });
});

describe('spec 17.1 — high marketing with weak distribution leaves demand unfulfilled', () => {
  it('leaves more potential demand unserved than a distribution-led strategy', () => {
    const noDistribution = playAcrossSeeds(STRATEGIES.marketingNoDistribution);
    const distributionLed = playAcrossSeeds(STRATEGIES.distributionLed);

    expect(noDistribution.unfulfilled).toBeGreaterThan(0);
    expect(noDistribution.unfulfilled).toBeGreaterThan(distributionLed.unfulfilled);
  });
});

describe('spec 17.1 — product and technology investment compounds over time', () => {
  it('builds a higher innovation score than a balanced split', () => {
    expect(playAcrossSeeds(STRATEGIES.innovation).innovation).toBeGreaterThan(
      playAcrossSeeds(STRATEGIES.balanced).innovation,
    );
  });

  it('grows capability every quarter with diminishing returns', () => {
    const game = runFullGame(
      repeatDecision(STRATEGIES.innovation, config),
      SEEDS[0]!,
      'Player brand',
      config,
    );
    const history = game.historiesByCompany.get('player')!;
    const gains: number[] = [];
    for (let i = 1; i < history.length; i += 1) {
      const gain = history[i]!.productQuality - history[i - 1]!.productQuality;
      expect(gain).toBeGreaterThan(0);
      gains.push(gain);
    }
    // Each quarter's gain is smaller than the previous one.
    for (let i = 1; i < gains.length; i += 1) {
      expect(gains[i]!).toBeLessThan(gains[i - 1]!);
    }
  });
});

/**
 * Sweeps the allocation space in coarse steps. A handful of hand-picked
 * strategies is not enough to prove a property about the strategy space: with
 * six samples the units leader and the score leader can coincide by accident.
 */
function sweepAllocations(step: number, prices: number[], cfg: GameConfig = config) {
  const rows: { decision: QuarterDecision; finalScore: number; totalUnits: number }[] = [];
  for (let p = 0; p <= 100; p += step) {
    for (let t = 0; p + t <= 100; t += step) {
      for (let m = 0; p + t + m <= 100; m += step) {
        for (let d = 0; p + t + m + d <= 100; d += step) {
          const cx = 100 - p - t - m - d;
          for (const priceIndex of prices) {
            const strategy: QuarterDecision = {
              productPoints: p,
              technologyPoints: t,
              marketingPoints: m,
              distributionPoints: d,
              cxPoints: cx,
              priceIndex,
            };
            const outcome = play(strategy, SEEDS[0]!, cfg);
            rows.push({
              decision: strategy,
              finalScore: outcome.finalScore,
              totalUnits: outcome.totalUnits,
            });
          }
        }
      }
    }
  }
  return rows;
}

describe('spec 17.1 — the highest unit sales does not automatically win', () => {
  it('the allocation selling the most units is not the one with the best final score', () => {
    const rows = sweepAllocations(20, [80, 90, 100, 110, 120]);
    const mostUnits = [...rows].sort((a, b) => b.totalUnits - a.totalUnits)[0]!;
    const bestScore = [...rows].sort((a, b) => b.finalScore - a.finalScore)[0]!;

    expect(rows.length).toBeGreaterThan(100);
    expect(mostUnits.decision).not.toEqual(bestScore.decision);
    // The units leader must actually sell more, and still score lower.
    expect(mostUnits.totalUnits).toBeGreaterThan(bestScore.totalUnits);
    expect(mostUnits.finalScore).toBeLessThan(bestScore.finalScore);
  });

  it('leaves the pricing decision meaningful: the best allocations do not all share one price', () => {
    const rows = sweepAllocations(20, [80, 90, 100, 110, 120]);
    const top = [...rows].sort((a, b) => b.finalScore - a.finalScore).slice(0, 20);
    const prices = new Set(top.map((r) => r.decision.priceIndex));
    expect(prices.size).toBeGreaterThan(1);
  });
});

describe('spec 17.1 — no single strategy wins under every condition', () => {
  it('ranks strategies differently depending on what is being measured', () => {
    const entries = Object.entries(STRATEGIES).map(([name, strategy]) => ({
      name,
      ...playAcrossSeeds(strategy),
    }));
    const bestBy = (pick: (e: (typeof entries)[number]) => number) =>
      [...entries].sort((a, b) => pick(b) - pick(a))[0]!.name;

    const winners = new Set([
      bestBy((e) => e.finalScore),
      bestBy((e) => e.totalUnits),
      bestBy((e) => e.cumulativeProfit),
      bestBy((e) => e.finalBrand),
      bestBy((e) => e.innovation),
      bestBy((e) => e.finalCsat),
    ]);
    // At least three different strategies must lead on at least one dimension.
    expect(winners.size).toBeGreaterThanOrEqual(3);
  });

  it('produces a wide enough score spread to grade a class', () => {
    const scores = Object.values(STRATEGIES).map((s) => playAcrossSeeds(s).finalScore);
    expect(Math.max(...scores) - Math.min(...scores)).toBeGreaterThan(8);
  });
});

describe('spec 17.1 — results stay explainable and stable across seeds', () => {
  it('keeps the same strategy within a narrow band across five seeds', () => {
    const scores = SEEDS.map((seed) => play(STRATEGIES.balanced, seed).finalScore);
    const spread = Math.max(...scores) - Math.min(...scores);
    // The +/-2% demand jitter must never swamp the effect of a decision.
    expect(spread).toBeLessThan(2);
  });

  it('makes a clearly better strategy beat a clearly worse one on every seed', () => {
    const weak = decision({
      productPoints: 0,
      technologyPoints: 0,
      marketingPoints: 0,
      distributionPoints: 0,
      cxPoints: 100,
      priceIndex: 120,
    });
    for (const seed of SEEDS) {
      expect(play(STRATEGIES.premium, seed).finalScore).toBeGreaterThan(
        play(weak, seed).finalScore,
      );
    }
  });
});

describe('the challenger scenario keeps the six-company game rank responsive to skill', () => {
  const challenger = getGameConfig(CHALLENGER_SCENARIO_VERSION);

  it('uses the same engine version and coefficients, differing only in the player start', () => {
    expect(challenger.engineVersion).toBe(config.engineVersion);
    expect(challenger.profitScoreDivisor).toBe(config.profitScoreDivisor);
    expect(challenger.competitors).toEqual(config.competitors);
    expect(challenger.playerStart).not.toEqual(config.playerStart);
  });

  it('lets a strong strategy break out of last place while a naive one does not', () => {
    const strong = decision({
      productPoints: 30,
      technologyPoints: 20,
      marketingPoints: 40,
      distributionPoints: 10,
      cxPoints: 0,
      priceIndex: 100,
    });
    const strongRank = playAcrossSeeds(strong, challenger).gameRank;
    const naiveRank = playAcrossSeeds(STRATEGIES.balanced, challenger).gameRank;

    expect(strongRank).toBeLessThan(6);
    expect(naiveRank).toBeGreaterThan(strongRank);
  });

  it('still finishes last in the default scenario, which is the documented behaviour', () => {
    expect(playAcrossSeeds(STRATEGIES.balanced, config).gameRank).toBe(6);
  });
});
