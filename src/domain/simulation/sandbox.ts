import { ARENA_SCENARIO_VERSION, getGameConfig, type GameConfig } from './config';
import { NEUTRAL_DECISION, ARENA_SEATS } from './arena';
import { simulateQuarter } from './engine';
import { round } from './formulas';
import type { CompanyKey, CompanyState, QuarterDecision } from './types';

/**
 * A practice bench for the model, against neutral rivals.
 *
 * A student can try an allocation and see what the engine does with it, before
 * committing a decision five other people are waiting on.
 *
 * WHY THE RIVALS ARE CLONES OF THE VIEWER
 *
 * The obvious design — simulate against the rivals' REAL current states and
 * their real last-quarter decisions — leaks. A student could vary one input at
 * a time, watch the output move, and binary-search their way to a classmate's
 * exact allocation and capabilities. That is the one thing group mode must not
 * allow, and it would be invisible: nothing on screen would look like a leak.
 *
 * So the bench puts the viewer against five copies of THEMSELVES, each playing
 * an even split at the reference price. Every input is the student's own, so
 * there is nothing to infer about anyone else, and the comparison is clean: a
 * level field where the only variable is the allocation being tried.
 *
 * It is therefore explicitly NOT a prediction of the real quarter, and the
 * screen says so. It answers "what does this model reward?", not "what will
 * happen to me?" — and the first question is the one with a learnable answer.
 */

export interface SandboxOutcome {
  decision: QuarterDecision;
  unitsSold: number;
  revenue: number;
  netProfit: number;
  netProfitMargin: number;
  marketShare: number;
  customerSatisfaction: number;
  /** Rank against the five neutral clones, 1-6. */
  rank: number;
  /** Potential demand lost because distribution could not serve it. */
  unfulfilledUnits: number;
}

export interface SandboxResult {
  yours: SandboxOutcome;
  /** The same bench played with an even split, for comparison. */
  neutral: SandboxOutcome;
}

/**
 * Runs one decision against five neutral clones of the same company.
 *
 * Deterministic and cheap — two `simulateQuarter` calls, about 0.05 ms.
 */
export function runSandbox(input: {
  /** The viewer's own company state. Every rival is a copy of it. */
  playerState: CompanyState;
  decision: QuarterDecision;
  quarter: number;
  /** The session's seed, so repeated tries give a stable answer. */
  seed: string;
  config?: GameConfig;
}): SandboxResult {
  const config = input.config ?? getGameConfig(ARENA_SCENARIO_VERSION);

  const play = (decision: QuarterDecision): SandboxOutcome => {
    const companies: CompanyState[] = ARENA_SEATS.map((seatKey) => ({
      ...input.playerState,
      companyId: seatKey,
      companyKey: seatKey,
      companyName: seatKey,
      controllerType: seatKey === input.playerState.companyKey ? 'PLAYER' : 'AI',
      competitorProfile: null,
    }));

    const decisions: Record<string, QuarterDecision> = {};
    for (const seatKey of ARENA_SEATS) {
      decisions[seatKey] =
        seatKey === input.playerState.companyKey ? decision : { ...NEUTRAL_DECISION };
    }

    const simulation = simulateQuarter(
      {
        quarter: input.quarter,
        companies,
        decisions,
        scenarioVersion: config.scenarioVersion,
        engineVersion: config.engineVersion,
        seed: input.seed,
      },
      config,
    );

    const result = simulation.companyResults.find(
      (r) => r.companyKey === input.playerState.companyKey,
    );
    if (!result) throw new Error('sandbox produced no result for the player seat');

    return {
      decision,
      unitsSold: result.unitsSold,
      revenue: result.revenue,
      netProfit: result.netProfit,
      netProfitMargin: result.netProfitMargin,
      marketShare: result.marketShare,
      customerSatisfaction: result.customerSatisfaction,
      rank: result.rank,
      unfulfilledUnits: round(result.intermediates.unfulfilledUnits, 2),
    };
  };

  return { yours: play(input.decision), neutral: play({ ...NEUTRAL_DECISION }) };
}

/** Seats used by the bench. Exported so a test can assert nothing else leaks in. */
export const SANDBOX_SEATS: readonly CompanyKey[] = ARENA_SEATS;
