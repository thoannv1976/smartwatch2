import { describe, expect, it } from 'vitest';
import {
  ARENA_SCENARIO_VERSION,
  ARENA_SEATS,
  GROUP_SCENARIO_VERSIONS,
  SCENARIO_VERSION,
  SELECTABLE_SCENARIO_VERSIONS,
  computeGameFinalScores,
  createArenaCompanies,
  createInitialCompanies,
  groupResultsByCompany,
  defaultDecisionFor,
  fullArenaSeats,
  getGameConfig,
  playArenaQuarter,
  repeatForAllSeats,
  runArenaGame,
  simulateQuarter,
  totalInvestmentPoints,
  validateDecision,
  type CompanyKey,
  type QuarterDecision,
} from '@/domain/simulation';
import { decision } from './helpers';

/**
 * The group-competition scenario.
 *
 * The first block is the one that matters: if six students playing IDENTICALLY
 * do not finish level, then the match is decided by which seat they were given
 * and the whole mode is worthless as an assessment. Everything else in Part 2
 * is built on that property holding.
 */

const arena = getGameConfig(ARENA_SCENARIO_VERSION);
const solo = getGameConfig(SCENARIO_VERSION);

const SEEDS = ['smartwatch-v1-2026', 'arena-seed-a', 'arena-seed-b', 'arena-seed-c'];

/** Spread between the best and worst final score in a match. */
function scoreSpread(scores: { finalScore: number }[]): number {
  const values = scores.map((s) => s.finalScore);
  return Math.max(...values) - Math.min(...values);
}

describe('seat fairness — the premise the whole mode rests on', () => {
  it('leaves six identical strategies level, on every seed', () => {
    const seats = fullArenaSeats();

    for (const seed of SEEDS) {
      const game = runArenaGame(seats, repeatForAllSeats(seats, decision(), arena), seed, arena);

      expect(game.finalScores).toHaveLength(6);
      // Under 1 point across six seats. The only asymmetry left is the seeded
      // +/-2% demand jitter, which is derived per company key.
      expect({ seed, spread: scoreSpread(game.finalScores) < 1 }).toEqual({
        seed,
        spread: true,
      });
    }
  });

  it('leaves them level whatever the shared strategy is', () => {
    const seats = fullArenaSeats();
    const strategies: QuarterDecision[] = [
      decision(),
      decision({ productPoints: 40, technologyPoints: 40, marketingPoints: 10, distributionPoints: 5, cxPoints: 5, priceIndex: 115 }),
      decision({ productPoints: 5, technologyPoints: 5, marketingPoints: 50, distributionPoints: 30, cxPoints: 10, priceIndex: 85 }),
      decision({ productPoints: 20, technologyPoints: 10, marketingPoints: 20, distributionPoints: 40, cxPoints: 10, priceIndex: 100 }),
    ];

    for (const strategy of strategies) {
      const game = runArenaGame(
        seats,
        repeatForAllSeats(seats, strategy, arena),
        'smartwatch-v1-2026',
        arena,
      );
      expect(scoreSpread(game.finalScores)).toBeLessThan(1);
    }
  });

  it('is NOT true of the solo seating — which is why the arena scenario exists', () => {
    // The control. Six identical strategies played from the SOLO starting rows
    // (`createInitialCompanies`, where `apple` begins 60 brand points ahead of
    // `player`) must finish far apart. If this ever stops being true the two
    // configs have silently converged and the arena scenario is redundant —
    // something a test should say, not something to discover in a classroom.
    //
    // Deliberately not `runArenaGame`: that builds every human-held seat from
    // one shared row, which is the very thing under test here.
    let states = createInitialCompanies('Company 1', solo);
    const shared = decision();
    const results = [];

    for (let quarter = 1; quarter <= solo.quarters; quarter += 1) {
      const decisions: Record<string, QuarterDecision> = {};
      for (const company of states) decisions[company.companyKey] = { ...shared };

      const simulation = simulateQuarter(
        {
          quarter,
          companies: states,
          decisions,
          scenarioVersion: solo.scenarioVersion,
          engineVersion: solo.engineVersion,
          seed: 'smartwatch-v1-2026',
        },
        solo,
      );
      results.push(...simulation.companyResults);
      states = simulation.nextStates;
    }

    const scores = computeGameFinalScores(groupResultsByCompany(results), solo);
    expect(scoreSpread(scores)).toBeGreaterThan(5);
  });

  it('gives every seat the same starting row', () => {
    const companies = createArenaCompanies(fullArenaSeats(), arena);
    const rows = companies.map((c) => ({
      brandAwareness: c.brandAwareness,
      productQuality: c.productQuality,
      technology: c.technology,
      distribution: c.distribution,
      customerExperience: c.customerExperience,
      customerSatisfaction: c.customerSatisfaction,
      cash: c.cash,
    }));

    for (const row of rows) expect(row).toEqual(rows[0]);
  });

  it('still lets skill decide: different strategies do NOT finish level', () => {
    // The flip side of fairness. A scenario where nothing a student does
    // matters would also pass every test above.
    const seats = fullArenaSeats();
    const varied: Partial<Record<CompanyKey, QuarterDecision[]>> = {};
    const strategies = [
      decision({ productPoints: 40, technologyPoints: 40, marketingPoints: 10, distributionPoints: 5, cxPoints: 5, priceIndex: 115 }),
      decision({ productPoints: 5, technologyPoints: 5, marketingPoints: 55, distributionPoints: 25, cxPoints: 10, priceIndex: 85 }),
      decision({ productPoints: 20, technologyPoints: 20, marketingPoints: 20, distributionPoints: 20, cxPoints: 20, priceIndex: 100 }),
      decision({ productPoints: 0, technologyPoints: 0, marketingPoints: 0, distributionPoints: 50, cxPoints: 50, priceIndex: 95 }),
      decision({ productPoints: 100, technologyPoints: 0, marketingPoints: 0, distributionPoints: 0, cxPoints: 0, priceIndex: 105 }),
      decision({ productPoints: 25, technologyPoints: 15, marketingPoints: 25, distributionPoints: 25, cxPoints: 10, priceIndex: 95 }),
    ];
    ARENA_SEATS.forEach((seatKey, index) => {
      varied[seatKey] = Array.from({ length: arena.quarters }, () => ({ ...strategies[index]! }));
    });

    const game = runArenaGame(seats, varied, 'smartwatch-v1-2026', arena);
    expect(scoreSpread(game.finalScores)).toBeGreaterThan(10);
  });
});

describe('empty seats', () => {
  it('always puts six companies in the market, however few students there are', () => {
    for (let humans = 1; humans <= 6; humans += 1) {
      const seats = fullArenaSeats().map((seat, index) =>
        index < humans ? seat : { ...seat, uid: null },
      );
      const game = runArenaGame(
        seats,
        repeatForAllSeats(seats, decision(), arena),
        'smartwatch-v1-2026',
        arena,
      );

      expect({ humans, companies: game.finalScores.length }).toEqual({ humans, companies: 6 });
      expect({ humans, quarters: game.quarters.length }).toEqual({
        humans,
        quarters: arena.quarters,
      });
    }
  });

  it('marks an unclaimed seat as bot-driven and gives it a submittable decision', () => {
    const seats = fullArenaSeats().map((seat, index) =>
      index < 4 ? seat : { ...seat, uid: null },
    );
    const states = createArenaCompanies(seats, arena);

    const played = playArenaQuarter(
      {
        quarter: 1,
        states,
        humanDecisions: {
          player: decision(),
          apple: decision(),
          garmin: decision(),
          samsung: decision(),
        },
        previousQuarters: [],
        seed: 'smartwatch-v1-2026',
      },
      arena,
    );

    expect(played.botSeats).toEqual(['huawei', 'pixel']);
    for (const seatKey of ARENA_SEATS) {
      const used = played.decisions[seatKey];
      expect(used).toBeDefined();
      expect(validateDecision(used!, arena)).toEqual([]);
      expect(totalInvestmentPoints(used!)).toBe(arena.strategyPoints);
    }
  });

  it('never shows a real brand name for a bot seat', () => {
    // A student's rival must not appear to be Apple or Garmin.
    const companies = createArenaCompanies(
      fullArenaSeats().map((seat, index) => (index === 0 ? seat : { ...seat, uid: null })),
      arena,
    );
    const names = companies.map((c) => c.companyName).join(' | ');

    for (const forbidden of ['Apple', 'Garmin', 'Samsung', 'Huawei', 'Pixel', 'Fitbit']) {
      expect(names).not.toContain(forbidden);
    }
  });

  it('keeps the seeded stream stable when a student leaves a seat', () => {
    // Removing a student must not change what the OTHER bots would have done,
    // or an instructor pulling one person out would silently re-roll the match.
    const seats = fullArenaSeats();
    const withFive = seats.map((seat, index) => (index === 5 ? { ...seat, uid: null } : seat));
    const withFour = seats.map((seat, index) => (index >= 4 ? { ...seat, uid: null } : seat));

    const a = playArenaQuarter(
      {
        quarter: 3,
        states: createArenaCompanies(withFive, arena),
        humanDecisions: {},
        previousQuarters: [],
        seed: 'smartwatch-v1-2026',
      },
      arena,
    );
    const b = playArenaQuarter(
      {
        quarter: 3,
        states: createArenaCompanies(withFour, arena),
        humanDecisions: {},
        previousQuarters: [],
        seed: 'smartwatch-v1-2026',
      },
      arena,
    );

    expect(a.decisions.pixel).toEqual(b.decisions.pixel);
  });
});

describe('arena scenario registration', () => {
  it('inherits the engine untouched', () => {
    expect(arena.engineVersion).toBe(solo.engineVersion);
    expect(arena.quarters).toBe(solo.quarters);
    expect(arena.strategyPoints).toBe(solo.strategyPoints);
    expect(arena.scoreWeights).toEqual(solo.scoreWeights);
    expect(arena.defaultDemandWeights).toEqual(solo.defaultDemandWeights);
  });

  it('is offered to group assignments and NOT to solo ones', () => {
    expect(GROUP_SCENARIO_VERSIONS).toContain(ARENA_SCENARIO_VERSION);
    expect(SELECTABLE_SCENARIO_VERSIONS).not.toContain(ARENA_SCENARIO_VERSION);
  });

  it('leaves the solo scenario byte-identical', () => {
    // The arena config is built by spreading the solo one. A stray mutation
    // there would silently change every graded solo result.
    expect(solo.playerStart).toEqual({
      brandAwareness: 30,
      productQuality: 50,
      technology: 50,
      distribution: 40,
      customerExperience: 50,
      customerSatisfaction: 65,
      cash: 5_000_000,
    });
    const apple = solo.competitors.find((c) => c.key === 'apple');
    expect(apple?.start.brandAwareness).toBe(90);
    expect(apple?.displayName).toBe('Apple Watch benchmark');
  });

  it('is deterministic', () => {
    const seats = fullArenaSeats();
    const run = () =>
      runArenaGame(seats, repeatForAllSeats(seats, decision(), arena), 'arena-seed-a', arena)
        .finalScores;
    expect(run()).toEqual(run());
  });
});

describe('defaultDecisionFor', () => {
  it('repeats the student own last decision rather than resetting it', () => {
    const previous = decision({ productPoints: 40, technologyPoints: 30, marketingPoints: 10, distributionPoints: 10, cxPoints: 10, priceIndex: 112 });
    expect(defaultDecisionFor(previous)).toEqual(previous);
  });

  it('falls back to an even split in quarter one, where there is nothing to repeat', () => {
    const fallback = defaultDecisionFor(null);
    expect(totalInvestmentPoints(fallback)).toBe(arena.strategyPoints);
    expect(fallback.priceIndex).toBe(100);
    expect(validateDecision(fallback, arena)).toEqual([]);
  });

  it('does not hand back a reference a caller could mutate', () => {
    const previous = decision();
    const first = defaultDecisionFor(previous);
    first.productPoints = 99;
    expect(previous.productPoints).toBe(20);
  });
});
