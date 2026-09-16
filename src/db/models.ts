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
