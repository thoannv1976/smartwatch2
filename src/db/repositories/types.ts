import type {
  AssignmentDoc,
  CourseDoc,
  CourseMemberDoc,
  FinalResultDoc,
  GameSessionDoc,
  LeaderboardSort,
  QuarterDoc,
  Role,
  UserDoc,
} from '../models';

/**
 * Repository interfaces.
 *
 * Every read and write of game data goes through one of these, which keeps the
 * storage engine swappable: the Firestore implementation runs in production and
 * an in-memory implementation backs the integration tests, so the whole
 * submit/score/leaderboard flow is testable without an emulator. Moving back to
 * PostgreSQL later would mean writing one more implementation and changing
 * nothing else.
 */

export interface UserRepository {
  get(uid: string): Promise<UserDoc | null>;
  getByEmail(email: string): Promise<UserDoc | null>;
  /** Creates the user on first sign-in, or refreshes profile fields. */
  upsert(user: Omit<UserDoc, 'createdAt' | 'lastSeenAt'>): Promise<UserDoc>;
  setRole(uid: string, role: Role): Promise<void>;
  list(limit?: number): Promise<UserDoc[]>;
}

export interface CourseRepository {
  get(courseId: string): Promise<CourseDoc | null>;
  create(course: Omit<CourseDoc, 'id' | 'createdAt'>): Promise<CourseDoc>;
  listByInstructor(instructorId: string): Promise<CourseDoc[]>;
  listAll(): Promise<CourseDoc[]>;

  addMember(member: Omit<CourseMemberDoc, 'joinedAt'>): Promise<CourseMemberDoc>;
  removeMember(courseId: string, uid: string): Promise<void>;
  listMembers(courseId: string): Promise<CourseMemberDoc[]>;
  getMember(courseId: string, uid: string): Promise<CourseMemberDoc | null>;
  /** Courses the given student belongs to. */
  listCoursesForStudent(uid: string): Promise<CourseDoc[]>;
}

export interface AssignmentRepository {
  get(assignmentId: string): Promise<AssignmentDoc | null>;
  create(assignment: Omit<AssignmentDoc, 'id' | 'createdAt'>): Promise<AssignmentDoc>;
  update(
    assignmentId: string,
    patch: Partial<Omit<AssignmentDoc, 'id' | 'courseId' | 'createdAt' | 'createdBy'>>,
  ): Promise<void>;
  listByCourse(courseId: string): Promise<AssignmentDoc[]>;
  listByCourses(courseIds: string[]): Promise<AssignmentDoc[]>;
}

/** Result of an attempt to record a simulated quarter. */
export type SaveQuarterOutcome =
  | { status: 'SAVED'; quarter: QuarterDoc; session: GameSessionDoc }
  | { status: 'ALREADY_EXISTS'; quarter: QuarterDoc; session: GameSessionDoc };

export interface SessionRepository {
  get(sessionId: string): Promise<GameSessionDoc | null>;
  create(session: Omit<GameSessionDoc, 'id'>): Promise<GameSessionDoc>;
  listByUser(userId: string, limit?: number): Promise<GameSessionDoc[]>;
  listByAssignment(assignmentId: string): Promise<GameSessionDoc[]>;
  countAttempts(userId: string, assignmentId: string): Promise<number>;

  getQuarter(sessionId: string, quarter: number): Promise<QuarterDoc | null>;
  listQuarters(sessionId: string): Promise<QuarterDoc[]>;

  /**
   * Atomically records a simulated quarter and advances the session.
   *
   * MUST be idempotent (spec 13.2): if the quarter document already exists the
   * stored result is returned and nothing is recomputed or overwritten. The
   * uniqueness is enforced by the datastore inside a transaction, never by a
   * client-side check.
   */
  saveQuarter(
    sessionId: string,
    quarter: QuarterDoc,
    nextCompanies: GameSessionDoc['companies'],
  ): Promise<SaveQuarterOutcome>;

  complete(sessionId: string, completedAt: number): Promise<void>;
}

export interface FinalResultRepository {
  get(sessionId: string): Promise<FinalResultDoc | null>;
  save(result: FinalResultDoc): Promise<void>;
  /** Official leaderboard for one assignment, best first. */
  listByAssignment(
    assignmentId: string,
    sort?: LeaderboardSort,
    limit?: number,
  ): Promise<FinalResultDoc[]>;
  listByUser(userId: string): Promise<FinalResultDoc[]>;
}

export interface Repositories {
  users: UserRepository;
  courses: CourseRepository;
  assignments: AssignmentRepository;
  sessions: SessionRepository;
  finalResults: FinalResultRepository;
}
