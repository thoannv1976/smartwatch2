import type {
  CompanyKey,
  CompanyQuarterResult,
  CompanyState,
  CompetitorIntel,
  DemandWeights,
  MarketEventKey,
  Positioning,
  QuarterDecision,
} from '@/domain/simulation';

/**
 * Persisted document shapes (spec 10), mapped onto Firestore.
 *
 * Two deliberate denormalisations, both chosen so reading a quarter costs one
 * document read instead of twelve:
 *
 *  - `session_companies` is embedded in the session document as `companies[]`
 *  - the six `company_quarter_results` rows and the six `round_decisions` rows
 *    of a quarter live in ONE `quarters/{quarter}` document
 *
 * The second one also gives idempotency for free: the quarter document IS the
 * uniqueness constraint that spec 13.2 requires at the database level.
 *
 * Timestamps are stored as epoch milliseconds so a document round-trips through
 * JSON unchanged and repository implementations stay interchangeable.
 */

export type Role = 'STUDENT' | 'INSTRUCTOR' | 'ADMIN';

export const ROLES: readonly Role[] = ['STUDENT', 'INSTRUCTOR', 'ADMIN'] as const;

export type GameMode = 'PRACTICE' | 'OFFICIAL';
export type SessionStatus = 'IN_PROGRESS' | 'COMPLETED';

/**
 * Soft-delete marker, present on everything an administrator can remove.
 *
 * DELIBERATELY OPTIONAL. Documents written before this field existed simply do
 * not have it, and Firestore cannot distinguish "missing" from any value: an
 * equality query on the field skips those documents entirely, with no error.
 * Typing it as required would let `doc.archivedAt === null` compile while
 * evaluating false for every pre-existing row, quietly hiding the whole live
 * database. The optional type forces callers through `isArchived`.
 *
 * `gameSessions`, `quarters` and `finalResults` deliberately do NOT carry it.
 * A graded result is never hidden, never filtered and never deleted, so the
 * absence of this field on those three collections is the invariant that makes
 * "archiving cannot touch a grade" checkable by inspection.
 */
export interface Archivable {
  archivedAt?: number | null;
}

/** The one place the archived test is written. Tolerant of the missing field. */
export function isArchived(doc: Archivable): boolean {
  return typeof doc.archivedAt === 'number';
}

/** Keeps only the live rows of a list, leaving legacy documents visible. */
export function activeOnly<T extends Archivable>(docs: T[]): T[] {
  return docs.filter((doc) => !isArchived(doc));
}

export interface UserDoc extends Archivable {
  uid: string;
  email: string;
  displayName: string;
  role: Role;
  createdAt: number;
  lastSeenAt: number;
  /**
   * When an administrator last set this person's password, and who did it.
   *
   * An admin who can set a password can sign in as that person, including as
   * another admin. That power cannot be designed away while admins have it, so
   * it is at least recorded. The password itself is NEVER stored here.
   */
  passwordSetAt?: number | null;
  passwordSetBy?: string | null;
}

export interface CourseDoc extends Archivable {
  id: string;
  courseName: string;
  semester: string;
  instructorId: string;
  createdAt: number;
  /**
   * Whether the course appears in the list students can join themselves.
   * Also optional for the legacy reason above; absent means closed, so an
   * existing course cannot start accepting strangers because of a deploy.
   */
  enrollmentOpen?: boolean;
}

/**
 * A student on a course roster.
 *
 * `removedAt` rather than deletion: the instructor's participation view has to
 * keep naming someone who played and then left, or it would disagree with the
 * leaderboard, which reads graded results and never consults the roster.
 */
export interface CourseMemberDoc {
  uid: string;
  courseId: string;
  studentCode: string;
  displayName: string;
  email: string;
  joinedAt: number;
  removedAt?: number | null;
}

/** True for a roster row that has been removed from the course. */
export function isRemoved(member: CourseMemberDoc): boolean {
  return typeof member.removedAt === 'number';
}

/**
 * A role granted to an email address before that person has ever signed in.
 *
 * Stored under the lowercased email as the document id, so a duplicate invite
 * is impossible by construction rather than by a check.
 */
export interface RoleInviteDoc {
  email: string;
  role: Role;
  createdBy: string;
  createdAt: number;
  claimedAt: number | null;
  claimedUid: string | null;
}

export interface AssignmentDoc extends Archivable {
  id: string;
  courseId: string;
  title: string;
  startAt: number;
  deadline: number;
  maxAttempts: number;
  scenarioVersion: string;
  engineVersion: string;
  officialSeed: string;
  isOpen: boolean;
  createdBy: string;
  createdAt: number;

  /**
   * Solo play against rule-based benchmarks, or six students against each
   * other.
   *
   * OPTIONAL, for the reason spelled out on `Archivable`: every assignment
   * written before group mode existed has no such field, and Firestore cannot
   * tell "missing" from any value. Absent therefore means SOLO — read it
   * through `assignmentMode`, never directly.
   */
  mode?: 'SOLO' | 'GROUP';
  /** Seats per group. Absent means the full six. */
  groupSize?: number;
}

/** Mode of an assignment, tolerating documents written before group mode. */
export function assignmentMode(assignment: Pick<AssignmentDoc, 'mode'>): 'SOLO' | 'GROUP' {
  return assignment.mode === 'GROUP' ? 'GROUP' : 'SOLO';
}

/**
 * One of the six companies in a session, with its current capability state.
 *
 * This is exactly the engine's `CompanyState`: the stored shape and the shape
 * the engine consumes must not drift apart, or loading a session would need a
 * conversion that could silently lose a field.
 */
export type SessionCompany = CompanyState;

export interface GameSessionDoc {
  id: string;
  userId: string;
  assignmentId: string | null;
  mode: GameMode;
  attemptNo: number;
  companyName: string;
  productName: string;
  positioning: Positioning;
  /** Quarters already simulated. The next decision is for `currentRound + 1`. */
  currentRound: number;
  scenarioVersion: string;
  engineVersion: string;
  randomSeed: string;
  status: SessionStatus;
  companies: SessionCompany[];
  startedAt: number;
  completedAt: number | null;
  /**
   * Quarters in which the student asked for the Golden Strategy.
   *
   * A LIST of quarters, not a count, so that re-asking for a quarter already
   * coached is free: a double-click, a refresh or a back-button must not burn
   * one of a strictly limited set of uses. The cap is on how many DISTINCT
   * quarters were coached.
   *
   * Optional because sessions created before the coach existed do not have the
   * field at all, and Firestore drops `undefined` on write. Read it through
   * `goldenUsedQuarters(session)`, never directly.
   */
  goldenUsedQuarters?: number[];
}

/**
 * Golden Strategy uses of a session or of a graded row, tolerating documents
 * written before the coach existed.
 */
export function goldenUsedQuarters(doc: { goldenUsedQuarters?: number[] }): number[] {
  return doc.goldenUsedQuarters ?? [];
}

/**
 * One simulated quarter of one session: the decisions of all six companies, all
 * six result rows, the event context and the ranking. Creating this document is
 * what makes an official quarter submission idempotent.
 */
export interface QuarterDoc {
  quarter: number;
  eventKey: MarketEventKey;
  marketUnits: number;
  weights: DemandWeights;
  decisions: Record<string, QuarterDecision>;
  results: CompanyQuarterResult[];
  ranking: CompanyKey[];
  intel: CompetitorIntel[];
  simulatedAt: number;
}

/**
 * Denormalised leaderboard row, written once when a session completes.
 *
 * Carries the student identity so the leaderboard and the CSV export read one
 * collection, and carries scenario/engine version so entries are only ever
 * compared within the same assignment, scenario and engine (spec 13.3).
 */
export interface FinalResultDoc {
  sessionId: string;
  userId: string;
  assignmentId: string | null;
  mode: GameMode;
  displayName: string;
  email: string;
  studentCode: string | null;
  companyName: string;
  productName: string;
  positioning: Positioning;
  scenarioVersion: string;
  engineVersion: string;

  cumulativeRevenue: number;
  cumulativeProfit: number;
  finalMarketShare: number;
  finalBrand: number;
  finalCsat: number;
  finalProductQuality: number;
  finalTechnology: number;
  finalCash: number;
  finalNetProfitMargin: number;

  profitScore: number;
  marketShareScore: number;
  brandScore: number;
  csatScore: number;
  innovationScore: number;
  finalScore: number;

  /** Rank among the six companies of this session. */
  gameRank: number;
  completedAt: number;

  /**
   * Quarters in which this student used the Golden Strategy coach.
   *
   * Denormalised onto the graded row on purpose: the leaderboard and the CSV
   * export read this one collection, and an instructor comparing two scores has
   * to be able to see that one of them was coached without opening sessions one
   * by one. Optional, because rows written before the coach existed do not have
   * it — read it through `goldenUsedQuarters`.
   */
  goldenUsedQuarters?: number[];

  /**
   * Which group this result came from, for a group assignment.
   *
   * Denormalised onto the graded row on purpose, exactly like `studentCode`:
   * the class leaderboard and both CSV exports read this one collection, and an
   * instructor comparing two scores needs to see which match each was earned
   * in without opening groups one by one. Absent for every solo result.
   */
  groupId?: string;
  groupName?: string;
  /** The seat this student held. Absent for solo results, which are `player`. */
  seatKey?: CompanyKey;
}

/** Sortable columns of the class leaderboard and the instructor table. */
export type LeaderboardSort =
  | 'finalScore'
  | 'cumulativeProfit'
  | 'finalMarketShare'
  | 'finalCsat'
  | 'finalBrand';

export const LEADERBOARD_SORTS: readonly LeaderboardSort[] = [
  'finalScore',
  'cumulativeProfit',
  'finalMarketShare',
  'finalCsat',
  'finalBrand',
] as const;

// ---------------------------------------------------------------------------
// Group competition (Part 2)
// ---------------------------------------------------------------------------

/**
 * A competition group: up to six students, one company each, sharing one
 * market for six quarters.
 *
 * `seats` maps a seat key to the uid holding it, or null. Seats are handed out
 * in `ARENA_SEATS` order and an empty one is driven by the rule-based
 * generator, so the market always contains six companies however few students
 * turned up.
 */
export interface GroupDoc extends Archivable {
  id: string;
  assignmentId: string;
  courseId: string;
  name: string;
  /**
   * The code a student types to join. Unique across the whole system, which is
   * enforced by a document keyed on the code itself, never by a lookup.
   */
  joinCode: string;
  seats: Record<string, string | null>;
  createdBy: string;
  createdAt: number;
}

/**
 * One student holding one seat.
 *
 * `leftAt` rather than deletion, for the same reason `CourseMemberDoc` keeps
 * removed students: someone who played four quarters and was then pulled out
 * still has results in the match and a row in the gradebook, and a record that
 * vanishes would make those look like they came from nowhere.
 */
export interface GroupMemberDoc {
  uid: string;
  groupId: string;
  assignmentId: string;
  seatKey: CompanyKey;
  companyName: string;
  productName: string;
  positioning: Positioning;
  displayName: string;
  email: string;
  studentCode: string | null;
  joinedAt: number;
  leftAt?: number | null;
}

/** True for a member who has been released from their seat. */
export function hasLeftGroup(member: GroupMemberDoc): boolean {
  return typeof member.leftAt === 'number';
}

/**
 * The shared match one group plays.
 *
 * KEYED BY `groupId`. A group has exactly one match, so making the group id the
 * document id turns "one match per group" into a datastore constraint rather
 * than something a service has to check, and makes the lookup a single read
 * with no index.
 *
 * Structurally this is `GameSessionDoc` minus everything that is about one
 * person's attempt (userId, mode, attemptNo, positioning) — those live on the
 * member rows instead, because in a group each of the six has their own.
 */
export interface GroupGameDoc {
  /** Always equal to `groupId`. */
  id: string;
  groupId: string;
  assignmentId: string;
  courseId: string;
  /** Quarters already simulated. The next decision is for `currentRound + 1`. */
  currentRound: number;
  scenarioVersion: string;
  engineVersion: string;
  randomSeed: string;
  status: SessionStatus;
  companies: SessionCompany[];
  startedAt: number;
  completedAt: number | null;
}

/**
 * One student's decision for one quarter, held until all six are in.
 *
 * A quarter cannot run before every seat has a decision, so these accumulate
 * and are then handed to the engine together. Creating the document is what
 * makes submitting idempotent — the same rule `saveQuarter` already relies on.
 */
export interface GroupSubmissionDoc {
  quarter: number;
  seatKey: CompanyKey;
  uid: string;
  decision: QuarterDecision;
  submittedAt: number;
  /**
   * True when the system supplied this on the student's behalf, because the
   * instructor forced the quarter through before they submitted.
   *
   * Surfaced in the instructor's report and the CSV export: nobody should be
   * marked on a decision they did not make without that being visible.
   */
  wasDefault: boolean;
}
