import 'server-only';
import {
  ARENA_SCENARIO_VERSION,
  ARENA_SEATS,
  computeGameFinalScores,
  createArenaCompanies,
  defaultDecisionFor,
  getGameConfig,
  isValidForecast,
  groupResultsByCompany,
  playArenaQuarter,
  validateDecision,
  type ArenaSeatAssignment,
  type CompanyKey,
  type CompanyState,
  type QuarterDecision,
  type QuarterForecast,
  type QuarterSimulationResult,
} from '@/domain/simulation';
import { assignmentMode, hasLeftGroup } from '@/db/models';
import type {
  AssignmentDoc,
  FinalResultDoc,
  GroupDoc,
  GroupGameDoc,
  GroupMemberDoc,
  QuarterDoc,
} from '@/db/models';
import type { Repositories } from '@/db/repositories/types';
import { generateJoinCode, isPlausibleJoinCode, normaliseJoinCode } from '@/lib/join-code';
import { GroupError } from './errors';

/**
 * Group competition: six students, one company each, one shared market.
 *
 * A DELIBERATELY SEPARATE SERVICE from `GameService`. The two modes share the
 * engine, the scoring and the coaching — all pure — but almost nothing else:
 * a solo session has attempts, a practice mode and a per-attempt deadline,
 * while a match has seats, a quarter that cannot run until everyone has
 * submitted, and an instructor who can force it through. Folding both into one
 * service would mean a class of `if (isGroup)` branches through the code path
 * that decides marks, which is the last place that belongs.
 *
 * WHAT IS SHARED, AND WHY THAT IS ENOUGH. A finished match writes one ordinary
 * `FinalResultDoc` per student, so the class leaderboard, the class percentile
 * and both CSV exports work on group results with no change at all.
 */

const MAX_CODE_ATTEMPTS = 8;

export interface JoinGroupInput {
  joinCode: string;
  uid: string;
  displayName: string;
  email: string;
  companyName: string;
  productName: string;
  positioning: GroupMemberDoc['positioning'];
}

/** What a student or instructor needs to see about a match in progress. */
export interface GroupState {
  group: GroupDoc;
  members: GroupMemberDoc[];
  game: GroupGameDoc | null;
  /** Quarter everyone is currently deciding, or null once the match is over. */
  currentQuarter: number | null;
  /** Seats that hold a student and have submitted for `currentQuarter`. */
  submittedSeats: CompanyKey[];
  /** Seats that hold a student and have NOT submitted. The blockers. */
  waitingOnSeats: CompanyKey[];
  /** Seats with no student, driven by the rule-based generator. */
  botSeats: CompanyKey[];
  started: boolean;
  completed: boolean;
}

/**
 * One submitted decision, as the instructor's live view sees it.
 *
 * Carries no `decision` — see `GroupService.listSubmissionStatus`.
 */
export interface SubmissionStatus {
  seatKey: CompanyKey;
  uid: string;
  submittedAt: number;
  /** True when the system filled this in because the instructor forced the quarter. */
  wasDefault: boolean;
}

export class GroupService {
  constructor(private readonly repos: Repositories) {}

  // -- setting up -----------------------------------------------------------

  /**
   * Creates empty groups for an assignment, each with its own join code.
   *
   * Codes are retried on collision rather than checked first: the datastore
   * owns uniqueness (see `groupJoinCodes`), so asking it and reacting is both
   * correct under concurrency and simpler than a read-then-write.
   */
  async createGroups(input: {
    assignmentId: string;
    count: number;
    createdBy: string;
    namePrefix: string;
  }): Promise<GroupDoc[]> {
    const assignment = await this.requireGroupAssignment(input.assignmentId);
    const existing = await this.repos.groups.listByAssignment(input.assignmentId);

    if (!Number.isInteger(input.count) || input.count < 1 || input.count > 50) {
      throw new GroupError('invalidInput');
    }

    const created: GroupDoc[] = [];
    for (let i = 0; i < input.count; i += 1) {
      created.push(
        await this.createOneGroup({
          assignmentId: assignment.id,
          courseId: assignment.courseId,
          createdBy: input.createdBy,
          name: `${input.namePrefix} ${existing.length + i + 1}`,
        }),
      );
    }
    return created;
  }

  private async createOneGroup(group: {
    assignmentId: string;
    courseId: string;
    createdBy: string;
    name: string;
  }): Promise<GroupDoc> {
    for (let attempt = 0; attempt < MAX_CODE_ATTEMPTS; attempt += 1) {
      const outcome = await this.repos.groups.create({
        ...group,
        joinCode: generateJoinCode(),
      });
      if (outcome.status === 'CREATED') return outcome.group;
    }
    // 21^6 codes and eight tries: reaching here means something is wrong with
    // the generator, not that the space is full.
    throw new GroupError('groupCodeUnavailable');
  }

  /** Issues a fresh code for a group, invalidating the old one. */
  async regenerateJoinCode(groupId: string): Promise<GroupDoc> {
    for (let attempt = 0; attempt < MAX_CODE_ATTEMPTS; attempt += 1) {
      const outcome = await this.repos.groups.regenerateJoinCode(groupId, generateJoinCode());
      if (outcome.status === 'CREATED') return outcome.group;
    }
    throw new GroupError('groupCodeUnavailable');
  }

  // -- joining --------------------------------------------------------------

  /**
   * Seats a student in the group whose code they typed.
   *
   * Every condition is re-checked here rather than trusted from the screen the
   * student was looking at: the assignment may have closed, the group may have
   * filled, and the match may have started since that page rendered.
   */
  async join(input: JoinGroupInput): Promise<{ group: GroupDoc; member: GroupMemberDoc }> {
    const code = normaliseJoinCode(input.joinCode);
    if (!isPlausibleJoinCode(code)) throw new GroupError('groupCodeInvalid');

    const group = await this.repos.groups.getByJoinCode(code);
    if (!group) throw new GroupError('groupCodeInvalid');

    const assignment = await this.requireGroupAssignment(group.assignmentId);
    this.assertWindowOpen(assignment);

    // Enrolment is checked against the COURSE, not the group: a code that
    // leaked outside the class must not be a way into it.
    const member = await this.repos.courses.getMember(assignment.courseId, input.uid);
    if (!member) throw new GroupError('notEnrolled');

    // Seats are frozen once the market has run, because the six companies were
    // built from the seat map at that moment. Joining afterwards would mean a
    // student holding a company that has already been played by a bot.
    const game = await this.repos.groupGames.get(group.id);
    if (game && game.currentRound > 0) throw new GroupError('groupAlreadyStarted');

    const companyName = input.companyName.trim();
    const productName = input.productName.trim();
    if (!companyName || !productName || companyName.length > 60 || productName.length > 60) {
      throw new GroupError('invalidCompanyName');
    }

    const outcome = await this.repos.groups.claimSeat({
      groupId: group.id,
      uid: input.uid,
      companyName,
      productName,
      positioning: input.positioning,
      displayName: input.displayName,
      email: input.email.toLowerCase(),
      studentCode: member.studentCode,
    });

    switch (outcome.status) {
      case 'CLAIMED':
      case 'ALREADY_IN_THIS_GROUP':
        return { group: outcome.group, member: outcome.member };
      case 'GROUP_FULL':
        throw new GroupError('groupFull');
      case 'GROUP_CLOSED':
        throw new GroupError('groupClosed');
      case 'IN_ANOTHER_GROUP':
        throw new GroupError('alreadyInAnotherGroup');
    }
  }

  /** Removes a student from their seat. Staff only — see the action layer. */
  async releaseSeat(groupId: string, uid: string): Promise<void> {
    await this.repos.groups.releaseSeat(groupId, uid);
  }

  // -- reading --------------------------------------------------------------

  async getGroup(groupId: string): Promise<GroupDoc> {
    const group = await this.repos.groups.get(groupId);
    if (!group) throw new GroupError('groupNotFound');
    return group;
  }

  /** The group this student is in for an assignment, or null. */
  async findMembership(assignmentId: string, uid: string): Promise<GroupMemberDoc | null> {
    const member = await this.repos.groups.findMembership(assignmentId, uid);
    return member && !hasLeftGroup(member) ? member : null;
  }

  /** This student's seat in a specific group, or null if they do not hold one. */
  async getMemberOf(groupId: string, uid: string): Promise<GroupMemberDoc | null> {
    const member = await this.repos.groups.getMember(groupId, uid);
    return member && !hasLeftGroup(member) ? member : null;
  }

  /**
   * Everything the waiting room shows, including WHO the match is waiting on.
   *
   * Naming the blockers is the whole mitigation for having no automatic
   * deadline: five students who can see they are waiting on one name will go
   * and find them, and the instructor can see the same thing across every
   * group at once.
   */
  async getState(groupId: string): Promise<GroupState> {
    const group = await this.getGroup(groupId);
    const [members, game] = await Promise.all([
      this.repos.groups.listMembers(groupId),
      this.repos.groupGames.get(groupId),
    ]);

    const config = getGameConfig(game?.scenarioVersion ?? ARENA_SCENARIO_VERSION);
    const round = game?.currentRound ?? 0;
    const completed = game?.status === 'COMPLETED' || round >= config.quarters;
    const currentQuarter = completed ? null : round + 1;

    const occupied = ARENA_SEATS.filter((seat) => group.seats[seat] != null);
    const botSeats = ARENA_SEATS.filter((seat) => group.seats[seat] == null);

    let submittedSeats: CompanyKey[] = [];
    if (currentQuarter !== null && game) {
      const submissions = await this.repos.groupGames.listSubmissions(groupId, currentQuarter);
      const seen = new Set(submissions.map((s) => s.seatKey));
      submittedSeats = occupied.filter((seat) => seen.has(seat));
    }

    return {
      group,
      members,
      game,
      currentQuarter,
      submittedSeats,
      // A finished match waits on nobody. Without this guard the filter below
      // reports every occupied seat as a blocker, because `submittedSeats` is
      // empty once there is no quarter left to submit for — which reads as
      // "all six are late" on exactly the screen an instructor grades from.
      waitingOnSeats:
        currentQuarter === null ? [] : occupied.filter((seat) => !submittedSeats.includes(seat)),
      botSeats,
      started: round > 0,
      completed,
    };
  }

  async listQuarters(groupId: string): Promise<QuarterDoc[]> {
    return this.repos.groupGames.listQuarters(groupId);
  }

  /**
   * Who has submitted for one quarter, and when — WITHOUT what they submitted.
   *
   * Feeds the instructor's live view of a quarter that has not run yet, and the
   * omission of `decision` is the whole point rather than an oversight. An
   * instructor watching a match in class usually has the screen projected; if
   * this carried allocations, the room would see the decisions of whoever
   * submitted first, and everyone still deciding would gain an advantage the
   * mode is built to deny them. Once the quarter HAS run, the exact allocations
   * of all six are staff-visible as before (spec 7.3) — on the played-quarter
   * tables, where nobody is still deciding.
   *
   * A projection rather than a filter at the call site: a caller cannot forget
   * to strip a field that was never handed to it. `tests/integration/
   * group-instructor-status.test.ts` asserts the shape.
   */
  async listSubmissionStatus(groupId: string, quarter: number): Promise<SubmissionStatus[]> {
    const submissions = await this.repos.groupGames.listSubmissions(groupId, quarter);
    return submissions
      .map((submission) => ({
        seatKey: submission.seatKey,
        uid: submission.uid,
        submittedAt: submission.submittedAt,
        wasDefault: submission.wasDefault,
      }))
      .sort((a, b) => ARENA_SEATS.indexOf(a.seatKey) - ARENA_SEATS.indexOf(b.seatKey));
  }

  // -- playing --------------------------------------------------------------

  /**
   * Records one student's decision, then runs the quarter if that was the last
   * one outstanding.
   *
   * Submitting and simulating are deliberately the same call. The alternative —
   * a separate "run" step — leaves a window where every decision is in and
   * nobody has pressed anything, which in practice means six students staring
   * at a waiting screen.
   */
  async submitDecision(input: {
    groupId: string;
    uid: string;
    quarter: number;
    decision: QuarterDecision;
    /**
     * The student's own prediction, recorded with their decision and never
     * shown to the other five — see `src/server/group/queries.ts`, which is the
     * boundary that decides what leaves the server.
     */
    forecast?: QuarterForecast | null;
  }): Promise<{ submitted: boolean; ran: boolean; state: GroupState }> {
    const group = await this.getGroup(input.groupId);
    const member = await this.repos.groups.getMember(group.id, input.uid);
    if (!member || hasLeftGroup(member)) throw new GroupError('notInThisGroup');

    const assignment = await this.requireGroupAssignment(group.assignmentId);
    this.assertWindowOpen(assignment);

    const game = await this.ensureGame(group, assignment);
    const config = getGameConfig(game.scenarioVersion);

    const quarter = game.currentRound + 1;
    if (quarter > config.quarters) throw new GroupError('gameAlreadyCompleted');
    // The quarter comes from the MATCH, never from the browser: letting the
    // client name one would let it submit for a quarter it has not reached.
    if (input.quarter !== quarter) throw new GroupError('quarterOutOfRange');

    const errors = validateDecision(input.decision, config);
    if (errors.length > 0) throw new GroupError(errors[0]!);

    // Dropped rather than rejected if malformed: five classmates are waiting on
    // this submission, and a bad prediction is no reason to hold them up.
    const forecast =
      input.forecast && isValidForecast(input.forecast, ARENA_SEATS.length)
        ? input.forecast
        : null;

    const outcome = await this.repos.groupGames.submitDecision(group.id, {
      quarter,
      seatKey: member.seatKey,
      uid: input.uid,
      decision: input.decision,
      wasDefault: false,
      forecast,
    });

    const ran = await this.advanceIfReady(group.id);
    return {
      submitted: outcome.status === 'SUBMITTED',
      ran,
      state: await this.getState(group.id),
    };
  }

  /**
   * Runs the quarter now, filling in for anyone who has not submitted.
   *
   * The escape hatch for a match stalled on one person. A decision supplied
   * this way repeats that student's own previous one rather than imposing an
   * even split — far less of an intervention — and is flagged `wasDefault` so
   * the instructor's report shows nobody was marked on a decision they did not
   * make without that being visible.
   */
  async forceQuarter(groupId: string): Promise<{ ran: boolean; filledSeats: CompanyKey[] }> {
    const state = await this.getState(groupId);
    if (state.completed || state.currentQuarter === null) {
      throw new GroupError('gameAlreadyCompleted');
    }

    const group = state.group;
    const assignment = await this.requireGroupAssignment(group.assignmentId);
    const game = await this.ensureGame(group, assignment);
    const quarter = game.currentRound + 1;

    const previous = quarter > 1 ? await this.repos.groupGames.getQuarter(groupId, quarter - 1) : null;

    const filledSeats: CompanyKey[] = [];
    for (const seatKey of state.waitingOnSeats) {
      const uid = group.seats[seatKey];
      if (!uid) continue;

      const outcome = await this.repos.groupGames.submitDecision(groupId, {
        quarter,
        seatKey,
        uid,
        decision: defaultDecisionFor(previous?.decisions[seatKey] ?? null),
        wasDefault: true,
      });
      // A student who submitted in the moment between reading the state and
      // writing here keeps their own decision — the claim is idempotent.
      if (outcome.status === 'SUBMITTED') filledSeats.push(seatKey);
    }

    return { ran: await this.advanceIfReady(groupId), filledSeats };
  }

  /**
   * Simulates the current quarter if every seated student has submitted.
   *
   * Safe to call from anywhere, and safe to call concurrently: `saveQuarter`
   * creates the quarter document inside a transaction, so six students all
   * arriving here together produce ONE simulation and five discarded copies.
   */
  async advanceIfReady(groupId: string): Promise<boolean> {
    const group = await this.getGroup(groupId);
    const game = await this.repos.groupGames.get(groupId);
    if (!game) return false;

    const config = getGameConfig(game.scenarioVersion);
    const quarter = game.currentRound + 1;
    if (quarter > config.quarters) return false;

    const occupied = ARENA_SEATS.filter((seat) => group.seats[seat] != null);
    const submissions = await this.repos.groupGames.listSubmissions(groupId, quarter);
    const submitted = new Set(submissions.map((s) => s.seatKey));
    if (!occupied.every((seat) => submitted.has(seat))) return false;

    const humanDecisions: Partial<Record<CompanyKey, QuarterDecision>> = {};
    for (const submission of submissions) humanDecisions[submission.seatKey] = submission.decision;

    const previousQuarters = await this.repos.groupGames.listQuarters(groupId);
    const played = playArenaQuarter(
      {
        quarter,
        states: game.companies,
        humanDecisions,
        previousQuarters: previousQuarters.map((q) => this.toSimulationResult(q, game)),
        seed: game.randomSeed,
      },
      config,
    );

    const quarterDoc: QuarterDoc = {
      quarter,
      eventKey: played.simulation.eventKey,
      marketUnits: played.simulation.marketUnits,
      weights: played.simulation.weights,
      decisions: played.decisions,
      results: played.simulation.companyResults,
      ranking: played.simulation.ranking,
      // Competitor intelligence is built PER VIEWER at read time, not stored:
      // in a group the five rivals are different for each of the six students,
      // and a stored list would be the same for everyone.
      intel: [],
      simulatedAt: Date.now(),
    };

    const outcome = await this.repos.groupGames.saveQuarter(
      groupId,
      quarterDoc,
      played.simulation.nextStates as CompanyState[],
    );

    // Lost the race against another request for the same quarter. The stored
    // result is authoritative; the work just done is discarded.
    if (outcome.status === 'ALREADY_EXISTS') return false;

    if (quarter >= config.quarters) await this.finalize(groupId);
    return true;
  }

  // -- finishing ------------------------------------------------------------

  /**
   * Marks the match complete and writes one graded row per student.
   *
   * Each row is an ordinary `FinalResultDoc`, which is what lets the class
   * leaderboard, the class percentile and both CSV exports treat group results
   * exactly like solo ones. `gameRank`, which `computeGameFinalScores` already
   * produces, IS the student's rank within their group.
   *
   * Idempotent: the scores are a pure function of the stored quarters, and the
   * documents are keyed by seat.
   */
  async finalize(groupId: string): Promise<void> {
    const group = await this.getGroup(groupId);
    const game = await this.repos.groupGames.get(groupId);
    if (!game) throw new GroupError('groupNotFound');

    const config = getGameConfig(game.scenarioVersion);
    const quarters = await this.repos.groupGames.listQuarters(groupId);
    if (quarters.length < config.quarters) throw new GroupError('quarterOutOfRange');

    const completedAt = game.completedAt ?? Date.now();
    if (game.status !== 'COMPLETED') await this.repos.groupGames.complete(groupId, completedAt);

    const scores = computeGameFinalScores(
      groupResultsByCompany(quarters.flatMap((q) => q.results)),
      config,
    );
    const members = await this.repos.groups.listMembers(groupId);

    for (const member of members) {
      const score = scores.find((s) => s.companyKey === member.seatKey);
      if (!score) continue;

      const result: FinalResultDoc = {
        // Synthetic but stable, and unique across the system because a group id
        // is. Keeps one document per student per match.
        sessionId: `${groupId}__${member.seatKey}`,
        userId: member.uid,
        assignmentId: group.assignmentId,
        mode: 'OFFICIAL',
        displayName: member.displayName,
        email: member.email,
        studentCode: member.studentCode,
        companyName: member.companyName,
        productName: member.productName,
        positioning: member.positioning,
        scenarioVersion: game.scenarioVersion,
        engineVersion: game.engineVersion,

        cumulativeRevenue: score.cumulativeRevenue,
        cumulativeProfit: score.cumulativeProfit,
        finalMarketShare: score.finalMarketShare,
        finalBrand: score.finalBrand,
        finalCsat: score.finalCsat,
        finalProductQuality: score.finalProductQuality,
        finalTechnology: score.finalTechnology,
        finalCash: score.finalCash,
        finalNetProfitMargin: score.finalNetProfitMargin,

        profitScore: score.profitScore,
        marketShareScore: score.marketShareScore,
        brandScore: score.brandScore,
        csatScore: score.csatScore,
        innovationScore: score.innovationScore,
        finalScore: score.finalScore,

        gameRank: score.gameRank,
        completedAt,
        groupId,
        groupName: group.name,
        seatKey: member.seatKey,
      };

      await this.repos.finalResults.save(result);
    }
  }

  // -- internals ------------------------------------------------------------

  /**
   * Starts the match if it has not started, from the seats as they stand.
   *
   * Lazy on purpose: groups are created empty and fill up over days, and the
   * six companies can only be built once it is known who is in which seat.
   * Keyed by group in the datastore, so two students submitting at the same
   * instant cannot create two matches.
   */
  private async ensureGame(group: GroupDoc, assignment: AssignmentDoc): Promise<GroupGameDoc> {
    const existing = await this.repos.groupGames.get(group.id);
    if (existing) return existing;

    const config = getGameConfig(ARENA_SCENARIO_VERSION);
    const members = await this.repos.groups.listMembers(group.id);
    const byUid = new Map(members.map((m) => [m.uid, m]));

    const seats: ArenaSeatAssignment[] = ARENA_SEATS.map((seatKey) => {
      const uid = group.seats[seatKey] ?? null;
      const member = uid ? byUid.get(uid) : undefined;
      return {
        seatKey,
        uid: member && !hasLeftGroup(member) ? member.uid : null,
        companyName: member?.companyName ?? '',
      };
    });

    return this.repos.groupGames.create({
      groupId: group.id,
      assignmentId: group.assignmentId,
      courseId: group.courseId,
      currentRound: 0,
      scenarioVersion: config.scenarioVersion,
      engineVersion: config.engineVersion,
      // Every group of an assignment shares the assignment's seed, so every
      // group faces the same events and the same demand jitter. That is what
      // makes scores comparable between groups rather than only within one.
      randomSeed: assignment.officialSeed,
      status: 'IN_PROGRESS',
      companies: createArenaCompanies(seats, config),
      startedAt: Date.now(),
      completedAt: null,
    });
  }

  private async requireGroupAssignment(assignmentId: string): Promise<AssignmentDoc> {
    const assignment = await this.repos.assignments.get(assignmentId);
    if (!assignment) throw new GroupError('assignmentNotFound');
    if (assignmentMode(assignment) !== 'GROUP') throw new GroupError('notGroupAssignment');
    return assignment;
  }

  private assertWindowOpen(assignment: AssignmentDoc): void {
    const now = Date.now();
    if (!assignment.isOpen || now < assignment.startAt) throw new GroupError('notOpenYet');
    if (now > assignment.deadline) throw new GroupError('deadlinePassed');
  }

  /**
   * Rebuilds the engine's view of a stored quarter, so a replayed history is
   * indistinguishable from one simulated in this process. Mirrors
   * `GameService.toSimulationResult`.
   */
  private toSimulationResult(quarterDoc: QuarterDoc, game: GroupGameDoc): QuarterSimulationResult {
    const byKey = new Map(game.companies.map((c) => [c.companyKey, c]));

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
      engineVersion: game.engineVersion,
      scenarioVersion: game.scenarioVersion,
    };
  }
}

export function createGroupService(repos: Repositories): GroupService {
  return new GroupService(repos);
}
