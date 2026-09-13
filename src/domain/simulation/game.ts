import { getGameConfig, type GameConfig } from './config';
import {
  EMPTY_COMPETITOR_CONTEXT,
  buildCompetitorIntel,
  generateAllCompetitorDecisions,
  type CompetitorContext,
} from './competitors';
import { createInitialCompanies, simulateQuarter } from './engine';
import { getMarketEvent } from './events';
import { computeGameFinalScores, groupResultsByCompany } from './scoring';
import { PLAYER_COMPANY_KEY } from './types';
import type {
  CompanyFinalScore,
  CompanyKey,
  CompanyQuarterResult,
  CompanyState,
  CompetitorIntel,
  CompetitorProfileKey,
  MarketEvent,
  QuarterDecision,
  QuarterSimulationResult,
} from './types';

/**
 * Whole-game orchestration on top of the engine — still pure.
 *
 * The server uses `playQuarter` one quarter at a time (persisting between calls);
 * the internal simulation test page and the balance script use `runFullGame` to
 * play six quarters in memory. Both go through exactly the same code path, so a
 * strategy balanced in the test tool behaves identically in a real session.
 */

/** Everything needed to advance one quarter, plus the competitor decisions used. */
export interface PlayedQuarter {
  simulation: QuarterSimulationResult;
  event: MarketEvent;
  /** Decisions of all six companies, including the five generated AI ones. */
  decisions: Record<string, QuarterDecision>;
  intel: CompetitorIntel[];
}

/**
 * Builds each AI competitor's view of its own recent performance (spec 7.2).
 * `previousQuarters` must be in quarter order, oldest first.
 */
export function buildCompetitorContexts(
  previousQuarters: QuarterSimulationResult[],
  config: GameConfig = getGameConfig(),
): Partial<Record<CompetitorProfileKey, CompetitorContext>> {
  const contexts: Partial<Record<CompetitorProfileKey, CompetitorContext>> = {};
  const last = previousQuarters[previousQuarters.length - 1];
  const beforeLast = previousQuarters[previousQuarters.length - 2];

  for (const competitor of config.competitors) {
    if (!last) {
      contexts[competitor.key] = EMPTY_COMPETITOR_CONTEXT;
      continue;
    }
    const lastResult = last.companyResults.find((r) => r.companyKey === competitor.key);
    const beforeResult = beforeLast?.companyResults.find((r) => r.companyKey === competitor.key);

    contexts[competitor.key] = {
      previousMarketShare: lastResult?.marketShare ?? null,
      marketShareTwoQuartersAgo: beforeResult?.marketShare ?? null,
      previousCsat: lastResult?.customerSatisfaction ?? null,
      previousNetProfitMargin: lastResult?.netProfitMargin ?? null,
    };
  }

  return contexts;
}

/**
 * Plays one quarter: generates the five AI decisions, runs the engine and builds
 * the competitor intelligence summary.
 *
 * @param states company states at the start of the quarter (six companies)
 * @param playerDecision the validated decision submitted by the student
 * @param previousQuarters every quarter already simulated, oldest first
 */
export function playQuarter(
  quarter: number,
  states: CompanyState[],
  playerDecision: QuarterDecision,
  previousQuarters: QuarterSimulationResult[],
  seed: string,
  config: GameConfig = getGameConfig(),
  previousDecisions: Record<string, QuarterDecision> | null = null,
): PlayedQuarter {
  const event = getMarketEvent(quarter, config);
  const contexts = buildCompetitorContexts(previousQuarters, config);
  const competitorDecisions = generateAllCompetitorDecisions(
    quarter,
    event,
    contexts,
    seed,
    config,
  );

  const decisions: Record<string, QuarterDecision> = {
    ...competitorDecisions,
    [PLAYER_COMPANY_KEY]: playerDecision,
  };

  const simulation = simulateQuarter(
    {
      quarter,
      companies: states,
      decisions,
      scenarioVersion: config.scenarioVersion,
      engineVersion: config.engineVersion,
      seed,
    },
    config,
  );

  return {
    simulation,
    event,
    decisions,
    intel: buildCompetitorIntel(decisions, previousDecisions, config),
  };
}

export interface FullGameResult {
  quarters: PlayedQuarter[];
  /** Final scores for all six companies, ranked (1 = best). */
  finalScores: CompanyFinalScore[];
  /** The player company's own final score entry. */
  playerScore: CompanyFinalScore | null;
  /** Flat list of every company's every quarter result. */
  allResults: CompanyQuarterResult[];
  historiesByCompany: Map<CompanyKey, CompanyQuarterResult[]>;
}

/**
 * Runs a complete six-quarter game in memory from a list of player decisions.
 * Used by the internal simulation test page, the balance script and the tests.
 *
 * @param playerDecisions one decision per quarter; may be shorter than the
 *        configured number of quarters, in which case only those quarters run.
 */
export function runFullGame(
  playerDecisions: QuarterDecision[],
  seed: string,
  playerCompanyName = 'Player brand',
  config: GameConfig = getGameConfig(),
): FullGameResult {
  let states = createInitialCompanies(playerCompanyName, config);
  const quarters: PlayedQuarter[] = [];
  let previousDecisions: Record<string, QuarterDecision> | null = null;

  const quarterCount = Math.min(playerDecisions.length, config.quarters);

  for (let quarter = 1; quarter <= quarterCount; quarter += 1) {
    const decision = playerDecisions[quarter - 1];
    if (!decision) break;

    const played = playQuarter(
      quarter,
      states,
      decision,
      quarters.map((q) => q.simulation),
      seed,
      config,
      previousDecisions,
    );

    quarters.push(played);
    states = played.simulation.nextStates;
    previousDecisions = played.decisions;
  }

  const allResults = quarters.flatMap((q) => q.simulation.companyResults);
  const historiesByCompany = groupResultsByCompany(allResults);
  const finalScores = computeGameFinalScores(historiesByCompany, config);

  return {
    quarters,
    finalScores,
    playerScore: finalScores.find((s) => s.companyKey === PLAYER_COMPANY_KEY) ?? null,
    allResults,
    historiesByCompany,
  };
}

/** Convenience: repeats one fixed decision for every quarter of the game. */
export function repeatDecision(
  decision: QuarterDecision,
  config: GameConfig = getGameConfig(),
): QuarterDecision[] {
  return Array.from({ length: config.quarters }, () => ({ ...decision }));
}
