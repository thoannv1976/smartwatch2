import { describe, expect, it } from 'vitest';
import {
  PLAYER_COMPANY_KEY,
  createInitialCompanies,
  findGoldenStrategy,
  findHindsight,
  repeatDecision,
  replayDecision,
  runFullGame,
  totalInvestmentPoints,
  validateDecision,
  type OptimizerInput,
} from '@/domain/simulation';
import { TEST_SEED, config, decision } from './helpers';

/**
 * The optimizer is the one place where the app tells a student "this is the
 * right answer", so it has to be right, reproducible and fast enough to sit
 * behind a button.
 */

function quarterOneInput(): OptimizerInput {
  return {
    quarter: 1,
    states: createInitialCompanies('Test brand', config),
    previousQuarters: [],
    seed: TEST_SEED,
  };
}

/** Inputs for every quarter of a game actually played with `played`. */
function fullGameInputs(played = decision()) {
  const game = runFullGame(repeatDecision(played, config), TEST_SEED, 'Test brand', config);
  let states = createInitialCompanies('Test brand', config);
  const inputs: { input: OptimizerInput; played: typeof played }[] = [];

  for (let i = 0; i < game.quarters.length; i += 1) {
    const q = game.quarters[i];
    if (!q) break;
    inputs.push({
      input: {
        quarter: q.simulation.quarter,
        states,
        previousQuarters: game.quarters.slice(0, i).map((x) => x.simulation),
        seed: TEST_SEED,
      },
      played,
    });
    states = q.simulation.nextStates;
  }
  return inputs;
}

describe('findGoldenStrategy', () => {
  it('returns a decision a student could actually submit', () => {
    const golden = findGoldenStrategy(quarterOneInput(), config);

    expect(validateDecision(golden.best.decision, config)).toEqual([]);
    expect(totalInvestmentPoints(golden.best.decision)).toBe(config.strategyPoints);
    expect(golden.best.decision.priceIndex).toBeGreaterThanOrEqual(config.priceIndexMin);
    expect(golden.best.decision.priceIndex).toBeLessThanOrEqual(config.priceIndexMax);
  });

  it('is deterministic', () => {
    expect(findGoldenStrategy(quarterOneInput(), config)).toEqual(
      findGoldenStrategy(quarterOneInput(), config),
    );
  });

  it('beats the balanced baseline it is compared against', () => {
    const golden = findGoldenStrategy(quarterOneInput(), config);
    expect(golden.best.netProfit).toBeGreaterThanOrEqual(golden.baseline.netProfit);
  });

  it('agrees with the engine: replaying its answer reproduces its numbers', () => {
    // If the search ever drifted from `simulateQuarter` the advice would be
    // about a game the student is not playing.
    const input = quarterOneInput();
    const golden = findGoldenStrategy(input, config);
    const replay = replayDecision(input, golden.best.decision, config);

    expect(replay.netProfit).toBe(golden.best.netProfit);
    expect(replay.marketShare).toBe(golden.best.marketShare);
    expect(replay.rank).toBe(golden.best.rank);
  });

  it('never leaks a competitor decision or result', () => {
    const golden = findGoldenStrategy(quarterOneInput(), config);
    const serialised = JSON.stringify(golden);

    // Exact AI point allocations are never shown to a student (spec 7.3).
    for (const competitor of config.competitors) {
      expect(serialised).not.toContain(competitor.key);
      expect(serialised).not.toContain(competitor.displayName);
    }
    expect(serialised).not.toContain('companyResults');
  });

  it('reports what the quarter-optimal answer gives up in capability', () => {
    // The objective is THIS quarter's profit, which under-buys the investments
    // that only pay off later. The result must carry that cost so the screen
    // can say so rather than pretending the answer is free.
    const golden = findGoldenStrategy(quarterOneInput(), config);
    const costs = Object.values(golden.capabilityCost);

    expect(costs).toHaveLength(4);
    expect(costs.every((v) => Number.isFinite(v))).toBe(true);
    // Beating a balanced allocation on one quarter's profit cannot also leave
    // every capability ahead of balanced — the points have to come from
    // somewhere.
    expect(costs.some((v) => v < 0)).toBe(true);
  });

  it('searches the advertised number of combinations', () => {
    const golden = findGoldenStrategy(quarterOneInput(), config);
    // 1,001 coarse allocations x 9 price points, plus the refinement.
    expect(golden.combinationsTried).toBeGreaterThan(9_000);
    expect(golden.combinationsTried).toBeLessThan(30_000);
  });

  it('runs fast enough to sit inside a request', () => {
    const started = performance.now();
    findGoldenStrategy(quarterOneInput(), config);
    const elapsed = performance.now() - started;

    // Measured around 0.3 s here. The ceiling is deliberately loose so this
    // fails on a real regression, not on a slow CI machine.
    expect(elapsed).toBeLessThan(3_000);
  });

  it('gives different answers in different quarters', () => {
    // Q3 is price-sensitive and Q5 multiplies the technology contribution: an
    // optimizer that returned the same answer for both would not be reading
    // the event at all.
    const inputs = fullGameInputs();
    const q3 = inputs[2];
    const q5 = inputs[4];
    expect(q3).toBeDefined();
    expect(q5).toBeDefined();

    const a = findGoldenStrategy(q3!.input, config).best.decision;
    const b = findGoldenStrategy(q5!.input, config).best.decision;
    expect(a).not.toEqual(b);
  });
});

describe('findHindsight', () => {
  it('reports one row per quarter with a non-negative gap', () => {
    const rows = findHindsight(fullGameInputs(), config);

    expect(rows.map((r) => r.quarter)).toEqual([1, 2, 3, 4, 5, 6]);
    for (const row of rows) {
      expect(row.profitGap).toBeGreaterThanOrEqual(0);
      expect(row.best.netProfit).toBeGreaterThanOrEqual(row.played.netProfit);
    }
  });

  it('scores the played decision as the engine actually scored it', () => {
    const played = decision({ marketingPoints: 40, distributionPoints: 10, cxPoints: 10 });
    const game = runFullGame(repeatDecision(played, config), TEST_SEED, 'Test brand', config);
    const rows = findHindsight(fullGameInputs(played), config);

    game.quarters.forEach((q, index) => {
      const engineResult = q.simulation.companyResults.find(
        (r) => r.companyKey === PLAYER_COMPANY_KEY,
      );
      expect(engineResult).toBeDefined();
      expect(rows[index]?.played.netProfit).toBe(engineResult!.netProfit);
    });
  });
});
