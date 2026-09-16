import type { CompanyKey } from '@/domain/simulation';
import type {
  AssignmentDoc,
  CourseDoc,
  CourseMemberDoc,
  FinalResultDoc,
  GameSessionDoc,
  GroupDoc,
  GroupGameDoc,
  GroupMemberDoc,
  GroupSubmissionDoc,
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

/**
 * Result of an attempt to spend one Golden Strategy use.
 *
 * `ALREADY_USED` is a SUCCESS: the quarter was already coached, so the answer
 * is handed back without spending anything.
 */
export type ClaimGoldenUseOutcome =
  | { status: 'CLAIMED'; used: number[] }
  | { status: 'ALREADY_USED'; used: number[] }
  | { status: 'LIMIT_REACHED'; used: number[] };

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

  /**
   * Records that the Golden Strategy was used for one quarter, within a limit.
   *
   * MUST be enforced by the datastore inside a transaction, exactly like
   * `createOfficialAttempt` and `saveQuarter`. Reading the list and then
   * writing it back in the service would let two requests arriving together
   * both see "one use left" and both spend it — on an official attempt that is
   * a student getting more coaching than the assignment allows, on a graded
   * run.
   *
   * Re-claiming a quarter that is already in the list spends nothing.
   */
  claimGoldenUse(
    sessionId: string,
    quarter: number,
    maxQuarters: number,
  ): Promise<ClaimGoldenUseOutcome>;

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

// --- group competition (Part 2) --------------------------------------------

/**
 * Result of a student trying to take a seat in a group.
 *
 * `ALREADY_IN_THIS_GROUP` is a SUCCESS — a second click, or a refresh, hands
 * back the seat they already hold rather than failing.
 */
export type ClaimSeatOutcome =
  | { status: 'CLAIMED'; member: GroupMemberDoc; group: GroupDoc }
  | { status: 'ALREADY_IN_THIS_GROUP'; member: GroupMemberDoc; group: GroupDoc }
  | { status: 'IN_ANOTHER_GROUP'; groupId: string }
  | { status: 'GROUP_FULL' }
  | { status: 'GROUP_CLOSED' };

/** Result of creating a group, which also claims its join code. */
export type CreateGroupOutcome =
  | { status: 'CREATED'; group: GroupDoc }
  | { status: 'CODE_TAKEN' };

export interface GroupRepository {
  get(groupId: string): Promise<GroupDoc | null>;
  getByJoinCode(joinCode: string): Promise<GroupDoc | null>;
  listByAssignment(assignmentId: string): Promise<GroupDoc[]>;
  update(groupId: string, patch: { name?: string }): Promise<void>;
  /** Soft delete. `at = null` restores. Never deletes a played match. */
  setArchived(groupId: string, at: number | null): Promise<void>;

  /**
   * Creates a group and claims its join code in one transaction.
   *
   * The code is the document id of a separate claim, so two groups cannot end
   * up sharing one — which would send a student into someone else's match.
   * Returns CODE_TAKEN rather than throwing, so the caller can retry with a
   * fresh code.
   */
  create(
    group: Omit<GroupDoc, 'id' | 'createdAt' | 'seats' | 'archivedAt'>,
  ): Promise<CreateGroupOutcome>;

  /** Replaces the join code, releasing the old one. */
  regenerateJoinCode(groupId: string, joinCode: string): Promise<CreateGroupOutcome>;

  /**
   * Takes the first free seat, in `ARENA_SEATS` order.
   *
   * MUST be enforced by the datastore inside a transaction, exactly like
   * `createOfficialAttempt` and `saveQuarter`. Six students clicking together
   * all read "seat 3 is free" and a read-then-write in the service would put
   * several of them in the same seat — which in a group match means several
   * students sharing one company and one grade.
   *
   * The same transaction claims `${assignmentId}_${uid}`, so one student cannot
   * hold seats in two groups of the same assignment.
   */
  claimSeat(input: {
    groupId: string;
    uid: string;
    companyName: string;
    productName: string;
    positioning: GroupMemberDoc['positioning'];
    displayName: string;
    email: string;
    studentCode: string | null;
  }): Promise<ClaimSeatOutcome>;

  /**
   * Frees a seat. The member row is kept with `leftAt` set, because a student
   * who played four quarters still has results in the match.
   */
  releaseSeat(groupId: string, uid: string): Promise<void>;

  listMembers(groupId: string): Promise<GroupMemberDoc[]>;
  getMember(groupId: string, uid: string): Promise<GroupMemberDoc | null>;
  /** The one group this student is in for this assignment, if any. */
  findMembership(assignmentId: string, uid: string): Promise<GroupMemberDoc | null>;
}

/** Result of a student submitting one quarter's decision. */
export type SubmitDecisionOutcome =
  | { status: 'SUBMITTED'; submission: GroupSubmissionDoc }
  | { status: 'ALREADY_SUBMITTED'; submission: GroupSubmissionDoc };

/** Result of recording a simulated quarter of a group match. */
export type SaveGroupQuarterOutcome =
  | { status: 'SAVED'; quarter: QuarterDoc; game: GroupGameDoc }
  | { status: 'ALREADY_EXISTS'; quarter: QuarterDoc; game: GroupGameDoc };

export interface GroupGameRepository {
  /**
   * Starts the match for a group. Keyed by `groupId`, so a second concurrent
   * start returns the existing match instead of creating a parallel one.
   */
  create(game: Omit<GroupGameDoc, 'id'>): Promise<GroupGameDoc>;
  get(groupId: string): Promise<GroupGameDoc | null>;
  listByAssignment(assignmentId: string): Promise<GroupGameDoc[]>;

  /**
   * Records one student's decision for one quarter.
   *
   * Idempotent by construction: the submission document is created inside a
   * transaction, and if it exists the stored decision is returned untouched.
   * A student cannot change a decision by submitting twice — which matters far
   * more here than in a solo game, because the others are waiting on it and
   * would otherwise be racing a moving target.
   */
  submitDecision(
    groupId: string,
    submission: Omit<GroupSubmissionDoc, 'submittedAt'>,
  ): Promise<SubmitDecisionOutcome>;

  listSubmissions(groupId: string, quarter: number): Promise<GroupSubmissionDoc[]>;

  getQuarter(groupId: string, quarter: number): Promise<QuarterDoc | null>;
  listQuarters(groupId: string): Promise<QuarterDoc[]>;

  /**
   * Atomically records a simulated quarter and advances the match.
   *
   * Same contract as `SessionRepository.saveQuarter`: if the quarter document
   * already exists the stored one is returned and nothing is recomputed. Here
   * that is what stops six students, all arriving at "everyone has submitted",
   * from each running the simulation and writing a different result.
   */
  saveQuarter(
    groupId: string,
    quarter: QuarterDoc,
    nextCompanies: GroupGameDoc['companies'],
  ): Promise<SaveGroupQuarterOutcome>;

  complete(groupId: string, completedAt: number): Promise<void>;
}

export interface Repositories {
  users: UserRepository;
  courses: CourseRepository;
  assignments: AssignmentRepository;
  sessions: SessionRepository;
  finalResults: FinalResultRepository;
  roleInvites: RoleInviteRepository;
  groups: GroupRepository;
  groupGames: GroupGameRepository;
}

/** Seat keys, re-exported so repository callers need not reach into the domain. */
export type SeatKey = CompanyKey;
