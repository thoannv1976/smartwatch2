import 'server-only';
import {
  PLAYER_COMPANY_KEY,
  SCENARIO_VERSION,
  analyseStrategy,
  computeFinalScoreBreakdown,
  computeGameFinalScores,
  createInitialCompanies,
  getGameConfig,
  groupResultsByCompany,
  playQuarter,
  validateDecision,
  type CompanyFinalScore,
  type CompanyQuarterResult,
  type Positioning,
  type QuarterDecision,
  type QuarterSimulationResult,
  type StrategyAnalysis,
} from '@/domain/simulation';
import type {
  AssignmentDoc,
  FinalResultDoc,
  GameMode,
  GameSessionDoc,
  QuarterDoc,
  SessionCompany,
} from '@/db/models';
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

    return this.repos.sessions.create({
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
      status: 'IN_PROGRESS',
      companies,
      startedAt: Date.now(),
      completedAt: null,
    });
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

  /** Loads a session and checks it belongs to the caller. */
  async getOwnedSession(sessionId: string, userId: string): Promise<GameSessionDoc> {
    const session = await this.repos.sessions.get(sessionId);
    if (!session) throw new GameError('sessionNotFound');
    if (session.userId !== userId) throw new GameError('notYourSession');
    return session;
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
  ): Promise<{ quarter: QuarterDoc; session: GameSessionDoc; replayed: boolean }> {
    const session = await this.getOwnedSession(sessionId, userId);
    const config = getGameConfig(session.scenarioVersion);

    if (!Number.isInteger(quarter) || quarter < 1 || quarter > config.quarters) {
      throw new GameError('quarterOutOfRange');
    }

    // A quarter already on record wins immediately: no revalidation, no
    // recomputation, no write.
    const existing = await this.repos.sessions.getQuarter(sessionId, quarter);
    if (existing) return { quarter: existing, session, replayed: true };

    if (session.status === 'COMPLETED') throw new GameError('gameAlreadyCompleted');
    if (quarter !== session.currentRound + 1) throw new GameError('quarterOutOfRange');

    const errors = validateDecision(decision, config);
    if (errors.length > 0) throw new GameError(errors[0]!);

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
    const session = await this.getOwnedSession(sessionId, userId);
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
