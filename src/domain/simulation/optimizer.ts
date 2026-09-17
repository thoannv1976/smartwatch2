import { getGameConfig, type GameConfig } from './config';
import { generateAllCompetitorDecisions } from './competitors';
import { simulateQuarter } from './engine';
import { getMarketEvent } from './events';
import { buildCompetitorContexts } from './game';
import { round } from './formulas';
import { INVESTMENT_FIELDS, PLAYER_COMPANY_KEY } from './types';
import type {
  CompanyState,
  InvestmentField,
  QuarterDecision,
  QuarterSimulationResult,
} from './types';

/**
 * The "Golden Strategy" search: the decision that produces the best result for
 * ONE quarter, found by brute force against the real engine.
 *
 * Two properties make this defensible in a classroom:
 *
 *   1. It calls the SAME `simulateQuarter` the graded game calls. It does not
 *      approximate the model. If the engine changes, the advice changes with it.
 *   2. It is deterministic. The AI competitors' decisions and the seeded demand
 *      jitter depend only on (seed, quarter, companyKey) — never on the player's
 *      decision — so every candidate is judged under identical conditions and
 *      the same question always gets the same answer.
 *
 * WHAT IT OPTIMISES, AND WHAT THAT COSTS
 *
 * The objective is this quarter's net profit (market share breaks ties). That
 * is a deliberate product decision, and it is NOT the same as maximising the
 * final score: product and technology investment mostly pays off in LATER
 * quarters, so a quarter-optimal answer tends to under-buy them. The result
 * therefore always carries `capabilityCost` — the capability the recommendation
 * gives up against a balanced allocation — so the screen can name the trade-off
 * instead of hiding it.
 */

/**
 * How many DISTINCT quarters of one session the Golden Strategy may be used in.
 *
 * A product rule, not an engine coefficient: changing it changes how much
 * coaching a student gets, not what any decision is worth, so it does not
 * require a new `engineVersion`.
 */
export const GOLDEN_STRATEGY_MAX_QUARTERS = 2;

/** Grid of the coarse pass, in strategy points. */
const COARSE_STEP = 10;
/** Grid and half-width of the refinement pass. */
const REFINE_STEP = 5;
const REFINE_RADIUS = 10;
/** Price-index grid of the coarse pass. */
const COARSE_PRICE_STEP = 5;
/** Half-width of the price refinement, which runs at 1-point resolution. */
const REFINE_PRICE_RADIUS = 4;

export interface StrategyOutcome {
  decision: QuarterDecision;
  netProfit: number;
  revenue: number;
  marketShare: number;
  unitsSold: number;
  rank: number;
}

export interface CapabilityCost {
  productQuality: number;
  technology: number;
  distribution: number;
  customerExperience: number;
}

export interface GoldenStrategy {
  quarter: number;
  /** Best decision found for THIS quarter's net profit. */
  best: StrategyOutcome;
  /** The same quarter played with an even 20/20/20/20/20 at price index 100. */
  baseline: StrategyOutcome;
  /**
   * Capability the recommendation ends the quarter with, minus what the
   * balanced baseline would have. Negative numbers are what it gave up.
   */
  capabilityCost: CapabilityCost;
  /** Demand weights in force this quarter, so the screen can explain the shape. */
  weights: QuarterSimulationResult['weights'];
  combinationsTried: number;
}

/**
 * Everything the search needs about the session. Deliberately NOT the session
 * document: this module stays pure and knows nothing about the database.
 */
export interface OptimizerInput {
  quarter: number;
  /** Company states at the START of the quarter, all six companies. */
  states: CompanyState[];
  /** Every quarter already simulated, oldest first. */
  previousQuarters: QuarterSimulationResult[];
  seed: string;
}

type Allocation = Record<InvestmentField, number>;

/**
 * Every allocation of `total` points across the five areas on a `step` grid.
 *
 * Written as four nested loops with the fifth area taking the remainder, which
 * is both the fastest way to enumerate and the only way to guarantee every
 * candidate sums to exactly `total` — an allocation that does not is one a
 * student could not submit.
 */
function* coarseAllocations(total: number, step: number): Generator<Allocation> {
  const units = Math.floor(total / step);
  for (let a = 0; a <= units; a += 1) {
    for (let b = 0; a + b <= units; b += 1) {
      for (let c = 0; a + b + c <= units; c += 1) {
        for (let d = 0; a + b + c + d <= units; d += 1) {
          const e = units - a - b - c - d;
          yield {
            productPoints: a * step,
            technologyPoints: b * step,
            marketingPoints: c * step,
            distributionPoints: d * step,
            cxPoints: e * step,
          };
        }
      }
    }
  }
}

/** Allocations within `radius` of `base` on a `step` grid, still summing to `total`. */
function* windowedAllocations(
  base: Allocation,
  total: number,
  step: number,
  radius: number,
): Generator<Allocation> {
  const options = INVESTMENT_FIELDS.map((field) => {
    const values: number[] = [];
    for (let v = base[field] - radius; v <= base[field] + radius; v += step) {
      if (v >= 0 && v <= total) values.push(v);
    }
    return values;
  });

  const [pa = [], pb = [], pc = [], pd = [], pe = []] = options;
  for (const a of pa) {
    for (const b of pb) {
      if (a + b > total) break;
      for (const c of pc) {
        if (a + b + c > total) break;
        for (const d of pd) {
          if (a + b + c + d > total) break;
          for (const e of pe) {
            if (a + b + c + d + e !== total) continue;
            yield {
              productPoints: a,
              technologyPoints: b,
              marketingPoints: c,
              distributionPoints: d,
              cxPoints: e,
            };
          }
        }
      }
    }
  }
}

function priceGrid(from: number, to: number, step: number): number[] {
  const values: number[] = [];
  for (let p = from; p <= to; p += step) values.push(p);
  // Always include the top of the range even when the step does not land on it.
  if (values[values.length - 1] !== to) values.push(to);
  return values;
}

/**
 * The objective. Net profit first; market share breaks a tie, because two
 * decisions worth the same money are not worth the same position.
 */
function isBetter(candidate: StrategyOutcome, incumbent: StrategyOutcome | null): boolean {
  if (!incumbent) return true;
  if (candidate.netProfit !== incumbent.netProfit) {
    return candidate.netProfit > incumbent.netProfit;
  }
  return candidate.marketShare > incumbent.marketShare;
}

/**
 * Runs the search. Roughly 0.3 s on a warm server: ~9,000 simulations in the
 * coarse pass and ~2,000 in the refinement. A flat 5-point sweep would be
 * ~95,000 and take an order of magnitude longer, which is too slow to sit
 * inside a button press.
 */
export function findGoldenStrategy(
  input: OptimizerInput,
  config: GameConfig = getGameConfig(),
): GoldenStrategy {
  const { quarter, states, previousQuarters, seed } = input;

  // Generated ONCE: the AI decisions and the demand jitter do not depend on the
  // player's decision, so every candidate is scored against the same market.
  const event = getMarketEvent(quarter, config, seed);
  const competitorDecisions = generateAllCompetitorDecisions(
    quarter,
    event,
    buildCompetitorContexts(previousQuarters, config),
    seed,
    config,
  );

  let tried = 0;
  const evaluate = (decision: QuarterDecision): { outcome: StrategyOutcome; simulation: QuarterSimulationResult } | null => {
    tried += 1;
    const simulation = simulateQuarter(
      {
        quarter,
        companies: states,
        decisions: { ...competitorDecisions, [PLAYER_COMPANY_KEY]: decision },
        scenarioVersion: config.scenarioVersion,
        engineVersion: config.engineVersion,
        seed,
      },
      config,
    );
    const result = simulation.companyResults.find((r) => r.companyKey === PLAYER_COMPANY_KEY);
    if (!result) return null;
    return {
      simulation,
      outcome: {
        decision,
        netProfit: result.netProfit,
        revenue: result.revenue,
        marketShare: result.marketShare,
        unitsSold: result.unitsSold,
        rank: result.rank,
      },
    };
  };

  const prices = priceGrid(config.priceIndexMin, config.priceIndexMax, COARSE_PRICE_STEP);

  let bestOutcome: StrategyOutcome | null = null;
  let bestAllocation: Allocation | null = null;

  for (const allocation of coarseAllocations(config.strategyPoints, COARSE_STEP)) {
    for (const priceIndex of prices) {
      const evaluated = evaluate({ ...allocation, priceIndex });
      if (evaluated && isBetter(evaluated.outcome, bestOutcome)) {
        bestOutcome = evaluated.outcome;
        bestAllocation = allocation;
      }
    }
  }

  if (!bestOutcome || !bestAllocation) {
    throw new Error('optimizer found no valid decision');
  }

  // Refinement: a finer grid around the coarse winner, and a 1-point price walk.
  const refinePrices = priceGrid(
    Math.max(config.priceIndexMin, bestOutcome.decision.priceIndex - REFINE_PRICE_RADIUS),
    Math.min(config.priceIndexMax, bestOutcome.decision.priceIndex + REFINE_PRICE_RADIUS),
    1,
  );

  for (const allocation of windowedAllocations(
    bestAllocation,
    config.strategyPoints,
    REFINE_STEP,
    REFINE_RADIUS,
  )) {
    for (const priceIndex of refinePrices) {
      const evaluated = evaluate({ ...allocation, priceIndex });
      if (evaluated && isBetter(evaluated.outcome, bestOutcome)) {
        bestOutcome = evaluated.outcome;
      }
    }
  }

  // The honest comparison: what an even allocation at the reference price would
  // have produced, and what the recommendation gives up in capability to beat it.
  const even = config.strategyPoints / INVESTMENT_FIELDS.length;
  const baselineDecision: QuarterDecision = {
    productPoints: even,
    technologyPoints: even,
    marketingPoints: even,
    distributionPoints: even,
    cxPoints: even,
    priceIndex: 100,
  };
  const baselineRun = evaluate(baselineDecision);
  const bestRun = evaluate(bestOutcome.decision);
  if (!baselineRun || !bestRun) throw new Error('optimizer could not score the baseline');

  const endState = (simulation: QuarterSimulationResult) =>
    simulation.nextStates.find((s) => s.companyKey === PLAYER_COMPANY_KEY);
  const bestEnd = endState(bestRun.simulation);
  const baselineEnd = endState(baselineRun.simulation);
  if (!bestEnd || !baselineEnd) throw new Error('optimizer could not read the end state');

  return {
    quarter,
    best: bestOutcome,
    baseline: baselineRun.outcome,
    capabilityCost: {
      productQuality: round(bestEnd.productQuality - baselineEnd.productQuality, 2),
      technology: round(bestEnd.technology - baselineEnd.technology, 2),
      distribution: round(bestEnd.distribution - baselineEnd.distribution, 2),
      customerExperience: round(bestEnd.customerExperience - baselineEnd.customerExperience, 2),
    },
    weights: event.weights,
    combinationsTried: tried,
  };
}

/** One quarter of the post-game "what you should have done" comparison. */
export interface HindsightQuarter {
  quarter: number;
  played: StrategyOutcome;
  best: StrategyOutcome;
  /** Net profit left on the table: best minus played. Never negative. */
  profitGap: number;
}

/**
 * Replays each quarter against the search, to show a student after the game
 * what the best single-quarter answer would have been.
 *
 * Six full searches, around 0.7 s in total. Only ever run after a session is
 * complete and only when the student asks for it — never on page load, and
 * never while a game is still being played.
 */
export function findHindsight(
  inputs: { input: OptimizerInput; played: QuarterDecision }[],
  config: GameConfig = getGameConfig(),
): HindsightQuarter[] {
  return inputs.map(({ input, played }) => {
    const golden = findGoldenStrategy(input, config);
    const playedRun = replayDecision(input, played, config);
    return {
      quarter: input.quarter,
      played: playedRun,
      best: golden.best,
      profitGap: round(Math.max(0, golden.best.netProfit - playedRun.netProfit), 2),
    };
  });
}

/** Scores one specific decision on one quarter, using the same market as the search. */
export function replayDecision(
  input: OptimizerInput,
  decision: QuarterDecision,
  config: GameConfig = getGameConfig(),
): StrategyOutcome {
  const event = getMarketEvent(input.quarter, config, input.seed);
  const competitorDecisions = generateAllCompetitorDecisions(
    input.quarter,
    event,
    buildCompetitorContexts(input.previousQuarters, config),
    input.seed,
    config,
  );

  const simulation = simulateQuarter(
    {
      quarter: input.quarter,
      companies: input.states,
      decisions: { ...competitorDecisions, [PLAYER_COMPANY_KEY]: decision },
      scenarioVersion: config.scenarioVersion,
      engineVersion: config.engineVersion,
      seed: input.seed,
    },
    config,
  );

  const result = simulation.companyResults.find((r) => r.companyKey === PLAYER_COMPANY_KEY);
  if (!result) throw new Error('replay produced no player result');

  return {
    decision,
    netProfit: result.netProfit,
    revenue: result.revenue,
    marketShare: result.marketShare,
    unitsSold: result.unitsSold,
    rank: result.rank,
  };
}
