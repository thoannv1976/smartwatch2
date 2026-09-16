import 'server-only';
import type { Firestore, Query } from 'firebase-admin/firestore';
import { getDb } from '../firestore';
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
  ClaimGoldenUseOutcome,
  SaveQuarterOutcome,
  SessionRepository,
  UserRepository,
} from './types';

/**
 * Firestore implementations of the repositories.
 *
 * All game data is read and written here, on the server, with the Admin SDK.
 * The security rules deny the client SDK everything (see firestore.rules), so
 * "the browser only sends decisions, the server calculates everything" (spec
 * 13.1) is enforced by the datastore itself and not merely by convention.
 *
 * ---------------------------------------------------------------------------
 * INDEX REQUIREMENTS — read this before changing any query in this file.
 *
 * The Firestore EMULATOR DOES NOT ENFORCE INDEXES. A query that needs one the
 * project does not have passes every local test and then fails in production
 * with FAILED_PRECONDITION. So the index each query relies on is written down
 * here, and anything in the "declared" column must exist in
 * firestore.indexes.json.
 *
 *   query                                              index
 *   users      email ==                                automatic single-field
 *   users      orderBy createdAt desc                  automatic single-field
 *   courses    instructorId ==                         automatic single-field
 *   courses    orderBy createdAt desc                  automatic single-field
 *   members    uid == + orderBy joinedAt  (GROUP)      declared composite
 *   assignments courseId == / in                       automatic single-field
 *   gameSessions userId == + orderBy startedAt desc    declared composite
 *   gameSessions assignmentId ==                       automatic single-field
 *   gameSessions userId == AND assignmentId == (count) declared composite
 *   finalResults assignmentId == + orderBy <5 columns> declared composite x5
 *   finalResults userId ==                             automatic single-field
 *   courses    enrollmentOpen ==                       automatic single-field
 *   roleInvites by document id                         none needed
 *
 * ARCHIVING IS NEVER A FIRESTORE FILTER. `archivedAt`, `enrollmentOpen` on an
 * old document and `removedAt` are all ABSENT from every document written
 * before those fields existed, and Firestore excludes a document that lacks a
 * field from any query filtering or ordering on it — silently, with no error.
 * `where('archivedAt','==',null)` would therefore hide the entire live
 * database. Every archive test is applied IN MEMORY, via `isArchived` /
 * `isRemoved` in models.ts, after the documents come back. At class scale
 * (tens of courses, hundreds of members) this costs nothing, it is correct for
 * legacy documents with no backfill, and it adds no index that could be
 * missing in production.
 *
 * Two rules worth remembering:
 *  - automatic single-field indexes are COLLECTION scope only, so any
 *    collectionGroup() query needs an index declared explicitly;
 *  - one equality filter plus an orderBy on a DIFFERENT field needs a
 *    composite index, and sorting in memory instead (as several methods below
 *    deliberately do) avoids needing one.
 * ---------------------------------------------------------------------------
 */

export const COLLECTIONS = {
  users: 'users',
  courses: 'courses',
  courseMembers: 'members',
  assignments: 'assignments',
  gameSessions: 'gameSessions',
  quarters: 'quarters',
  finalResults: 'finalResults',
  // One document per claimed official attempt, id `${assignmentId}_${uid}_${n}`.
  // Only ever read or written by document id, so it needs no index.
  attemptClaims: 'attemptClaims',
  // Role granted to an email before first sign-in, id = lowercased email.
  roleInvites: 'roleInvites',
  // Subcollection of a course: one document per taken student code, id = the
  // code. Makes "this code is already used in this course" a datastore
  // constraint rather than a read-then-write check.
  studentCodes: 'studentCodes',
} as const;

/**
 * True for the gRPC ALREADY_EXISTS status (code 6) that `tx.create` raises when
 * the document is already there. Checked by code rather than by message so it
 * does not depend on wording, with a message fallback for transports that
 * surface the status as text only.
 */
function isAlreadyExists(error: unknown): boolean {
  const code = (error as { code?: unknown } | null)?.code;
  if (code === 6 || code === 'already-exists' || code === 'ALREADY_EXISTS') return true;
  return error instanceof Error && /already exists/i.test(error.message);
}

// --- users -----------------------------------------------------------------

class FirestoreUserRepository implements UserRepository {
  constructor(private readonly db: Firestore) {}

  async get(uid: string): Promise<UserDoc | null> {
    const snap = await this.db.collection(COLLECTIONS.users).doc(uid).get();
    return snap.exists ? (snap.data() as UserDoc) : null;
  }

  async getByEmail(email: string): Promise<UserDoc | null> {
    const snap = await this.db
      .collection(COLLECTIONS.users)
      .where('email', '==', email.toLowerCase())
      .limit(1)
      .get();
    const doc = snap.docs[0];
    return doc ? (doc.data() as UserDoc) : null;
  }

  async upsert(user: Omit<UserDoc, 'createdAt' | 'lastSeenAt'>): Promise<UserDoc> {
    const ref = this.db.collection(COLLECTIONS.users).doc(user.uid);
    const now = Date.now();

    return this.db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (snap.exists) {
        const existing = snap.data() as UserDoc;
        // The stored role is authoritative: signing in again must never
        // silently reset a role an admin granted.
        const merged: UserDoc = {
          ...existing,
          email: user.email.toLowerCase(),
          displayName: user.displayName || existing.displayName,
          lastSeenAt: now,
        };
        tx.set(ref, merged);
        return merged;
      }

      const created: UserDoc = {
        ...user,
        email: user.email.toLowerCase(),
        createdAt: now,
        lastSeenAt: now,
      };
      tx.set(ref, created);
      return created;
    });
  }

  async setRole(uid: string, role: Role): Promise<void> {
    await this.db.collection(COLLECTIONS.users).doc(uid).update({ role });
  }

  async recordPasswordSet(uid: string, at: number, by: string): Promise<void> {
    await this.db
      .collection(COLLECTIONS.users)
      .doc(uid)
      .update({ passwordSetAt: at, passwordSetBy: by });
  }

  async setArchived(uid: string, at: number | null): Promise<void> {
    // A literal null, never undefined: the Admin SDK is configured with
    // ignoreUndefinedProperties, so writing undefined would drop the field and
    // make the document indistinguishable from one written before archiving
    // existed.
    await this.db.collection(COLLECTIONS.users).doc(uid).update({ archivedAt: at });
  }

  async list(limit = 200): Promise<UserDoc[]> {
    const snap = await this.db
      .collection(COLLECTIONS.users)
      .orderBy('createdAt', 'desc')
      .limit(limit)
      .get();
    return snap.docs.map((d) => d.data() as UserDoc);
  }
}

// --- courses ---------------------------------------------------------------

class FirestoreCourseRepository implements CourseRepository {
  constructor(private readonly db: Firestore) {}

  async get(courseId: string): Promise<CourseDoc | null> {
    const snap = await this.db.collection(COLLECTIONS.courses).doc(courseId).get();
    return snap.exists ? (snap.data() as CourseDoc) : null;
  }

  async create(course: Omit<CourseDoc, 'id' | 'createdAt'>): Promise<CourseDoc> {
    const ref = this.db.collection(COLLECTIONS.courses).doc();
    const doc: CourseDoc = {
      ...course,
      id: ref.id,
      createdAt: Date.now(),
      enrollmentOpen: course.enrollmentOpen ?? false,
      archivedAt: null,
    };
    await ref.set(doc);
    return doc;
  }

  async update(
    courseId: string,
    patch: Partial<Pick<CourseDoc, 'courseName' | 'semester' | 'enrollmentOpen' | 'instructorId'>>,
  ): Promise<void> {
    if (Object.keys(patch).length === 0) return;
    await this.db.collection(COLLECTIONS.courses).doc(courseId).update(patch);
  }

  async setArchived(courseId: string, at: number | null): Promise<void> {
    await this.db.collection(COLLECTIONS.courses).doc(courseId).update({ archivedAt: at });
  }

  async listOpenForEnrollment(): Promise<CourseDoc[]> {
    // `enrollmentOpen` is the ONLY datastore filter. The archived test runs in
    // memory below, because a course created before `archivedAt` existed has no
    // such field and would be excluded from any query mentioning it.
    const snap = await this.db
      .collection(COLLECTIONS.courses)
      .where('enrollmentOpen', '==', true)
      .get();
    return activeOnly(snap.docs.map((d) => d.data() as CourseDoc)).sort((a, b) =>
      a.courseName.localeCompare(b.courseName),
    );
  }

  async listByInstructor(instructorId: string): Promise<CourseDoc[]> {
    const snap = await this.db
      .collection(COLLECTIONS.courses)
      .where('instructorId', '==', instructorId)
      .get();
    return snap.docs
      .map((d) => d.data() as CourseDoc)
      .sort((a, b) => b.createdAt - a.createdAt);
  }

  async listAll(): Promise<CourseDoc[]> {
    const snap = await this.db.collection(COLLECTIONS.courses).orderBy('createdAt', 'desc').get();
    return snap.docs.map((d) => d.data() as CourseDoc);
  }

  async addMember(member: Omit<CourseMemberDoc, 'joinedAt'>): Promise<CourseMemberDoc> {
    const doc: CourseMemberDoc = { ...member, joinedAt: Date.now() };
    await this.db
      .collection(COLLECTIONS.courses)
      .doc(member.courseId)
      .collection(COLLECTIONS.courseMembers)
      .doc(member.uid)
      .set(doc);
    return doc;
  }

  private memberRef(courseId: string, uid: string) {
    return this.db
      .collection(COLLECTIONS.courses)
      .doc(courseId)
      .collection(COLLECTIONS.courseMembers)
      .doc(uid);
  }

  /** Claim document for one student code inside one course. */
  private codeRef(courseId: string, studentCode: string) {
    return this.db
      .collection(COLLECTIONS.courses)
      .doc(courseId)
      .collection(COLLECTIONS.studentCodes)
      .doc(encodeURIComponent(studentCode.trim()));
  }

  async selfEnroll(
    member: Omit<CourseMemberDoc, 'joinedAt' | 'removedAt'>,
  ): Promise<
    { status: 'JOINED'; member: CourseMemberDoc } | { status: 'ALREADY_MEMBER' | 'CODE_TAKEN' }
  > {
    const memberRef = this.memberRef(member.courseId, member.uid);
    const codeRef = this.codeRef(member.courseId, member.studentCode);

    return this.db.runTransaction(async (tx) => {
      // Every read before every write — a Firestore transaction requires it.
      const [memberSnap, codeSnap] = await Promise.all([tx.get(memberRef), tx.get(codeRef)]);

      if (memberSnap.exists) {
        const existing = memberSnap.data() as CourseMemberDoc;
        if (!isRemoved(existing)) return { status: 'ALREADY_MEMBER' as const };

        // Rejoining keeps the ORIGINAL student code, ignoring whatever was
        // typed this time. That code may already be baked into a FinalResultDoc
        // from an earlier attempt, and two different codes for one person in
        // one export is exactly what breaks an instructor's grade import.
        const restored: CourseMemberDoc = { ...existing, removedAt: null };
        tx.set(memberRef, restored);
        return { status: 'JOINED' as const, member: restored };
      }

      const claim = codeSnap.exists ? (codeSnap.data() as { uid: string }) : null;
      if (claim && claim.uid !== member.uid) return { status: 'CODE_TAKEN' as const };

      const doc: CourseMemberDoc = { ...member, joinedAt: Date.now(), removedAt: null };
      tx.set(memberRef, doc);
      tx.set(codeRef, { uid: member.uid, studentCode: member.studentCode });
      return { status: 'JOINED' as const, member: doc };
    });
  }

  async updateMember(
    courseId: string,
    uid: string,
    patch: { studentCode: string },
  ): Promise<{ ok: true } | { ok: false; reason: 'CODE_TAKEN' | 'NOT_A_MEMBER' }> {
    const memberRef = this.memberRef(courseId, uid);
    const nextRef = this.codeRef(courseId, patch.studentCode);

    return this.db.runTransaction(async (tx) => {
      const [memberSnap, nextSnap] = await Promise.all([tx.get(memberRef), tx.get(nextRef)]);
      if (!memberSnap.exists) return { ok: false as const, reason: 'NOT_A_MEMBER' as const };

      const member = memberSnap.data() as CourseMemberDoc;
      if (member.studentCode === patch.studentCode) return { ok: true as const };

      const claim = nextSnap.exists ? (nextSnap.data() as { uid: string }) : null;
      if (claim && claim.uid !== uid) return { ok: false as const, reason: 'CODE_TAKEN' as const };

      // Release the old claim so the code becomes available again.
      tx.delete(this.codeRef(courseId, member.studentCode));
      tx.set(nextRef, { uid, studentCode: patch.studentCode });
      tx.set(memberRef, { ...member, studentCode: patch.studentCode });
      return { ok: true as const };
    });
  }

  async setMemberRemoved(courseId: string, uid: string, at: number | null): Promise<void> {
    await this.memberRef(courseId, uid).update({ removedAt: at });
  }

  async removeMember(courseId: string, uid: string): Promise<void> {
    await this.db
      .collection(COLLECTIONS.courses)
      .doc(courseId)
      .collection(COLLECTIONS.courseMembers)
      .doc(uid)
      .delete();
  }

  async listMembers(courseId: string): Promise<CourseMemberDoc[]> {
    const snap = await this.db
      .collection(COLLECTIONS.courses)
      .doc(courseId)
      .collection(COLLECTIONS.courseMembers)
      .get();
    return snap.docs
      .map((d) => d.data() as CourseMemberDoc)
      .sort((a, b) => a.studentCode.localeCompare(b.studentCode));
  }

  async getMember(courseId: string, uid: string): Promise<CourseMemberDoc | null> {
    const snap = await this.db
      .collection(COLLECTIONS.courses)
      .doc(courseId)
      .collection(COLLECTIONS.courseMembers)
      .doc(uid)
      .get();
    return snap.exists ? (snap.data() as CourseMemberDoc) : null;
  }

  async listCoursesForStudent(uid: string): Promise<CourseDoc[]> {
    /*
     * Collection-group query over every course's members subcollection.
     *
     * The `orderBy` is LOAD-BEARING, not cosmetic. Firestore creates automatic
     * single-field indexes with COLLECTION scope only, so a collection-group
     * query needs an index declared explicitly. Without the orderBy this query
     * is implicitly ordered by __name__ and would need a collection-group
     * single-field index on `uid` (a `fieldOverrides` entry); with it, the
     * composite (uid ASC, joinedAt ASC) COLLECTION_GROUP index in
     * firestore.indexes.json serves it exactly.
     *
     * Removing it does not fail any test — the Firestore emulator does not
     * enforce indexes — it fails in production with FAILED_PRECONDITION, on the
     * student home page.
     */
    const snap = await this.db
      .collectionGroup(COLLECTIONS.courseMembers)
      .where('uid', '==', uid)
      .orderBy('joinedAt', 'asc')
      .get();
    const courseIds = [...new Set(snap.docs.map((d) => (d.data() as CourseMemberDoc).courseId))];
    if (courseIds.length === 0) return [];

    const courses = await Promise.all(courseIds.map((id) => this.get(id)));
    return courses.filter((c): c is CourseDoc => c !== null);
  }
}

// --- assignments -----------------------------------------------------------

class FirestoreAssignmentRepository implements AssignmentRepository {
  constructor(private readonly db: Firestore) {}

  async get(assignmentId: string): Promise<AssignmentDoc | null> {
    const snap = await this.db.collection(COLLECTIONS.assignments).doc(assignmentId).get();
    return snap.exists ? (snap.data() as AssignmentDoc) : null;
  }

  async setArchived(assignmentId: string, at: number | null): Promise<void> {
    await this.db.collection(COLLECTIONS.assignments).doc(assignmentId).update({ archivedAt: at });
  }

  async create(assignment: Omit<AssignmentDoc, 'id' | 'createdAt'>): Promise<AssignmentDoc> {
    const ref = this.db.collection(COLLECTIONS.assignments).doc();
    const doc: AssignmentDoc = {
      ...assignment,
      id: ref.id,
      createdAt: Date.now(),
      archivedAt: null,
    };
    await ref.set(doc);
    return doc;
  }

  async update(
    assignmentId: string,
    patch: Partial<Omit<AssignmentDoc, 'id' | 'courseId' | 'createdAt' | 'createdBy'>>,
  ): Promise<void> {
    await this.db.collection(COLLECTIONS.assignments).doc(assignmentId).update(patch);
  }

  async listByCourse(courseId: string): Promise<AssignmentDoc[]> {
    const snap = await this.db
      .collection(COLLECTIONS.assignments)
      .where('courseId', '==', courseId)
      .get();
    return snap.docs
      .map((d) => d.data() as AssignmentDoc)
      .sort((a, b) => b.createdAt - a.createdAt);
  }

  async listByCourses(courseIds: string[]): Promise<AssignmentDoc[]> {
    if (courseIds.length === 0) return [];
    // Firestore caps `in` at 30 values, so query in chunks.
    const chunks: string[][] = [];
    for (let i = 0; i < courseIds.length; i += 30) chunks.push(courseIds.slice(i, i + 30));

    const results = await Promise.all(
      chunks.map((chunk) =>
        this.db.collection(COLLECTIONS.assignments).where('courseId', 'in', chunk).get(),
      ),
    );
    return results
      .flatMap((snap) => snap.docs.map((d) => d.data() as AssignmentDoc))
      .sort((a, b) => b.createdAt - a.createdAt);
  }
}

// --- game sessions ---------------------------------------------------------

class FirestoreSessionRepository implements SessionRepository {
  constructor(private readonly db: Firestore) {}

  private sessionRef(sessionId: string) {
    return this.db.collection(COLLECTIONS.gameSessions).doc(sessionId);
  }

  private quarterRef(sessionId: string, quarter: number) {
    return this.sessionRef(sessionId).collection(COLLECTIONS.quarters).doc(String(quarter));
  }

  async get(sessionId: string): Promise<GameSessionDoc | null> {
    const snap = await this.sessionRef(sessionId).get();
    return snap.exists ? (snap.data() as GameSessionDoc) : null;
  }

  async create(session: Omit<GameSessionDoc, 'id'>): Promise<GameSessionDoc> {
    const ref = this.db.collection(COLLECTIONS.gameSessions).doc();
    const doc: GameSessionDoc = { ...session, id: ref.id };
    await ref.set(doc);
    return doc;
  }

  async createOfficialAttempt(
    session: Omit<GameSessionDoc, 'id'>,
    assignmentId: string,
    attemptNo: number,
  ): Promise<GameSessionDoc | null> {
    // The claim is a separate tiny document with a derived id, written in the
    // same transaction as the session. Deriving the SESSION id instead would
    // put the student's uid in the browser URL and its history; this keeps
    // session ids opaque while still letting the datastore reject a duplicate.
    const claimRef = this.db
      .collection(COLLECTIONS.attemptClaims)
      .doc(`${assignmentId}_${session.userId}_${attemptNo}`);
    const sessionRef = this.db.collection(COLLECTIONS.gameSessions).doc();
    const doc: GameSessionDoc = { ...session, id: sessionRef.id };

    try {
      await this.db.runTransaction(async (tx) => {
        // tx.create throws if the document exists, so the loser of a race
        // fails here and neither write lands.
        tx.create(claimRef, {
          assignmentId,
          userId: session.userId,
          attemptNo,
          sessionId: sessionRef.id,
          claimedAt: Date.now(),
        });
        tx.set(sessionRef, doc);
      });
    } catch (error) {
      if (isAlreadyExists(error)) return null;
      throw error;
    }

    return doc;
  }

  async listByUser(userId: string, limit = 50): Promise<GameSessionDoc[]> {
    const snap = await this.db
      .collection(COLLECTIONS.gameSessions)
      .where('userId', '==', userId)
      .orderBy('startedAt', 'desc')
      .limit(limit)
      .get();
    return snap.docs.map((d) => d.data() as GameSessionDoc);
  }

  async listByAssignment(assignmentId: string): Promise<GameSessionDoc[]> {
    const snap = await this.db
      .collection(COLLECTIONS.gameSessions)
      .where('assignmentId', '==', assignmentId)
      .get();
    return snap.docs
      .map((d) => d.data() as GameSessionDoc)
      .sort((a, b) => b.startedAt - a.startedAt);
  }

  async countAttempts(userId: string, assignmentId: string): Promise<number> {
    const snap = await this.db
      .collection(COLLECTIONS.gameSessions)
      .where('userId', '==', userId)
      .where('assignmentId', '==', assignmentId)
      .count()
      .get();
    return snap.data().count;
  }

  async getQuarter(sessionId: string, quarter: number): Promise<QuarterDoc | null> {
    const snap = await this.quarterRef(sessionId, quarter).get();
    return snap.exists ? (snap.data() as QuarterDoc) : null;
  }

  async listQuarters(sessionId: string): Promise<QuarterDoc[]> {
    const snap = await this.sessionRef(sessionId).collection(COLLECTIONS.quarters).get();
    return snap.docs
      .map((d) => d.data() as QuarterDoc)
      .sort((a, b) => a.quarter - b.quarter);
  }

  /**
   * Records a quarter and advances the session in ONE transaction.
   *
   * The quarter document id is the quarter number, so its existence is the
   * idempotency key demanded by spec 13.2. A second submission of an already
   * processed quarter returns the stored result and recomputes nothing — the
   * guarantee comes from the transaction, not from a check in the caller.
   */
  async saveQuarter(
    sessionId: string,
    quarter: QuarterDoc,
    nextCompanies: GameSessionDoc['companies'],
  ): Promise<SaveQuarterOutcome> {
    const sessionRef = this.sessionRef(sessionId);
    const quarterRef = this.quarterRef(sessionId, quarter.quarter);

    return this.db.runTransaction<SaveQuarterOutcome>(async (tx) => {
      const [sessionSnap, quarterSnap] = await Promise.all([
        tx.get(sessionRef),
        tx.get(quarterRef),
      ]);

      if (!sessionSnap.exists) throw new Error(`Session ${sessionId} not found`);
      const session = sessionSnap.data() as GameSessionDoc;

      if (quarterSnap.exists) {
        return {
          status: 'ALREADY_EXISTS',
          quarter: quarterSnap.data() as QuarterDoc,
          session,
        };
      }

      const updated: GameSessionDoc = {
        ...session,
        companies: nextCompanies,
        currentRound: Math.max(session.currentRound, quarter.quarter),
      };

      tx.create(quarterRef, quarter);
      tx.set(sessionRef, updated);

      return { status: 'SAVED', quarter, session: updated };
    });
  }

  /** See the contract in `types.ts`: the limit is enforced here, in a transaction. */
  async claimGoldenUse(
    sessionId: string,
    quarter: number,
    maxQuarters: number,
  ): Promise<ClaimGoldenUseOutcome> {
    const sessionRef = this.sessionRef(sessionId);

    return this.db.runTransaction<ClaimGoldenUseOutcome>(async (tx) => {
      const snap = await tx.get(sessionRef);
      if (!snap.exists) throw new Error(`Session ${sessionId} not found`);
      const session = snap.data() as GameSessionDoc;

      const used = session.goldenUsedQuarters ?? [];
      if (used.includes(quarter)) return { status: 'ALREADY_USED', used: [...used] };
      if (used.length >= maxQuarters) return { status: 'LIMIT_REACHED', used: [...used] };

      const next = [...used, quarter].sort((a, b) => a - b);
      tx.update(sessionRef, { goldenUsedQuarters: next });
      return { status: 'CLAIMED', used: next };
    });
  }

  async complete(sessionId: string, completedAt: number): Promise<void> {
    await this.sessionRef(sessionId).update({ status: 'COMPLETED', completedAt });
  }
}

// --- final results / leaderboard -------------------------------------------

class FirestoreFinalResultRepository implements FinalResultRepository {
  constructor(private readonly db: Firestore) {}

  async get(sessionId: string): Promise<FinalResultDoc | null> {
    const snap = await this.db.collection(COLLECTIONS.finalResults).doc(sessionId).get();
    return snap.exists ? (snap.data() as FinalResultDoc) : null;
  }

  async save(result: FinalResultDoc): Promise<void> {
    await this.db.collection(COLLECTIONS.finalResults).doc(result.sessionId).set(result);
  }

  async listByAssignment(
    assignmentId: string,
    sort: LeaderboardSort = 'finalScore',
    limit = 500,
  ): Promise<FinalResultDoc[]> {
    const query: Query = this.db
      .collection(COLLECTIONS.finalResults)
      .where('assignmentId', '==', assignmentId)
      .orderBy(sort, 'desc')
      .limit(limit);

    const snap = await query.get();
    return snap.docs.map((d) => d.data() as FinalResultDoc);
  }

  async listByUser(userId: string): Promise<FinalResultDoc[]> {
    const snap = await this.db
      .collection(COLLECTIONS.finalResults)
      .where('userId', '==', userId)
      .get();
    return snap.docs
      .map((d) => d.data() as FinalResultDoc)
      .sort((a, b) => b.completedAt - a.completedAt);
  }
}

let cachedRepositories: Repositories | null = null;

/** The production repository set, backed by Firestore. */
// --- role invites ----------------------------------------------------------

/** Firestore document ids may not contain "/", be "." or ".." or exceed 1500 bytes. */
export function isUsableInviteId(email: string): boolean {
  const id = email.trim().toLowerCase();
  if (!id || id === '.' || id === '..') return false;
  if (id.includes('/')) return false;
  return Buffer.byteLength(id, 'utf8') <= 1500;
}

class FirestoreRoleInviteRepository implements RoleInviteRepository {
  constructor(private readonly db: Firestore) {}

  private ref(email: string) {
    return this.db.collection(COLLECTIONS.roleInvites).doc(email.trim().toLowerCase());
  }

  async get(email: string): Promise<RoleInviteDoc | null> {
    const snap = await this.ref(email).get();
    return snap.exists ? (snap.data() as RoleInviteDoc) : null;
  }

  async list(limit = 200): Promise<RoleInviteDoc[]> {
    const snap = await this.db
      .collection(COLLECTIONS.roleInvites)
      .orderBy('createdAt', 'desc')
      .limit(limit)
      .get();
    return snap.docs.map((d) => d.data() as RoleInviteDoc);
  }

  async put(invite: Omit<RoleInviteDoc, 'claimedAt' | 'claimedUid'>): Promise<void> {
    const doc: RoleInviteDoc = {
      ...invite,
      email: invite.email.trim().toLowerCase(),
      claimedAt: null,
      claimedUid: null,
    };
    await this.ref(doc.email).set(doc);
  }

  async remove(email: string): Promise<void> {
    await this.ref(email).delete();
  }

  async claim(email: string, uid: string): Promise<Role | null> {
    const ref = this.ref(email);
    return this.db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) return null;

      const invite = snap.data() as RoleInviteDoc;
      // An already-claimed invite grants nothing. Without this, an admin who
      // later demotes the person would see them re-promoted on their next
      // sign-in, silently undoing the demotion.
      if (invite.claimedAt !== null) return null;

      tx.set(ref, { ...invite, claimedAt: Date.now(), claimedUid: uid });
      return invite.role;
    });
  }
}

export function getRepositories(): Repositories {
  if (cachedRepositories) return cachedRepositories;
  const db = getDb();
  cachedRepositories = {
    users: new FirestoreUserRepository(db),
    courses: new FirestoreCourseRepository(db),
    assignments: new FirestoreAssignmentRepository(db),
    sessions: new FirestoreSessionRepository(db),
    finalResults: new FirestoreFinalResultRepository(db),
    roleInvites: new FirestoreRoleInviteRepository(db),
  };
  return cachedRepositories;
}
