import 'server-only';
import {
  GOLDEN_STRATEGY_MAX_QUARTERS,
  PLAYER_COMPANY_KEY,
  SCENARIO_VERSION,
  analyseStrategy,
  computeFinalScoreBreakdown,
  computeGameFinalScores,
  createInitialCompanies,
  findGoldenStrategy,
  findHindsight,
  getGameConfig,
  getMarketEvent,
  groupResultsByCompany,
  playQuarter,
  suggestStrategies,
  tenureReview,
  isValidForecast,
  validateDecision,
  type CompanyFinalScore,
  type CompanyQuarterResult,
  type GoldenStrategy,
  type HindsightQuarter,
  type OptimizerInput,
  type Positioning,
  type QuarterDecision,
  type QuarterForecast,
  type QuarterFacts,
  type QuarterSimulationResult,
  type StrategyAnalysis,
  type StrategySuggestion,
  type TenureReview,
} from '@/domain/simulation';
import type {
  AssignmentDoc,
  FinalResultDoc,
  GameMode,
  GameSessionDoc,
  QuarterDoc,
  SessionCompany,
} from '@/db/models';
import { goldenUsedQuarters } from '@/db/models';
import type { Repositories } from '@/db/repositories/types';
import { GameError } from './errors';

/**
 * Game session orchestration — the server-authoritative core (spec 13.1).
 *
 * The browser sends only a decision. Everything else (the five AI decisions,
 * the market simulation, revenue, units, profit, market share, scores and
 * ranking) is produced here and persisted before anything is returned.
 *
 * The submit path is:
 *   1. receive decision
 *   2. validate values and authorisation
 *   3. load current session state
 *   4. generate five AI decisions
 *   5. run the simulation engine
 *   6. persist the decision and all six company results in one transaction
 *   7. commit
 *   8. return results to the browser
 */

export interface CreateSessionInput {
  userId: string;
  displayName: string;
  email: string;
  mode: GameMode;
  assignmentId: string | null;
  companyName: string;
  productName: string;
  positioning: Positioning;
}

const MAX_NAME_LENGTH = 60;

/**
 * Practice seeds vary so a student can replay the same strategy and see that
 * the market is not a fixed script; official seeds are fixed by the assignment
 * so every student in a class faces exactly the same conditions (spec 9.1, 9.2).
 */
function practiceSeed(userId: string): string {
  return `practice-${userId}-${Date.now().toString(36)}`;
}

export class GameService {
  constructor(private readonly repos: Repositories) {}

  // -- session creation -----------------------------------------------------

  async createSession(input: CreateSessionInput): Promise<GameSessionDoc> {
    const companyName = input.companyName.trim();
    const productName = input.productName.trim();
    if (
      !companyName ||
      !productName ||
      companyName.length > MAX_NAME_LENGTH ||
      productName.length > MAX_NAME_LENGTH
    ) {
      throw new GameError('invalidCompanyName');
    }

    let assignment: AssignmentDoc | null = null;
    let attemptNo = 1;
    let scenarioVersion = SCENARIO_VERSION;
    let seed = practiceSeed(input.userId);

    if (input.mode === 'OFFICIAL') {
      if (!input.assignmentId) throw new GameError('assignmentNotFound');
      assignment = await this.repos.assignments.get(input.assignmentId);
      if (!assignment) throw new GameError('assignmentNotFound');

      await this.assertEnrolled(input.userId, assignment);
      this.assertWindowOpen(assignment);

      const used = await this.repos.sessions.countAttempts(input.userId, assignment.id);
      if (used >= assignment.maxAttempts) throw new GameError('maxAttemptsReached');

      attemptNo = used + 1;
      scenarioVersion = assignment.scenarioVersion;
      seed = assignment.officialSeed;
    }

    const config = getGameConfig(scenarioVersion);
    const companies = createInitialCompanies(companyName, config) as SessionCompany[];

    const draft = {
      userId: input.userId,
      assignmentId: assignment?.id ?? null,
      mode: input.mode,
      attemptNo,
      companyName,
      productName,
      positioning: input.positioning,
      currentRound: 0,
      scenarioVersion,
      engineVersion: config.engineVersion,
      randomSeed: seed,
      status: 'IN_PROGRESS' as const,
      companies,
      startedAt: Date.now(),
      completedAt: null,
    };

    if (!assignment) return this.repos.sessions.create(draft);

    // The count above is a courtesy check that produces a good error message;
    // it is NOT what enforces the limit. Two clicks arriving together both read
    // the same count, so the attempt number is claimed in the datastore and the
    // loser is rejected there. Retrying picks up the now-higher count and
    // either claims the next attempt or reports the limit properly.
    const claimed = await this.repos.sessions.createOfficialAttempt(
      draft,
      assignment.id,
      attemptNo,
    );
    // Losing the claim means this attempt number is already taken — almost
    // always a double-click. Deliberately NOT retried with the next number:
    // silently opening a second game would burn one of a limited set of graded
    // attempts on a stray click. Sending the student back to the game they
    // already have is both safer and what they meant.
    if (!claimed) throw new GameError('attemptAlreadyStarted');
    return claimed;
  }

  private async assertEnrolled(userId: string, assignment: AssignmentDoc): Promise<void> {
    const member = await this.repos.courses.getMember(assignment.courseId, userId);
    if (!member) throw new GameError('notEnrolled');
  }

  private assertWindowOpen(assignment: AssignmentDoc): void {
    const now = Date.now();
    if (!assignment.isOpen || now < assignment.startAt) throw new GameError('notOpenYet');
    if (now > assignment.deadline) throw new GameError('deadlinePassed');
  }

  // -- reading --------------------------------------------------------------

  /**
   * Loads a session and checks it belongs to the caller.
   *
   * Also repairs a session that finished playing but never got its final
   * result — see `ensureFinalized`. Opening any of the player's own pages is
   * therefore enough to recover, with no support request and no lost grade.
   */
  async getOwnedSession(sessionId: string, userId: string): Promise<GameSessionDoc> {
    return this.ensureFinalized(await this.loadOwnedSession(sessionId, userId), userId);
  }

  /** The ownership check alone, with no repair — used by paths that finalize. */
  private async loadOwnedSession(sessionId: string, userId: string): Promise<GameSessionDoc> {
    const session = await this.repos.sessions.get(sessionId);
    if (!session) throw new GameError('sessionNotFound');
    if (session.userId !== userId) throw new GameError('notYourSession');
    return session;
  }

  /**
   * Finishes a session that played all its quarters but has no final result.
   *
   * Storing quarter six and finalizing are two separate operations, so a
   * failure between them — a Firestore blip, or the Cloud Run request timeout
   * firing on a slow quarter six — leaves a session with every quarter on
   * record, no score, and no way back: re-submitting returns the stored quarter
   * without finalizing, and nothing else calls finalize. The student would
   * silently lose the grade for a completed game.
   *
   * The test is "is there a final result", not "is the status COMPLETED",
   * because finalize marks the session complete BEFORE it writes the result;
   * failing in between leaves a session that looks finished and is not.
   * `finalize` is idempotent and preserves the original completedAt, so
   * re-running it cannot change a grade that was already awarded.
   */
  private async ensureFinalized(
    session: GameSessionDoc,
    userId: string,
  ): Promise<GameSessionDoc> {
    const config = getGameConfig(session.scenarioVersion);

    // currentRound is advanced in the same transaction that stores the quarter,
    // so this is true only once every quarter really is on record. Sessions
    // still being played cost no extra read.
    if (session.currentRound < config.quarters) return session;

    const result = await this.repos.finalResults.get(session.id);
    if (result) return session;

    return this.finalize(session.id, userId);
  }

  /** Loads a session for an instructor or admin, without the ownership check. */
  async getSessionForStaff(sessionId: string): Promise<GameSessionDoc> {
    const session = await this.repos.sessions.get(sessionId);
    if (!session) throw new GameError('sessionNotFound');
    return session;
  }

  async listQuarters(sessionId: string): Promise<QuarterDoc[]> {
    return this.repos.sessions.listQuarters(sessionId);
  }

  // -- the submit path ------------------------------------------------------

  /**
   * Simulates one quarter and persists it.
   *
   * Idempotent by construction (spec 13.2): the repository creates the quarter
   * document inside a transaction, and if it already exists the stored result is
   * returned untouched. Re-submitting a completed quarter therefore cannot
   * produce a second, different outcome — not even under a double-click, a
   * retry or two concurrent requests.
   */
  async submitQuarter(
    sessionId: string,
    userId: string,
    quarter: number,
    decision: QuarterDecision,
    /**
     * What the student expects to happen. Recorded, never acted on: it does not
     * reach the engine and cannot change a single number in the result. It is
     * accepted HERE, on the same request that runs the market, which is exactly
     * why it can be trusted — there is no later moment at which it could be
     * written with the answer already on screen.
     */
    forecast: QuarterForecast | null = null,
  ): Promise<{ quarter: QuarterDoc; session: GameSessionDoc; replayed: boolean }> {
    const session = await this.loadOwnedSession(sessionId, userId);
    const config = getGameConfig(session.scenarioVersion);

    if (!Number.isInteger(quarter) || quarter < 1 || quarter > config.quarters) {
      throw new GameError('quarterOutOfRange');
    }

    // A quarter already on record wins immediately: no revalidation, no
    // recomputation, no write. Re-submitting the last quarter still gets the
    // session finalized, so a retry recovers a finalize that failed the first
    // time rather than short-circuiting past it forever.
    const existing = await this.repos.sessions.getQuarter(sessionId, quarter);
    if (existing) {
      return {
        quarter: existing,
        session: await this.ensureFinalized(session, userId),
        replayed: true,
      };
    }

    if (session.status === 'COMPLETED') throw new GameError('gameAlreadyCompleted');
    if (quarter !== session.currentRound + 1) throw new GameError('quarterOutOfRange');

    const errors = validateDecision(decision, config);
    if (errors.length > 0) throw new GameError(errors[0]!);

    // A malformed prediction must never cost a student their quarter: the
    // decision is the thing being graded. So it is dropped rather than raised.
    const storedForecast =
      forecast && isValidForecast(forecast, config.competitors.length + 1) ? forecast : null;

    if (session.mode === 'OFFICIAL' && session.assignmentId) {
      const assignment = await this.repos.assignments.get(session.assignmentId);
      if (!assignment) throw new GameError('assignmentNotFound');
      this.assertWindowOpen(assignment);
    }

    const previousQuarters = await this.repos.sessions.listQuarters(sessionId);
    const previousSimulations: QuarterSimulationResult[] = previousQuarters.map((q) =>
      this.toSimulationResult(q, session),
    );
    const previousDecisions = previousQuarters[previousQuarters.length - 1]?.decisions ?? null;

    const played = playQuarter(
      quarter,
      session.companies,
      decision,
      previousSimulations,
      session.randomSeed,
      config,
      previousDecisions,
    );

    const quarterDoc: QuarterDoc = {
      quarter,
      eventKey: played.simulation.eventKey,
      marketUnits: played.simulation.marketUnits,
      weights: played.simulation.weights,
      decisions: played.decisions,
      results: played.simulation.companyResults,
      ranking: played.simulation.ranking,
      intel: played.intel,
      simulatedAt: Date.now(),
      forecast: storedForecast,
    };

    const outcome = await this.repos.sessions.saveQuarter(
      sessionId,
      quarterDoc,
      played.simulation.nextStates as SessionCompany[],
    );

    if (outcome.status === 'ALREADY_EXISTS') {
      // Lost a race against a concurrent submission of the same quarter. The
      // stored result is authoritative; the work just done is discarded.
      return { quarter: outcome.quarter, session: outcome.session, replayed: true };
    }

    let updatedSession = outcome.session;
    if (quarter === config.quarters) {
      updatedSession = await this.finalize(sessionId, userId);
    }

    return { quarter: outcome.quarter, session: updatedSession, replayed: false };
  }

  /**
   * Rebuilds the engine's view of a stored quarter, so a replayed history is
   * indistinguishable from one simulated in this process. Every field is
   * reconstructed from the stored result rows rather than from the session's
   * current state, which would be the state after the LAST quarter rather than
   * after this one.
   */
  private toSimulationResult(
    quarterDoc: QuarterDoc,
    session: GameSessionDoc,
  ): QuarterSimulationResult {
    const byKey = new Map(session.companies.map((c) => [c.companyKey, c]));

    return {
      quarter: quarterDoc.quarter,
      eventKey: quarterDoc.eventKey,
      marketUnits: quarterDoc.marketUnits,
      weights: quarterDoc.weights,
      companyResults: quarterDoc.results,
      ranking: quarterDoc.ranking,
      nextStates: quarterDoc.results.map((result) => ({
        companyId: result.companyId,
        companyKey: result.companyKey,
        companyName: result.companyName,
        controllerType: result.controllerType,
        competitorProfile: byKey.get(result.companyKey)?.competitorProfile ?? null,
        brandAwareness: result.brandAwareness,
        productQuality: result.productQuality,
        technology: result.technology,
        distribution: result.distribution,
        customerExperience: result.customerExperience,
        customerSatisfaction: result.customerSatisfaction,
        cash: result.cash,
      })),
      engineVersion: session.engineVersion,
      scenarioVersion: session.scenarioVersion,
    };
  }

  // -- completion and scoring ----------------------------------------------

  /**
   * Marks a session complete and writes its leaderboard row.
   *
   * Safe to call twice: the final result document is keyed by session id, and
   * the scores are a pure function of the stored quarters.
   */
  async finalize(sessionId: string, userId: string): Promise<GameSessionDoc> {
    // The raw loader, not getOwnedSession: that one calls back into here to
    // repair unfinalized sessions, which would recurse without end.
    const session = await this.loadOwnedSession(sessionId, userId);
    const config = getGameConfig(session.scenarioVersion);
    const quarters = await this.repos.sessions.listQuarters(sessionId);

    if (quarters.length < config.quarters) throw new GameError('quarterOutOfRange');

    const completedAt = session.completedAt ?? Date.now();
    if (session.status !== 'COMPLETED') {
      await this.repos.sessions.complete(sessionId, completedAt);
    }

    const scores = this.scoreSession(session, quarters);
    const playerScore = scores.find((s) => s.companyKey === PLAYER_COMPANY_KEY);
    if (!playerScore) throw new GameError('sessionNotFound');

    const user = await this.repos.users.get(userId);
    let studentCode: string | null = null;
    if (session.assignmentId) {
      const assignment = await this.repos.assignments.get(session.assignmentId);
      if (assignment) {
        const member = await this.repos.courses.getMember(assignment.courseId, userId);
        studentCode = member?.studentCode ?? null;
      }
    }

    const finalResult: FinalResultDoc = {
      sessionId,
      userId,
      assignmentId: session.assignmentId,
      mode: session.mode,
      displayName: user?.displayName ?? '',
      email: user?.email ?? '',
      studentCode,
      companyName: session.companyName,
      productName: session.productName,
      positioning: session.positioning,
      scenarioVersion: session.scenarioVersion,
      engineVersion: session.engineVersion,

      cumulativeRevenue: playerScore.cumulativeRevenue,
      cumulativeProfit: playerScore.cumulativeProfit,
      finalMarketShare: playerScore.finalMarketShare,
      finalBrand: playerScore.finalBrand,
      finalCsat: playerScore.finalCsat,
      finalProductQuality: playerScore.finalProductQuality,
      finalTechnology: playerScore.finalTechnology,
      finalCash: playerScore.finalCash,
      finalNetProfitMargin: playerScore.finalNetProfitMargin,

      profitScore: playerScore.profitScore,
      marketShareScore: playerScore.marketShareScore,
      brandScore: playerScore.brandScore,
      csatScore: playerScore.csatScore,
      innovationScore: playerScore.innovationScore,
      finalScore: playerScore.finalScore,

      gameRank: playerScore.gameRank,
      completedAt,
      goldenUsedQuarters: goldenUsedQuarters(session),
    };

    await this.repos.finalResults.save(finalResult);

    return { ...session, status: 'COMPLETED', completedAt };
  }

  /** Final scores for all six companies of a session. Pure. */
  scoreSession(session: GameSessionDoc, quarters: QuarterDoc[]): CompanyFinalScore[] {
    const config = getGameConfig(session.scenarioVersion);
    const results: CompanyQuarterResult[] = quarters.flatMap((q) => q.results);
    return computeGameFinalScores(groupResultsByCompany(results), config);
  }

  // -- the coach ------------------------------------------------------------

  /**
   * Turns stored quarters into the shape the coach reads. Pure.
   *
   * Uses the demand weights stored ON THE QUARTER, not the ones the event
   * config would produce today: a session played under an older scenario must
   * be reviewed against the market it actually faced.
   */
  quarterFacts(quarters: QuarterDoc[]): QuarterFacts[] {
    const facts: QuarterFacts[] = [];
    for (const quarter of [...quarters].sort((a, b) => a.quarter - b.quarter)) {
      const decision = quarter.decisions[PLAYER_COMPANY_KEY];
      const result = quarter.results.find((r) => r.companyKey === PLAYER_COMPANY_KEY);
      if (!decision || !result) continue;
      facts.push({ quarter: quarter.quarter, weights: quarter.weights, decision, result });
    }
    return facts;
  }

  /** Heuristic suggestions for the quarter about to be played. Pure. */
  suggestionsFor(session: GameSessionDoc, quarters: QuarterDoc[]): StrategySuggestion[] {
    const config = getGameConfig(session.scenarioVersion);
    const quarter = session.currentRound + 1;
    if (quarter > config.quarters) return [];

    const player = session.companies.find((c) => c.companyKey === PLAYER_COMPANY_KEY);
    if (!player) return [];

    const facts = this.quarterFacts(quarters);
    return suggestStrategies(
      getMarketEvent(quarter, config),
      player,
      facts.map((f) => f.result),
      facts[facts.length - 1]?.decision ?? null,
      config,
    );
  }

  /** The six-quarter verdict shown on the final report. Pure. */
  tenure(session: GameSessionDoc, quarters: QuarterDoc[], finalScore: number): TenureReview {
    return tenureReview(this.quarterFacts(quarters), finalScore);
  }

  /**
   * Builds the optimizer's view of the quarter about to be played.
   *
   * `session.companies` is already the state AFTER the last stored quarter,
   * which is exactly the state the next quarter starts from.
   */
  private optimizerInputFor(session: GameSessionDoc, quarters: QuarterDoc[]): OptimizerInput {
    return {
      quarter: session.currentRound + 1,
      states: session.companies,
      previousQuarters: quarters.map((q) => this.toSimulationResult(q, session)),
      seed: session.randomSeed,
    };
  }

  /**
   * The Golden Strategy for the quarter the student is about to play.
   *
   * Available in BOTH practice and official games, capped at
   * `GOLDEN_STRATEGY_MAX_QUARTERS` distinct quarters per session. The cap is
   * claimed in the datastore, not checked here, so two requests arriving
   * together cannot both spend the last use.
   *
   * Asking again for a quarter already coached costs nothing: the search is
   * deterministic, so a refresh returns the same answer for free.
   */
  async goldenStrategy(
    sessionId: string,
    userId: string,
  ): Promise<{ golden: GoldenStrategy; usedQuarters: number[]; maxQuarters: number }> {
    const session = await this.loadOwnedSession(sessionId, userId);
    const config = getGameConfig(session.scenarioVersion);
    const quarter = session.currentRound + 1;

    if (session.status === 'COMPLETED' || quarter > config.quarters) {
      throw new GameError('gameAlreadyCompleted');
    }

    // Coaching a graded attempt after the deadline would be coaching a quarter
    // that can no longer be submitted — and would spend a use for nothing.
    if (session.mode === 'OFFICIAL' && session.assignmentId) {
      const assignment = await this.repos.assignments.get(session.assignmentId);
      if (!assignment) throw new GameError('assignmentNotFound');
      this.assertWindowOpen(assignment);
    }

    const claim = await this.repos.sessions.claimGoldenUse(
      sessionId,
      quarter,
      GOLDEN_STRATEGY_MAX_QUARTERS,
    );
    if (claim.status === 'LIMIT_REACHED') throw new GameError('goldenLimitReached');

    const quarters = await this.repos.sessions.listQuarters(sessionId);
    const golden = findGoldenStrategy(this.optimizerInputFor(session, quarters), config);

    return {
      golden,
      usedQuarters: claim.used,
      maxQuarters: GOLDEN_STRATEGY_MAX_QUARTERS,
    };
  }

  /**
   * The post-game "what you should have done" comparison.
   *
   * ONLY for a session that is already finished. While a game is in progress
   * this would be a way to read the answer to the quarter you are about to
   * play, bypassing the Golden Strategy limit entirely — so the status check
   * is a security boundary, not a convenience.
   */
  async hindsight(sessionId: string, userId: string): Promise<HindsightQuarter[]> {
    const session = await this.getOwnedSession(sessionId, userId);
    const config = getGameConfig(session.scenarioVersion);

    if (session.status !== 'COMPLETED') throw new GameError('gameNotCompleted');

    const quarters = await this.repos.sessions.listQuarters(sessionId);
    const simulations = quarters.map((q) => this.toSimulationResult(q, session));

    // Replay forward from the original starting states: `session.companies` is
    // the state at the END of the game, not the start of each quarter.
    let states = createInitialCompanies(session.companyName, config);
    const inputs: { input: OptimizerInput; played: QuarterDecision }[] = [];

    for (let i = 0; i < quarters.length; i += 1) {
      const quarter = quarters[i];
      const simulation = simulations[i];
      if (!quarter || !simulation) break;
      const played = quarter.decisions[PLAYER_COMPANY_KEY];
      if (!played) break;

      inputs.push({
        input: {
          quarter: quarter.quarter,
          states,
          previousQuarters: simulations.slice(0, i),
          seed: session.randomSeed,
        },
        played,
      });
      states = simulation.nextStates;
    }

    return findHindsight(inputs, config);
  }

  /** Quarters of this session that were coached by the Golden Strategy. */
  goldenUses(session: GameSessionDoc): number[] {
    return goldenUsedQuarters(session);
  }

  /** The rule-based analysis shown in the final report (spec 8.4). Pure. */
  analyse(session: GameSessionDoc, quarters: QuarterDoc[]): StrategyAnalysis {
    const config = getGameConfig(session.scenarioVersion);
    const playerDecisions = quarters
      .sort((a, b) => a.quarter - b.quarter)
      .map((q) => q.decisions[PLAYER_COMPANY_KEY])
      .filter((d): d is QuarterDecision => Boolean(d));

    const history = quarters
      .flatMap((q) => q.results)
      .filter((r) => r.companyKey === PLAYER_COMPANY_KEY)
      .sort((a, b) => a.quarter - b.quarter);

    const breakdown = computeFinalScoreBreakdown(history, config);
    return analyseStrategy(playerDecisions, history, breakdown, session.positioning, config);
  }
}

export function createGameService(repos: Repositories): GameService {
  return new GameService(repos);
}
