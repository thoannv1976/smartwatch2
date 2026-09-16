import { ARENA_SCENARIO_VERSION, getGameConfig, type GameConfig } from './config';
import { generateAllCompetitorDecisions } from './competitors';
import { simulateQuarter } from './engine';
import { getMarketEvent } from './events';
import { buildCompetitorContexts } from './game';
import { computeGameFinalScores, groupResultsByCompany } from './scoring';
import { PLAYER_COMPANY_KEY } from './types';
import type {
  CompanyFinalScore,
  CompanyKey,
  CompanyQuarterResult,
  CompanyState,
  CompetitorProfileKey,
  MarketEvent,
  QuarterDecision,
  QuarterSimulationResult,
} from './types';

/**
 * Group competition (Part 2): six human players, one company each.
 *
 * Still PURE. The only thing that changes versus the solo game is WHERE the six
 * decisions come from — here five of them are people rather than rules — so
 * this module is a thin layer over the same `simulateQuarter` the graded solo
 * game uses, and nothing in `engine.ts`, `scoring.ts` or `formulas.ts` needed
 * to change to support it.
 *
 * THE SEAT IDEA. The engine identifies companies by `CompanyKey`, a closed
 * union of six values. Rather than widen that type — which would ripple into
 * the ranking table, the charts, the scoring, the CSV export and every stored
 * document — the six existing keys are reused as SEATS, and a seat is assigned
 * to a student. A seat key never reaches the screen: students only ever see the
 * company name they chose themselves.
 */

/**
 * The six seats, in the order they are handed out.
 *
 * ORDER IS LOAD-BEARING. `player` is the only seat with no rule-based archetype
 * of its own in the configuration, so it is claimed first and is the last seat
 * that can end up bot-driven. Everything downstream may assume that a group
 * with at least one member has a human in `player`.
 */
export const ARENA_SEATS: readonly CompanyKey[] = [
  PLAYER_COMPANY_KEY,
  'apple',
  'garmin',
  'samsung',
  'huawei',
  'pixel',
] as const;

export const ARENA_SEAT_COUNT = ARENA_SEATS.length;

/**
 * Archetype a bot uses when it is holding a seat.
 *
 * Every seat maps to its own archetype except `player`, which has none — that
 * one borrows `samsung`, the only archetype that prices at the reference index
 * (100). A bot that discounts or charges a premium would shift the market for
 * all five humans, so the seat most likely to be filled last is given the most
 * neutral behaviour available.
 */
const ARENA_BOT_PROFILE: Record<CompanyKey, CompetitorProfileKey> = {
  player: 'samsung',
  apple: 'apple',
  garmin: 'garmin',
  samsung: 'samsung',
  huawei: 'huawei',
  pixel: 'pixel',
};

/** Who is sitting in a seat, and what they called their company. */
export interface ArenaSeatAssignment {
  seatKey: CompanyKey;
  /** null when no student holds this seat, so a bot drives it. */
  uid: string | null;
  companyName: string;
}

/** Everything needed to advance one quarter of a group match. */
export interface ArenaQuarterInput {
  quarter: number;
  /** Company states at the START of the quarter, all six seats. */
  states: CompanyState[];
  /** Decisions submitted by the students, keyed by seat. Gaps are bot-driven. */
  humanDecisions: Partial<Record<CompanyKey, QuarterDecision>>;
  /** Every quarter already simulated, oldest first. */
  previousQuarters: QuarterSimulationResult[];
  seed: string;
}

export interface ArenaPlayedQuarter {
  simulation: QuarterSimulationResult;
  event: MarketEvent;
  /** All six decisions actually used, including any generated for empty seats. */
  decisions: Record<string, QuarterDecision>;
  /** Seats whose decision was generated rather than submitted by a student. */
  botSeats: CompanyKey[];
}

/**
 * Builds the six starting companies of a group match.
 *
 * Every seat gets the SAME starting row — that is the whole reason the arena
 * scenario exists, see `config.ts`. A seat with no student is marked `AI` and
 * carries an archetype so the rule-based generator can drive it.
 */
export function createArenaCompanies(
  seats: ArenaSeatAssignment[],
  config: GameConfig = getGameConfig(ARENA_SCENARIO_VERSION),
): CompanyState[] {
  const bySeat = new Map(seats.map((seat) => [seat.seatKey, seat]));

  return ARENA_SEATS.map((seatKey) => {
    const seat = bySeat.get(seatKey) ?? null;
    const human = seat?.uid != null;
    const start = human
      ? config.playerStart
      : (config.competitors.find((c) => c.key === seatKey)?.start ?? config.playerStart);

    return {
      companyId: seatKey,
      companyKey: seatKey,
      companyName: seat?.companyName?.trim() || defaultSeatName(seatKey, config),
      controllerType: human ? 'PLAYER' : 'AI',
      competitorProfile: human ? null : ARENA_BOT_PROFILE[seatKey],
      ...start,
    } satisfies CompanyState;
  });
}

/** Fallback display name for a seat nobody has claimed. */
function defaultSeatName(seatKey: CompanyKey, config: GameConfig): string {
  const competitor = config.competitors.find((c) => c.key === seatKey);
  if (competitor) return competitor.displayName;
  // Only reachable for the `player` seat, which is claimed first.
  return 'Bot 1';
}

/**
 * Plays one quarter of a group match.
 *
 * Seats with no submitted decision are filled by the rule-based generator, the
 * same code that drives the solo game's competitors. That is what makes a group
 * of five students playable without a special case anywhere downstream: the
 * market always contains six companies.
 */
export function playArenaQuarter(
  input: ArenaQuarterInput,
  config: GameConfig = getGameConfig(ARENA_SCENARIO_VERSION),
): ArenaPlayedQuarter {
  const { quarter, states, humanDecisions, previousQuarters, seed } = input;
  const event = getMarketEvent(quarter, config);

  // Generated for every seat, then overwritten by the humans. Generating all of
  // them regardless keeps the seeded stream identical whether a seat happens to
  // be occupied this quarter or not, so removing a student mid-match cannot
  // change what the remaining bots would have done.
  const generated = generateAllCompetitorDecisions(
    quarter,
    event,
    buildCompetitorContexts(previousQuarters, config),
    seed,
    config,
  );

  const decisions: Record<string, QuarterDecision> = {};
  const botSeats: CompanyKey[] = [];

  for (const seatKey of ARENA_SEATS) {
    const submitted = humanDecisions[seatKey];
    if (submitted) {
      decisions[seatKey] = submitted;
      continue;
    }
    botSeats.push(seatKey);
    decisions[seatKey] =
      generated[ARENA_BOT_PROFILE[seatKey]] ?? generated[seatKey as CompetitorProfileKey] ?? NEUTRAL_DECISION;
  }

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

  return { simulation, event, decisions, botSeats };
}

/**
 * The decision recorded for a student who did not submit before the instructor
 * forced the quarter through, and the last-resort fill for a bot seat.
 *
 * An even split at the reference price: the most neutral thing that can be done
 * on someone's behalf. Callers that have the student's PREVIOUS decision should
 * repeat that instead — see `defaultDecisionFor`.
 */
export const NEUTRAL_DECISION: QuarterDecision = {
  productPoints: 20,
  technologyPoints: 20,
  marketingPoints: 20,
  distributionPoints: 20,
  cxPoints: 20,
  priceIndex: 100,
};

/**
 * What to submit for a student who has run out of time.
 *
 * Repeating their own last decision is far less of an intervention than
 * imposing an even split: it keeps their strategy going rather than resetting
 * it, and it is what they would most likely have done. Falls back to the
 * neutral split in quarter one, where there is nothing to repeat.
 */
export function defaultDecisionFor(previous: QuarterDecision | null): QuarterDecision {
  return previous ? { ...previous } : { ...NEUTRAL_DECISION };
}

export interface ArenaGameResult {
  quarters: ArenaPlayedQuarter[];
  finalScores: CompanyFinalScore[];
  allResults: CompanyQuarterResult[];
  historiesBySeat: Map<CompanyKey, CompanyQuarterResult[]>;
}

/**
 * Runs a complete group match in memory from each seat's list of decisions.
 *
 * Used by the tests and the balance suite. Goes through exactly the same
 * `playArenaQuarter` the server uses, so a match that is fair here is fair in a
 * real session.
 */
export function runArenaGame(
  seats: ArenaSeatAssignment[],
  decisionsBySeat: Partial<Record<CompanyKey, QuarterDecision[]>>,
  seed: string,
  config: GameConfig = getGameConfig(ARENA_SCENARIO_VERSION),
): ArenaGameResult {
  let states = createArenaCompanies(seats, config);
  const quarters: ArenaPlayedQuarter[] = [];

  for (let quarter = 1; quarter <= config.quarters; quarter += 1) {
    const humanDecisions: Partial<Record<CompanyKey, QuarterDecision>> = {};
    for (const seat of seats) {
      if (seat.uid == null) continue;
      const decision = decisionsBySeat[seat.seatKey]?.[quarter - 1];
      if (decision) humanDecisions[seat.seatKey] = decision;
    }

    const played = playArenaQuarter(
      {
        quarter,
        states,
        humanDecisions,
        previousQuarters: quarters.map((q) => q.simulation),
        seed,
      },
      config,
    );

    quarters.push(played);
    states = played.simulation.nextStates;
  }

  const allResults = quarters.flatMap((q) => q.simulation.companyResults);
  const historiesBySeat = groupResultsByCompany(allResults);

  return {
    quarters,
    finalScores: computeGameFinalScores(historiesBySeat, config),
    allResults,
    historiesBySeat,
  };
}

/** Convenience for tests and balance runs: the same decision in every quarter. */
export function repeatForAllSeats(
  seats: ArenaSeatAssignment[],
  decision: QuarterDecision,
  config: GameConfig = getGameConfig(ARENA_SCENARIO_VERSION),
): Partial<Record<CompanyKey, QuarterDecision[]>> {
  const out: Partial<Record<CompanyKey, QuarterDecision[]>> = {};
  for (const seat of seats) {
    out[seat.seatKey] = Array.from({ length: config.quarters }, () => ({ ...decision }));
  }
  return out;
}

/** Six seats all held by students, named `Company 1` … `Company 6`. */
export function fullArenaSeats(): ArenaSeatAssignment[] {
  return ARENA_SEATS.map((seatKey, index) => ({
    seatKey,
    uid: `student-${index + 1}`,
    companyName: `Company ${index + 1}`,
  }));
}
