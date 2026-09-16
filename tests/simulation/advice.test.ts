import { describe, expect, it } from 'vitest';
import {
  INVESTMENT_FIELDS,
  PLAYER_COMPANY_KEY,
  classPercentile,
  createInitialCompanies,
  demandAlignment,
  getMarketEvent,
  repeatDecision,
  reviewQuarter,
  riskWarnings,
  runFullGame,
  suggestStrategies,
  tenureReview,
  totalInvestmentPoints,
  validateDecision,
  type CompanyQuarterResult,
  type QuarterDecision,
  type QuarterFacts,
} from '@/domain/simulation';
import { TEST_SEED, config, decision } from './helpers';

/**
 * The coach is what a student reads instead of the formulas, so every rule here
 * is tested against a REAL simulated game rather than a hand-made fixture: if
 * the engine and the advice ever disagree, the advice is wrong.
 */

function playerState(companyName = 'Test brand') {
  const player = createInitialCompanies(companyName, config).find(
    (c) => c.companyKey === PLAYER_COMPANY_KEY,
  );
  if (!player) throw new Error('player company missing');
  return player;
}

/** Plays a whole game with one repeated decision and returns the player's facts. */
function playWith(d: QuarterDecision): QuarterFacts[] {
  const game = runFullGame(repeatDecision(d, config), TEST_SEED, 'Test brand', config);
  return game.quarters.map((q) => {
    const result = q.simulation.companyResults.find((r) => r.companyKey === PLAYER_COMPANY_KEY);
    if (!result) throw new Error('player result missing');
    return {
      quarter: q.simulation.quarter,
      weights: q.simulation.weights,
      decision: d,
      result,
    };
  });
}

function playerResults(facts: QuarterFacts[]): CompanyQuarterResult[] {
  return facts.map((f) => f.result);
}

describe('suggestStrategies', () => {
  it('always returns exactly three distinct, submittable suggestions', () => {
    for (let quarter = 1; quarter <= config.quarters; quarter += 1) {
      const suggestions = suggestStrategies(
        getMarketEvent(quarter, config),
        playerState(),
        [],
        null,
        config,
      );
      expect(suggestions).toHaveLength(3);
      expect(new Set(suggestions.map((s) => s.key)).size).toBe(3);

      for (const suggestion of suggestions) {
        // A suggestion that cannot be submitted is worse than no suggestion.
        expect(validateDecision(suggestion.decision, config)).toEqual([]);
        expect(totalInvestmentPoints(suggestion.decision)).toBe(config.strategyPoints);
      }
    }
  });

  it('is deterministic', () => {
    const run = () =>
      suggestStrategies(getMarketEvent(3, config), playerState(), [], null, config);
    expect(run()).toEqual(run());
  });

  it('leads with fulfilment when last quarter lost demand at the warehouse door', () => {
    // Heavy marketing, starved distribution: the classic unfulfilled-demand trap.
    const facts = playWith(
      decision({ marketingPoints: 55, distributionPoints: 5, productPoints: 20, technologyPoints: 10, cxPoints: 10 }),
    );
    const first = facts[0];
    expect(first).toBeDefined();
    expect(first!.result.intermediates.unfulfilledUnits).toBeGreaterThan(0);

    const suggestions = suggestStrategies(
      getMarketEvent(2, config),
      playerState(),
      playerResults(facts).slice(0, 1),
      first!.decision,
      config,
    );
    expect(suggestions[0]?.key).toBe('fulfilFirst');
    // And it must actually buy more distribution than the balanced default.
    expect(suggestions[0]?.decision.distributionPoints).toBeGreaterThan(20);
  });

  it('offers a value play only when the quarter is genuinely price sensitive', () => {
    const keysFor = (quarter: number) =>
      suggestStrategies(getMarketEvent(quarter, config), playerState(), [], null, config).map(
        (s) => s.key,
      );

    // Q3 Price Competition and Q4 Economic Slowdown use the price-sensitive weights.
    expect(keysFor(3)).toContain('valuePlay');
    expect(keysFor(4)).toContain('valuePlay');
    // Q1 Normal Market does not.
    expect(keysFor(1)).not.toContain('valuePlay');
  });

  it('points the event suggestion at what the event actually amplifies', () => {
    // Q6 Online Shopping Peak raises the distribution weight and marketing x1.15.
    const q1 = suggestStrategies(getMarketEvent(1, config), playerState(), [], null, config).find(
      (s) => s.key === 'eventRide',
    );
    const q6 = suggestStrategies(getMarketEvent(6, config), playerState(), [], null, config).find(
      (s) => s.key === 'eventRide',
    );
    expect(q1).toBeDefined();
    expect(q6).toBeDefined();
    expect(q6!.decision.distributionPoints).toBeGreaterThan(q1!.decision.distributionPoints);
  });
});

describe('riskWarnings', () => {
  const state = playerState();

  it('says nothing about a balanced opening decision', () => {
    expect(riskWarnings(decision(), state, [], config)).toEqual([]);
  });

  it('flags marketing far ahead of distribution', () => {
    const warnings = riskWarnings(
      decision({ marketingPoints: 50, distributionPoints: 10, cxPoints: 10, productPoints: 20, technologyPoints: 10 }),
      state,
      [],
      config,
    );
    expect(warnings.map((w) => w.key)).toContain('marketingAheadOfDistribution');
  });

  it('flags a premium price the brand has not earned', () => {
    const warnings = riskWarnings(
      decision({ priceIndex: 118 }),
      { ...state, brandAwareness: 40 },
      [],
      config,
    );
    expect(warnings.map((w) => w.key)).toContain('premiumWithoutBrand');
  });

  it('flags a field starved for a third quarter in a row, not a second', () => {
    const starved = decision({
      productPoints: 40,
      technologyPoints: 30,
      marketingPoints: 25,
      distributionPoints: 5,
      cxPoints: 0,
    });

    const twoInARow = riskWarnings(starved, state, [starved], config);
    expect(twoInARow.map((w) => w.key)).not.toContain('starvedField');

    const threeInARow = riskWarnings(starved, state, [starved, starved], config);
    expect(threeInARow.map((w) => w.key)).toContain('starvedField');
  });

  it('never blocks: warnings are advice on a decision that is still valid', () => {
    const risky = decision({
      productPoints: 0,
      technologyPoints: 0,
      marketingPoints: 60,
      distributionPoints: 20,
      cxPoints: 20,
      priceIndex: 120,
    });
    expect(riskWarnings(risky, state, [], config).length).toBeGreaterThan(0);
    expect(validateDecision(risky, config)).toEqual([]);
  });
});

describe('demandAlignment', () => {
  it('scores 1 when the allocation mirrors the demand weights', () => {
    // Default weights over the four investable channels: product .30, marketing
    // .15, distribution .10, cx .05 — total .60.
    const mirrored: QuarterDecision = {
      productPoints: 25,
      technologyPoints: 25,
      marketingPoints: 25,
      distributionPoints: 100 / 6,
      cxPoints: 100 / 12,
      priceIndex: 100,
    };
    expect(demandAlignment(mirrored, config.defaultDemandWeights)).toBeCloseTo(1, 2);
  });

  it('scores low when the points go where the market is not looking', () => {
    const contrarian = decision({
      productPoints: 0,
      technologyPoints: 0,
      marketingPoints: 0,
      distributionPoints: 50,
      cxPoints: 50,
    });
    expect(demandAlignment(contrarian, config.defaultDemandWeights)).toBeLessThan(0.4);
  });

  it('returns 0 rather than NaN when nothing was invested', () => {
    const empty = { ...decision(), ...Object.fromEntries(INVESTMENT_FIELDS.map((f) => [f, 0])) };
    expect(demandAlignment(empty as QuarterDecision, config.defaultDemandWeights)).toBe(0);
  });
});

describe('reviewQuarter', () => {
  it('always produces at least one note and never more than five', () => {
    const facts = playWith(decision());
    facts.forEach((f, index) => {
      const notes = reviewQuarter(f, index > 0 ? (facts[index - 1]?.result ?? null) : null);
      expect(notes.length).toBeGreaterThan(0);
      expect(notes.length).toBeLessThanOrEqual(5);
    });
  });

  it('reports lost demand when distribution could not serve it', () => {
    const facts = playWith(
      decision({ marketingPoints: 55, distributionPoints: 5, productPoints: 20, technologyPoints: 10, cxPoints: 10 }),
    );
    const first = facts[0];
    expect(first).toBeDefined();
    const keys = reviewQuarter(first!, null).map((n) => n.key);
    expect(keys).toContain('unfulfilledDemand');
  });

  it('stays quiet about fulfilment once distribution has caught up', () => {
    // The fulfilment factor never reaches 1.00 below Distribution 100, so some
    // demand is ALWAYS lost. The note must therefore fire on a material share,
    // not on "greater than zero" — otherwise it fires in every quarter of every
    // game and teaches nothing.
    const facts = playWith(
      decision({ distributionPoints: 60, marketingPoints: 5, productPoints: 15, technologyPoints: 10, cxPoints: 10 }),
    );
    const late = facts[facts.length - 1];
    expect(late).toBeDefined();
    expect(late!.result.intermediates.unfulfilledUnits).toBeGreaterThan(0);
    expect(late!.result.distribution).toBeGreaterThan(60);
    expect(reviewQuarter(late!, facts[facts.length - 2]?.result ?? null).map((n) => n.key)).not.toContain(
      'unfulfilledDemand',
    );
  });

  it('puts the worst news first', () => {
    const facts = playWith(
      decision({ marketingPoints: 55, distributionPoints: 5, productPoints: 20, technologyPoints: 10, cxPoints: 10 }),
    );
    const notes = reviewQuarter(facts[1]!, facts[0]!.result);
    const tones = notes.map((n) => n.tone);
    const rank = { bad: 0, warn: 1, good: 2 } as const;
    for (let i = 1; i < tones.length; i += 1) {
      expect(rank[tones[i]!]).toBeGreaterThanOrEqual(rank[tones[i - 1]!]);
    }
  });

  it('is deterministic', () => {
    const facts = playWith(decision());
    expect(reviewQuarter(facts[2]!, facts[1]!.result)).toEqual(
      reviewQuarter(facts[2]!, facts[1]!.result),
    );
  });
});

describe('tenureReview', () => {
  it('calls a repeated decision STEADY and a thrashing one ERRATIC', () => {
    const steady = tenureReview(playWith(decision()), 60);
    expect(steady.consistency).toBe('STEADY');
    expect(steady.consistencySwing).toBe(0);

    // Build facts with deliberately swinging decisions.
    const swings: QuarterDecision[] = [
      decision({ productPoints: 60, technologyPoints: 10, marketingPoints: 10, distributionPoints: 10, cxPoints: 10 }),
      decision({ productPoints: 10, technologyPoints: 10, marketingPoints: 60, distributionPoints: 10, cxPoints: 10 }),
      decision({ productPoints: 10, technologyPoints: 60, marketingPoints: 10, distributionPoints: 10, cxPoints: 10 }),
      decision({ productPoints: 10, technologyPoints: 10, marketingPoints: 10, distributionPoints: 60, cxPoints: 10 }),
      decision({ productPoints: 10, technologyPoints: 10, marketingPoints: 10, distributionPoints: 10, cxPoints: 60 }),
      decision({ productPoints: 60, technologyPoints: 10, marketingPoints: 10, distributionPoints: 10, cxPoints: 10 }),
    ];
    const game = runFullGame(swings, TEST_SEED, 'Swinger', config);
    const facts: QuarterFacts[] = game.quarters.map((q, i) => {
      const result = q.simulation.companyResults.find((r) => r.companyKey === PLAYER_COMPANY_KEY);
      if (!result) throw new Error('player result missing');
      return {
        quarter: q.simulation.quarter,
        weights: q.simulation.weights,
        decision: swings[i]!,
        result,
      };
    });
    expect(tenureReview(facts, 50).consistency).toBe('ERRATIC');
  });

  it('maps the final score onto the headline verdict', () => {
    const facts = playWith(decision());
    expect(tenureReview(facts, 80).verdict).toBe('strongTenure');
    expect(tenureReview(facts, 65).verdict).toBe('solidTenure');
    expect(tenureReview(facts, 50).verdict).toBe('mixedTenure');
    expect(tenureReview(facts, 20).verdict).toBe('difficultTenure');
  });

  it('gives one note per quarter and names the best and worst quarter', () => {
    const facts = playWith(decision());
    const review = tenureReview(facts, 60);

    expect(review.quarterNotes.map((n) => n.quarter)).toEqual([1, 2, 3, 4, 5, 6]);

    const profits = new Map(facts.map((f) => [f.quarter, f.result.netProfit]));
    const best = Math.max(...profits.values());
    const worst = Math.min(...profits.values());
    expect(profits.get(review.bestQuarter)).toBe(best);
    expect(profits.get(review.worstQuarter)).toBe(worst);
  });

  it('rates an allocation that ignores every event as IGNORED', () => {
    // All points into CX, which no quarter's demand weights reward heavily.
    const facts = playWith(
      decision({ productPoints: 0, technologyPoints: 0, marketingPoints: 0, distributionPoints: 0, cxPoints: 100 }),
    );
    expect(tenureReview(facts, 30).adaptation).toBe('IGNORED');
  });
});

describe('classPercentile', () => {
  it('stays silent in a class too small to anonymise', () => {
    expect(classPercentile(1, 3)).toBeNull();
    expect(classPercentile(1, 1)).toBeNull();
  });

  it('puts first place at 100 and last place at 0', () => {
    expect(classPercentile(1, 20)).toEqual({ percentile: 100, band: 'top10' });
    expect(classPercentile(20, 20)).toEqual({ percentile: 0, band: 'bottom25' });
  });

  it('bands the middle of the class sensibly', () => {
    expect(classPercentile(5, 21)?.band).toBe('top25');
    expect(classPercentile(10, 21)?.band).toBe('upperHalf');
    expect(classPercentile(14, 21)?.band).toBe('lowerHalf');
  });

  it('rejects a rank outside the class', () => {
    expect(classPercentile(0, 10)).toBeNull();
    expect(classPercentile(11, 10)).toBeNull();
  });
});
