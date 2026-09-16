import type {
  AssignmentDoc,
  CourseDoc,
  CourseMemberDoc,
  FinalResultDoc,
  GameSessionDoc,
  LeaderboardSort,
  QuarterDoc,
  Role,
  RoleInviteDoc,
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
  /** Soft delete. `at = null` restores. Never blocks an in-progress game. */
  setArchived(uid: string, at: number | null): Promise<void>;

  get(uid: string): Promise<UserDoc | null>;
  getByEmail(email: string): Promise<UserDoc | null>;
  /** Creates the user on first sign-in, or refreshes profile fields. */
  upsert(user: Omit<UserDoc, 'createdAt' | 'lastSeenAt'>): Promise<UserDoc>;
  setRole(uid: string, role: Role): Promise<void>;
  /** Notes that an administrator set this account's password. Never the password. */
  recordPasswordSet(uid: string, at: number, by: string): Promise<void>;
  list(limit?: number): Promise<UserDoc[]>;
}

export interface CourseRepository {
  /** Patches a course's editable fields. Never touches instructorId silently. */
  update(
    courseId: string,
    patch: Partial<Pick<CourseDoc, 'courseName' | 'semester' | 'enrollmentOpen' | 'instructorId'>>,
  ): Promise<void>;

  /** Soft delete. `at = null` restores. Grades are untouched either way. */
  setArchived(courseId: string, at: number | null): Promise<void>;

  /**
   * Courses a student may join themselves.
   *
   * Filtered ONLY on `enrollmentOpen` in the datastore, with the archived test
   * applied in memory afterwards. Adding `where('archivedAt','==',null)` would
   * drop every course written before that field existed — Firestore skips
   * documents that lack the field, silently and without an error.
   */
  listOpenForEnrollment(): Promise<CourseDoc[]>;

  /**
   * Adds a member for a student enrolling themselves.
   *
   * Distinct from `addMember`, which does a whole-document `set` and would let
   * a second enrolment overwrite `joinedAt`, the instructor's corrected
   * `studentCode`, and the removal marker. Returns null when the student is
   * already on the roster or the student code is taken in this course; both
   * are refused by the datastore rather than by a read-then-write check.
   */
  selfEnroll(
    member: Omit<CourseMemberDoc, 'joinedAt' | 'removedAt'>,
  ): Promise<{ status: 'JOINED'; member: CourseMemberDoc } | { status: 'ALREADY_MEMBER' | 'CODE_TAKEN' }>;

  /**
   * Corrects a roster row — the instructor fixing a code a student typed.
   *
   * Refuses rather than throwing when the new code belongs to somebody else in
   * this course, because a duplicate code silently breaks the join between the
   * CSV gradebook and the university's own records.
   */
  updateMember(
    courseId: string,
    uid: string,
    patch: { studentCode: string },
  ): Promise<{ ok: true } | { ok: false; reason: 'CODE_TAKEN' | 'NOT_A_MEMBER' }>;

  /** Marks a roster row removed, or restores it. The document is kept. */
  setMemberRemoved(courseId: string, uid: string, at: number | null): Promise<void>;

  get(courseId: string): Promise<CourseDoc | null>;
  create(course: Omit<CourseDoc, 'id' | 'createdAt'>): Promise<CourseDoc>;
  listByInstructor(instructorId: string): Promise<CourseDoc[]>;
  listAll(): Promise<CourseDoc[]>;

  addMember(member: Omit<CourseMemberDoc, 'joinedAt'>): Promise<CourseMemberDoc>;
  /** Hard delete of a roster row. Prefer `setMemberRemoved`, which keeps history. */
  removeMember(courseId: string, uid: string): Promise<void>;

  /**
   * EVERY roster row, removed ones included. Callers filter.
   *
   * Deliberately not filtered here. The instructor's participation view is
   * built from this list, and a student who played the assignment and was then
   * removed has to keep appearing there — otherwise that screen disagrees with
   * the leaderboard, which reads graded results and never consults the roster,
   * and the person who silently vanishes is one who already has a grade.
   */
  listMembers(courseId: string): Promise<CourseMemberDoc[]>;

  /**
   * ARCHIVE-BLIND ON PURPOSE. Never return null for a removed member.
   *
   * This read feeds three things that must not change when someone is removed:
   * the enrolment check while a game is in progress, the student's access to a
   * leaderboard they are already on, and the studentCode snapshotted into the
   * graded row at finalize. Hiding a removed member here would strand a
   * mid-game student and write a null student code into the gradebook.
   */
  getMember(courseId: string, uid: string): Promise<CourseMemberDoc | null>;

  /** Courses the student belongs to, archived ones included. Callers filter. */
  listCoursesForStudent(uid: string): Promise<CourseDoc[]>;
}

export interface AssignmentRepository {
  /** Soft delete. `at = null` restores. */
  setArchived(assignmentId: string, at: number | null): Promise<void>;

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

  /**
   * Creates an official session, claiming one specific attempt number.
   *
   * Returns null when that attempt has already been claimed. Counting existing
   * attempts and then creating a session is two operations, so two clicks
   * arriving together both see "0 used" and both create a session — the
   * student gets more attempts than the assignment allows and shows up twice
   * on the leaderboard and in the CSV. The claim MUST therefore be enforced by
   * the datastore, the same way `saveQuarter` enforces quarter uniqueness, and
   * never by a read-then-write in the service.
   */
  createOfficialAttempt(
    session: Omit<GameSessionDoc, 'id'>,
    assignmentId: string,
    attemptNo: number,
  ): Promise<GameSessionDoc | null>;

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

/**
 * Roles granted to an email address before that person first signs in.
 *
 * Addressed only by document id, so it needs no index.
 */
export interface RoleInviteRepository {
  get(email: string): Promise<RoleInviteDoc | null>;
  list(limit?: number): Promise<RoleInviteDoc[]>;
  put(invite: Omit<RoleInviteDoc, 'claimedAt' | 'claimedUid'>): Promise<void>;
  remove(email: string): Promise<void>;

  /**
   * Marks an invite used and returns the role it granted, or null if there is
   * no unclaimed invite. Claiming and reading are one operation so a second
   * concurrent sign-in cannot be granted the same invite twice.
   */
  claim(email: string, uid: string): Promise<Role | null>;
}

export interface Repositories {
  users: UserRepository;
  courses: CourseRepository;
  assignments: AssignmentRepository;
  sessions: SessionRepository;
  finalResults: FinalResultRepository;
  roleInvites: RoleInviteRepository;
}
