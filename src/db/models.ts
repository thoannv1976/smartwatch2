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

export interface UserDoc {
  uid: string;
  email: string;
  displayName: string;
  role: Role;
  createdAt: number;
  lastSeenAt: number;
}

export interface CourseDoc {
  id: string;
  courseName: string;
  semester: string;
  instructorId: string;
  createdAt: number;
}

export interface CourseMemberDoc {
  uid: string;
  courseId: string;
  studentCode: string;
  displayName: string;
  email: string;
  joinedAt: number;
}

export interface AssignmentDoc {
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
