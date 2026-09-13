import { describe, expect, it } from 'vitest';
import {
  analyseStrategy,
  averageDecision,
  compareByFinalScore,
  computeFinalScoreBreakdown,
  computeGameFinalScores,
  groupResultsByCompany,
  repeatDecision,
  runFullGame,
  type CompanyQuarterResult,
  type QuarterDecision,
} from '@/domain/simulation';
import { TEST_SEED, config, decision } from './helpers';

/** Spec 8: final scoring, tie-breakers and the rule-based analysis. */

describe('final score breakdown (spec 8.2)', () => {
  it('applies the documented weights', () => {
    const game = runFullGame(repeatDecision(decision(), config), TEST_SEED, 'Test brand', config);
    const player = game.playerScore!;
    const expected =
      0.3 * player.profitScore +
      0.25 * player.marketShareScore +
      0.15 * player.brandScore +
      0.15 * player.csatScore +
      0.15 * player.innovationScore;
    expect(player.finalScore).toBeCloseTo(expected, 3);
  });

  it('clamps every sub-score to 0..100', () => {
    const game = runFullGame(
      repeatDecision(
        decision({
          productPoints: 0,
          technologyPoints: 0,
          marketingPoints: 0,
          distributionPoints: 0,
          cxPoints: 100,
          priceIndex: 120,
        }),
        config,
      ),
      TEST_SEED,
      'Test brand',
      config,
    );
    for (const entry of game.finalScores) {
      for (const score of [
        entry.profitScore,
        entry.marketShareScore,
        entry.brandScore,
        entry.csatScore,
        entry.innovationScore,
        entry.finalScore,
      ]) {
        expect(score).toBeGreaterThanOrEqual(0);
        expect(score).toBeLessThanOrEqual(100);
      }
    }
  });

  it('computes innovation as the mean of final product quality and technology', () => {
    const history: CompanyQuarterResult[] = [
      {
        ...emptyResult(),
        quarter: 1,
        productQuality: 80,
        technology: 60,
      },
    ];
    const breakdown = computeFinalScoreBreakdown(history, config);
    expect(breakdown.innovationScore).toBe(70);
  });

  it('scores market share at three times the percentage, capped at 100', () => {
    const modest = computeFinalScoreBreakdown(
      [{ ...emptyResult(), quarter: 1, marketShare: 0.1 }],
      config,
    );
    const dominant = computeFinalScoreBreakdown(
      [{ ...emptyResult(), quarter: 1, marketShare: 0.5 }],
      config,
    );
    expect(modest.marketShareScore).toBe(30);
    expect(dominant.marketShareScore).toBe(100);
  });

  it('sums revenue and profit across all quarters', () => {
    const history: CompanyQuarterResult[] = [
      { ...emptyResult(), quarter: 1, revenue: 1_000_000, netProfit: -500_000 },
      { ...emptyResult(), quarter: 2, revenue: 2_000_000, netProfit: 1_500_000 },
    ];
    const breakdown = computeFinalScoreBreakdown(history, config);
    expect(breakdown.cumulativeRevenue).toBe(3_000_000);
    expect(breakdown.cumulativeProfit).toBe(1_000_000);
  });
});

describe('ranking and tie-breakers (spec 8.3)', () => {
  it('ranks all six companies with unique ranks', () => {
    const game = runFullGame(repeatDecision(decision(), config), TEST_SEED, 'Test brand', config);
    expect(game.finalScores).toHaveLength(6);
    const ranks = game.finalScores.map((s) => s.gameRank).sort((a, b) => a - b);
    expect(ranks).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('breaks an equal final score by cumulative profit, then share, then brand', () => {
    const base = {
      cumulativeRevenue: 0,
      finalCsat: 0,
      finalProductQuality: 0,
      finalTechnology: 0,
      finalCash: 0,
      finalNetProfitMargin: 0,
      profitScore: 0,
      marketShareScore: 0,
      brandScore: 0,
      csatScore: 0,
      innovationScore: 0,
      finalScore: 70,
    };

    const byProfit = [
      { ...base, companyKey: 'a', cumulativeProfit: 1, finalMarketShare: 0, finalBrand: 0 },
      { ...base, companyKey: 'b', cumulativeProfit: 2, finalMarketShare: 0, finalBrand: 0 },
    ].sort(compareByFinalScore);
    expect(byProfit[0]!.companyKey).toBe('b');

    const byShare = [
      { ...base, companyKey: 'a', cumulativeProfit: 5, finalMarketShare: 0.1, finalBrand: 0 },
      { ...base, companyKey: 'b', cumulativeProfit: 5, finalMarketShare: 0.2, finalBrand: 0 },
    ].sort(compareByFinalScore);
    expect(byShare[0]!.companyKey).toBe('b');

    const byBrand = [
      { ...base, companyKey: 'a', cumulativeProfit: 5, finalMarketShare: 0.1, finalBrand: 40 },
      { ...base, companyKey: 'b', cumulativeProfit: 5, finalMarketShare: 0.1, finalBrand: 80 },
    ].sort(compareByFinalScore);
    expect(byBrand[0]!.companyKey).toBe('b');
  });

  it('groups a flat result list back into per-company histories in quarter order', () => {
    const game = runFullGame(repeatDecision(decision(), config), TEST_SEED, 'Test brand', config);
    const grouped = groupResultsByCompany(game.allResults);
    expect(grouped.size).toBe(6);
    for (const history of grouped.values()) {
      expect(history).toHaveLength(config.quarters);
      expect(history.map((r) => r.quarter)).toEqual([1, 2, 3, 4, 5, 6]);
    }
    expect(computeGameFinalScores(grouped, config)).toHaveLength(6);
  });
});

describe('rule-based strategy analysis (spec 8.4)', () => {
  const marketingHeavy: QuarterDecision = decision({
    productPoints: 10,
    technologyPoints: 10,
    marketingPoints: 60,
    distributionPoints: 10,
    cxPoints: 10,
  });
  const innovationHeavy: QuarterDecision = decision({
    productPoints: 35,
    technologyPoints: 35,
    marketingPoints: 10,
    distributionPoints: 10,
    cxPoints: 10,
    priceIndex: 112,
  });

  it('averages the six decisions', () => {
    const averages = averageDecision([
      decision({ marketingPoints: 40, cxPoints: 0 }),
      decision({ marketingPoints: 20, cxPoints: 20 }),
    ]);
    expect(averages.marketingPoints).toBe(30);
    expect(averages.cxPoints).toBe(10);
    expect(averages.priceIndex).toBe(100);
  });

  it('labels heavy marketing as an acquisition focus', () => {
    const game = runFullGame(repeatDecision(marketingHeavy, config), TEST_SEED, 'T', config);
    const analysis = analyseStrategy(
      repeatDecision(marketingHeavy, config),
      game.historiesByCompany.get('player')!,
      game.playerScore!,
      null,
      config,
    );
    expect(analysis.labels).toContain('ACQUISITION_FOCUS');
  });

  it('labels heavy product+technology as innovation-oriented and premium pricing', () => {
    const game = runFullGame(repeatDecision(innovationHeavy, config), TEST_SEED, 'T', config);
    const analysis = analyseStrategy(
      repeatDecision(innovationHeavy, config),
      game.historiesByCompany.get('player')!,
      game.playerScore!,
      null,
      config,
    );
    expect(analysis.labels).toContain('INNOVATION_FOCUS');
    expect(analysis.labels).toContain('PREMIUM_POSITIONING');
  });

  it('labels a low average price index as aggressive pricing', () => {
    const cheap = decision({ priceIndex: 85 });
    const game = runFullGame(repeatDecision(cheap, config), TEST_SEED, 'T', config);
    const analysis = analyseStrategy(
      repeatDecision(cheap, config),
      game.historiesByCompany.get('player')!,
      game.playerScore!,
      null,
      config,
    );
    expect(analysis.labels).toContain('AGGRESSIVE_PRICING');
  });

  it('always produces exactly three distinct lessons', () => {
    const strategies = [marketingHeavy, innovationHeavy, decision(), decision({ priceIndex: 80 })];
    for (const strategy of strategies) {
      const decisions = repeatDecision(strategy, config);
      const game = runFullGame(decisions, TEST_SEED, 'T', config);
      const analysis = analyseStrategy(
        decisions,
        game.historiesByCompany.get('player')!,
        game.playerScore!,
        'BALANCED',
        config,
      );
      expect(analysis.lessons).toHaveLength(3);
      expect(new Set(analysis.lessons.map((l) => l.key)).size).toBe(3);
    }
  });

  it('flags a positioning claim that the decisions contradict', () => {
    const cheapDecisions = repeatDecision(decision({ priceIndex: 82 }), config);
    const game = runFullGame(cheapDecisions, TEST_SEED, 'T', config);
    const asPremium = analyseStrategy(
      cheapDecisions,
      game.historiesByCompany.get('player')!,
      game.playerScore!,
      'PREMIUM',
      config,
    );
    expect(asPremium.positioningConsistent).toBe(false);

    const asAffordable = analyseStrategy(
      cheapDecisions,
      game.historiesByCompany.get('player')!,
      game.playerScore!,
      'AFFORDABLE',
      config,
    );
    expect(asAffordable.positioningConsistent).toBe(true);
  });
});

/** Minimal result row; individual tests override only the fields they care about. */
function emptyResult(): CompanyQuarterResult {
  return {
    companyId: 'player',
    companyKey: 'player',
    companyName: 'Test brand',
    controllerType: 'PLAYER',
    quarter: 1,
    productQuality: 0,
    technology: 0,
    brandAwareness: 0,
    marketingStrength: 0,
    distribution: 0,
    customerExperience: 0,
    customerSatisfaction: 0,
    demandScore: 0,
    unitsSold: 0,
    actualPrice: 0,
    revenue: 0,
    cogs: 0,
    grossProfit: 0,
    returnCost: 0,
    netProfit: 0,
    cash: 0,
    marketShare: 0,
    netProfitMargin: 0,
    rank: 1,
    intermediates: {
      priceAttractiveness: 0,
      productAttractiveness: 0,
      marketingStrength: 0,
      rawDemandScore: 0,
      adjustedDemandScore: 0,
      randomFactor: 1,
      potentialDemandShare: 0,
      potentialUnits: 0,
      fulfilmentCapacityFactor: 0,
      fulfilledPotentialUnits: 0,
      conversionModifier: 0,
      unitProductCost: 0,
      returnRate: 0,
      unfulfilledUnits: 0,
    },
  };
}
