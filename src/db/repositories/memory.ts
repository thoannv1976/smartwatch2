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
import { activeOnly, isRemoved } from '../models';
import type {
  AssignmentRepository,
  CourseRepository,
  FinalResultRepository,
  Repositories,
  RoleInviteRepository,
  SaveQuarterOutcome,
  SessionRepository,
  UserRepository,
} from './types';

/**
 * In-memory repositories with the same semantics as the Firestore ones.
 *
 * They exist so the whole submit / score / leaderboard flow — including the
 * idempotency guarantee — is covered by tests that run anywhere, with no
 * emulator, no credentials and no network. Documents are deep-cloned on the way
 * in and out, which reproduces the most important property of a real datastore:
 * a caller cannot mutate stored state by holding on to a returned object.
 */

function clone<T>(value: T): T {
  return structuredClone(value);
}

class MemoryUserRepository implements UserRepository {
  private readonly users = new Map<string, UserDoc>();

  async get(uid: string): Promise<UserDoc | null> {
    const user = this.users.get(uid);
    return user ? clone(user) : null;
  }

  async getByEmail(email: string): Promise<UserDoc | null> {
    const needle = email.toLowerCase();
    for (const user of this.users.values()) {
      if (user.email === needle) return clone(user);
    }
    return null;
  }

  async upsert(user: Omit<UserDoc, 'createdAt' | 'lastSeenAt'>): Promise<UserDoc> {
    const now = Date.now();
    const existing = this.users.get(user.uid);
    const merged: UserDoc = existing
      ? {
          ...existing,
          email: user.email.toLowerCase(),
          displayName: user.displayName || existing.displayName,
          lastSeenAt: now,
        }
      : { ...user, email: user.email.toLowerCase(), createdAt: now, lastSeenAt: now };
    this.users.set(user.uid, merged);
    return clone(merged);
  }

  async setRole(uid: string, role: Role): Promise<void> {
    const user = this.users.get(uid);
    if (!user) throw new Error(`User ${uid} not found`);
    this.users.set(uid, { ...user, role });
  }

  async recordPasswordSet(uid: string, at: number, by: string): Promise<void> {
    const user = this.users.get(uid);
    if (!user) throw new Error(`User ${uid} not found`);
    this.users.set(uid, { ...user, passwordSetAt: at, passwordSetBy: by });
  }

  async setArchived(uid: string, at: number | null): Promise<void> {
    const user = this.users.get(uid);
    if (!user) throw new Error(`User ${uid} not found`);
    this.users.set(uid, { ...user, archivedAt: at });
  }

  async list(limit = 200): Promise<UserDoc[]> {
    return [...this.users.values()]
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, limit)
      .map(clone);
  }
}

class MemoryCourseRepository implements CourseRepository {
  private readonly courses = new Map<string, CourseDoc>();
  private readonly members = new Map<string, Map<string, CourseMemberDoc>>();
  /** courseId -> studentCode -> uid. Mirrors the Firestore claim subcollection. */
  private readonly codeClaims = new Map<string, Map<string, string>>();
  private nextId = 1;

  async get(courseId: string): Promise<CourseDoc | null> {
    const course = this.courses.get(courseId);
    return course ? clone(course) : null;
  }

  async create(course: Omit<CourseDoc, 'id' | 'createdAt'>): Promise<CourseDoc> {
    const doc: CourseDoc = {
      ...course,
      id: `course-${this.nextId++}`,
      createdAt: Date.now(),
      enrollmentOpen: course.enrollmentOpen ?? false,
      archivedAt: null,
    };
    this.courses.set(doc.id, doc);
    return clone(doc);
  }

  async update(
    courseId: string,
    patch: Partial<Pick<CourseDoc, 'courseName' | 'semester' | 'enrollmentOpen' | 'instructorId'>>,
  ): Promise<void> {
    const existing = this.courses.get(courseId);
    if (!existing) throw new Error(`Course ${courseId} not found`);
    this.courses.set(courseId, { ...existing, ...patch });
  }

  async setArchived(courseId: string, at: number | null): Promise<void> {
    const existing = this.courses.get(courseId);
    if (!existing) throw new Error(`Course ${courseId} not found`);
    this.courses.set(courseId, { ...existing, archivedAt: at });
  }

  async listOpenForEnrollment(): Promise<CourseDoc[]> {
    return activeOnly([...this.courses.values()].filter((c) => c.enrollmentOpen === true))
      .sort((a, b) => a.courseName.localeCompare(b.courseName))
      .map(clone);
  }

  async selfEnroll(
    member: Omit<CourseMemberDoc, 'joinedAt' | 'removedAt'>,
  ): Promise<
    { status: 'JOINED'; member: CourseMemberDoc } | { status: 'ALREADY_MEMBER' | 'CODE_TAKEN' }
  > {
    // No await anywhere between the checks and the writes. The Firestore
    // version gets this from a transaction; here it comes from staying
    // synchronous, and losing that is how a concurrency test passes while
    // production races — the mistake already made once with attempt claims.
    const bucket = this.members.get(member.courseId) ?? new Map<string, CourseMemberDoc>();
    const claims = this.codeClaims.get(member.courseId) ?? new Map<string, string>();

    const existing = bucket.get(member.uid);
    if (existing) {
      if (!isRemoved(existing)) return { status: 'ALREADY_MEMBER' };
      // Rejoining keeps the original code — it may already be in a graded row.
      const restored: CourseMemberDoc = { ...existing, removedAt: null };
      bucket.set(member.uid, restored);
      this.members.set(member.courseId, bucket);
      return { status: 'JOINED', member: clone(restored) };
    }

    const owner = claims.get(member.studentCode);
    if (owner !== undefined && owner !== member.uid) return { status: 'CODE_TAKEN' };

    const doc: CourseMemberDoc = { ...member, joinedAt: Date.now(), removedAt: null };
    bucket.set(member.uid, doc);
    claims.set(member.studentCode, member.uid);
    this.members.set(member.courseId, bucket);
    this.codeClaims.set(member.courseId, claims);
    return { status: 'JOINED', member: clone(doc) };
  }

  async updateMember(
    courseId: string,
    uid: string,
    patch: { studentCode: string },
  ): Promise<{ ok: true } | { ok: false; reason: 'CODE_TAKEN' | 'NOT_A_MEMBER' }> {
    const bucket = this.members.get(courseId);
    const member = bucket?.get(uid);
    if (!bucket || !member) return { ok: false, reason: 'NOT_A_MEMBER' };
    if (member.studentCode === patch.studentCode) return { ok: true };

    const claims = this.codeClaims.get(courseId) ?? new Map<string, string>();
    const owner = claims.get(patch.studentCode);
    if (owner !== undefined && owner !== uid) return { ok: false, reason: 'CODE_TAKEN' };

    claims.delete(member.studentCode);
    claims.set(patch.studentCode, uid);
    bucket.set(uid, { ...member, studentCode: patch.studentCode });
    this.codeClaims.set(courseId, claims);
    return { ok: true };
  }

  async setMemberRemoved(courseId: string, uid: string, at: number | null): Promise<void> {
    const member = this.members.get(courseId)?.get(uid);
    if (!member) throw new Error(`Member ${uid} not found in ${courseId}`);
    this.members.get(courseId)!.set(uid, { ...member, removedAt: at });
  }

  async listByInstructor(instructorId: string): Promise<CourseDoc[]> {
    return [...this.courses.values()]
      .filter((c) => c.instructorId === instructorId)
      .sort((a, b) => b.createdAt - a.createdAt)
      .map(clone);
  }

  async listAll(): Promise<CourseDoc[]> {
    return [...this.courses.values()].sort((a, b) => b.createdAt - a.createdAt).map(clone);
  }

  async addMember(member: Omit<CourseMemberDoc, 'joinedAt'>): Promise<CourseMemberDoc> {
    const doc: CourseMemberDoc = { ...member, joinedAt: Date.now() };
    const bucket = this.members.get(member.courseId) ?? new Map<string, CourseMemberDoc>();
    bucket.set(member.uid, doc);
    this.members.set(member.courseId, bucket);
    return clone(doc);
  }

  async removeMember(courseId: string, uid: string): Promise<void> {
    this.members.get(courseId)?.delete(uid);
  }

  async listMembers(courseId: string): Promise<CourseMemberDoc[]> {
    return [...(this.members.get(courseId)?.values() ?? [])]
      .sort((a, b) => a.studentCode.localeCompare(b.studentCode))
      .map(clone);
  }

  async getMember(courseId: string, uid: string): Promise<CourseMemberDoc | null> {
    const member = this.members.get(courseId)?.get(uid);
    return member ? clone(member) : null;
  }

  async listCoursesForStudent(uid: string): Promise<CourseDoc[]> {
    // Ordered by the member's joinedAt, matching the Firestore implementation's
    // orderBy — so the two behave identically and tests reflect production.
    const memberships: { courseId: string; joinedAt: number }[] = [];
    for (const [courseId, bucket] of this.members) {
      const member = bucket.get(uid);
      if (member) memberships.push({ courseId, joinedAt: member.joinedAt });
    }
    return memberships
      .sort((a, b) => a.joinedAt - b.joinedAt)
      .map((m) => this.courses.get(m.courseId))
      .filter((c): c is CourseDoc => c !== undefined)
      .map(clone);
  }
}

class MemoryAssignmentRepository implements AssignmentRepository {
  private readonly assignments = new Map<string, AssignmentDoc>();
  private nextId = 1;

  async get(assignmentId: string): Promise<AssignmentDoc | null> {
    const doc = this.assignments.get(assignmentId);
    return doc ? clone(doc) : null;
  }

  async setArchived(assignmentId: string, at: number | null): Promise<void> {
    const existing = this.assignments.get(assignmentId);
    if (!existing) throw new Error(`Assignment ${assignmentId} not found`);
    this.assignments.set(assignmentId, { ...existing, archivedAt: at });
  }

  async create(assignment: Omit<AssignmentDoc, 'id' | 'createdAt'>): Promise<AssignmentDoc> {
    const doc: AssignmentDoc = {
      ...assignment,
      id: `assignment-${this.nextId++}`,
      createdAt: Date.now(),
      archivedAt: null,
    };
    this.assignments.set(doc.id, doc);
    return clone(doc);
  }

  async update(
    assignmentId: string,
    patch: Partial<Omit<AssignmentDoc, 'id' | 'courseId' | 'createdAt' | 'createdBy'>>,
  ): Promise<void> {
    const existing = this.assignments.get(assignmentId);
    if (!existing) throw new Error(`Assignment ${assignmentId} not found`);
    this.assignments.set(assignmentId, { ...existing, ...patch });
  }

  async listByCourse(courseId: string): Promise<AssignmentDoc[]> {
    return [...this.assignments.values()]
      .filter((a) => a.courseId === courseId)
      .sort((a, b) => b.createdAt - a.createdAt)
      .map(clone);
  }

  async listByCourses(courseIds: string[]): Promise<AssignmentDoc[]> {
    const set = new Set(courseIds);
    return [...this.assignments.values()]
      .filter((a) => set.has(a.courseId))
      .sort((a, b) => b.createdAt - a.createdAt)
      .map(clone);
  }
}

class MemorySessionRepository implements SessionRepository {
  private readonly sessions = new Map<string, GameSessionDoc>();
  private readonly quarters = new Map<string, Map<number, QuarterDoc>>();
  private readonly attemptClaims = new Set<string>();
  private nextId = 1;

  async get(sessionId: string): Promise<GameSessionDoc | null> {
    const session = this.sessions.get(sessionId);
    return session ? clone(session) : null;
  }

  async create(session: Omit<GameSessionDoc, 'id'>): Promise<GameSessionDoc> {
    const doc: GameSessionDoc = { ...session, id: `session-${this.nextId++}` };
    this.sessions.set(doc.id, clone(doc));
    return clone(doc);
  }

  async createOfficialAttempt(
    session: Omit<GameSessionDoc, 'id'>,
    assignmentId: string,
    attemptNo: number,
  ): Promise<GameSessionDoc | null> {
    // Same contract as Firestore: the claim is what makes the attempt unique,
    // and a second claim on the same attempt number is refused rather than
    // silently creating a second session.
    const claim = `${assignmentId}_${session.userId}_${attemptNo}`;

    // Claim first, with no await between the test and the insert. Awaiting in
    // between would let a second caller run in the gap and claim the same
    // attempt, which is the very race this method exists to prevent — the
    // in-memory store has to be as atomic here as the Firestore transaction is,
    // or tests would pass on a guarantee production does not share.
    if (this.attemptClaims.has(claim)) return null;
    this.attemptClaims.add(claim);

    try {
      return await this.create(session);
    } catch (error) {
      this.attemptClaims.delete(claim);
      throw error;
    }
  }

  async listByUser(userId: string, limit = 50): Promise<GameSessionDoc[]> {
    return [...this.sessions.values()]
      .filter((s) => s.userId === userId)
      .sort((a, b) => b.startedAt - a.startedAt)
      .slice(0, limit)
      .map(clone);
  }

  async listByAssignment(assignmentId: string): Promise<GameSessionDoc[]> {
    return [...this.sessions.values()]
      .filter((s) => s.assignmentId === assignmentId)
      .sort((a, b) => b.startedAt - a.startedAt)
      .map(clone);
  }

  async countAttempts(userId: string, assignmentId: string): Promise<number> {
    return [...this.sessions.values()].filter(
      (s) => s.userId === userId && s.assignmentId === assignmentId,
    ).length;
  }

  async getQuarter(sessionId: string, quarter: number): Promise<QuarterDoc | null> {
    const doc = this.quarters.get(sessionId)?.get(quarter);
    return doc ? clone(doc) : null;
  }

  async listQuarters(sessionId: string): Promise<QuarterDoc[]> {
    return [...(this.quarters.get(sessionId)?.values() ?? [])]
      .sort((a, b) => a.quarter - b.quarter)
      .map(clone);
  }

  async saveQuarter(
    sessionId: string,
    quarter: QuarterDoc,
    nextCompanies: GameSessionDoc['companies'],
  ): Promise<SaveQuarterOutcome> {
    const session = this.sessions.get(sessionId);
    if (!session) throw new Error(`Session ${sessionId} not found`);

    const bucket = this.quarters.get(sessionId) ?? new Map<number, QuarterDoc>();
    const existing = bucket.get(quarter.quarter);
    if (existing) {
      // Same contract as the Firestore transaction: never recompute, never
      // overwrite, just hand back what was stored.
      return { status: 'ALREADY_EXISTS', quarter: clone(existing), session: clone(session) };
    }

    bucket.set(quarter.quarter, clone(quarter));
    this.quarters.set(sessionId, bucket);

    const updated: GameSessionDoc = {
      ...session,
      companies: clone(nextCompanies),
      currentRound: Math.max(session.currentRound, quarter.quarter),
    };
    this.sessions.set(sessionId, updated);

    return { status: 'SAVED', quarter: clone(quarter), session: clone(updated) };
  }

  async complete(sessionId: string, completedAt: number): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) throw new Error(`Session ${sessionId} not found`);
    this.sessions.set(sessionId, { ...session, status: 'COMPLETED', completedAt });
  }
}

class MemoryFinalResultRepository implements FinalResultRepository {
  private readonly results = new Map<string, FinalResultDoc>();

  async get(sessionId: string): Promise<FinalResultDoc | null> {
    const doc = this.results.get(sessionId);
    return doc ? clone(doc) : null;
  }

  async save(result: FinalResultDoc): Promise<void> {
    this.results.set(result.sessionId, clone(result));
  }

  async listByAssignment(
    assignmentId: string,
    sort: LeaderboardSort = 'finalScore',
    limit = 500,
  ): Promise<FinalResultDoc[]> {
    return [...this.results.values()]
      .filter((r) => r.assignmentId === assignmentId)
      .sort((a, b) => b[sort] - a[sort])
      .slice(0, limit)
      .map(clone);
  }

  async listByUser(userId: string): Promise<FinalResultDoc[]> {
    return [...this.results.values()]
      .filter((r) => r.userId === userId)
      .sort((a, b) => b.completedAt - a.completedAt)
      .map(clone);
  }
}

class MemoryRoleInviteRepository implements RoleInviteRepository {
  private readonly invites = new Map<string, RoleInviteDoc>();

  private key(email: string): string {
    return email.trim().toLowerCase();
  }

  async get(email: string): Promise<RoleInviteDoc | null> {
    const invite = this.invites.get(this.key(email));
    return invite ? clone(invite) : null;
  }

  async list(limit = 200): Promise<RoleInviteDoc[]> {
    return [...this.invites.values()]
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, limit)
      .map(clone);
  }

  async put(invite: Omit<RoleInviteDoc, 'claimedAt' | 'claimedUid'>): Promise<void> {
    const doc: RoleInviteDoc = {
      ...invite,
      email: this.key(invite.email),
      claimedAt: null,
      claimedUid: null,
    };
    this.invites.set(doc.email, doc);
  }

  async remove(email: string): Promise<void> {
    this.invites.delete(this.key(email));
  }

  async claim(email: string, uid: string): Promise<Role | null> {
    // Synchronous check-and-mark, matching the Firestore transaction: two
    // sign-ins arriving together must not both be granted the same invite.
    const key = this.key(email);
    const invite = this.invites.get(key);
    if (!invite || invite.claimedAt !== null) return null;

    this.invites.set(key, { ...invite, claimedAt: Date.now(), claimedUid: uid });
    return invite.role;
  }
}

/** A fresh, isolated repository set. One per test. */
export function createMemoryRepositories(): Repositories {
  return {
    users: new MemoryUserRepository(),
    courses: new MemoryCourseRepository(),
    assignments: new MemoryAssignmentRepository(),
    sessions: new MemorySessionRepository(),
    finalResults: new MemoryFinalResultRepository(),
    roleInvites: new MemoryRoleInviteRepository(),
  };
}
