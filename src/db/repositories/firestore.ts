import 'server-only';
import type { Firestore, Query } from 'firebase-admin/firestore';
import { ARENA_SEATS } from '@/domain/simulation';
import { getDb } from '../firestore';
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
import { activeOnly, hasLeftGroup, isArchived, isRemoved } from '../models';
import type {
  AssignmentRepository,
  ClaimSeatOutcome,
  CourseRepository,
  CreateGroupOutcome,
  FinalResultRepository,
  GroupGameRepository,
  GroupRepository,
  Repositories,
  RoleInviteRepository,
  ClaimGoldenUseOutcome,
  SaveGroupQuarterOutcome,
  SaveQuarterOutcome,
  SessionRepository,
  SubmitDecisionOutcome,
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
 *
 * THE GROUP COLLECTIONS (Part 2) DECLARE NO INDEXES, on purpose. Every query
 * they make is a SINGLE equality filter on a collection-scoped query, which the
 * automatic single-field indexes already serve, and each one sorts in memory
 * afterwards. Join codes, seat claims, matches, quarters and submissions are
 * all addressed BY DOCUMENT ID, which needs no index at all. If you add an
 * orderBy, a second filter, or a collectionGroup() query here, it needs an
 * entry in firestore.indexes.json — and the emulator will not tell you.
 *
 * They must also not REUSE a collection id. A collection group is selected by
 * id alone, at any depth, so naming a subcollection `members` silently enrols
 * its documents in the course roster's collection group and in the index that
 * serves it. That is not hypothetical: it broke the student home page. The
 * names are asserted to be distinct in tests/integration/collection-ids.test.ts.
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

  // --- group competition (Part 2) ---
  groups: 'groups',
  // Subcollection of a group: one document per student, id = uid.
  //
  // NOT `members`, however natural that reads. A collectionGroup() query
  // matches on the collection ID ALONE, anywhere in the database: naming this
  // `members` put group members into the same collection group as course
  // rosters, and `listCoursesForStudent` — the first query the student home
  // page runs — swept them up. A `GroupMemberDoc` carries `uid` and `joinedAt`,
  // so it matched the filter and the index exactly, but has no `courseId`, so
  // the very next line asked Firestore for the document at path `courses/
  // undefined` and the page threw. See `collectionGroupIdIsUnique` in
  // tests/db/collections.test.ts, which now fails if any subcollection id
  // repeats.
  groupMembers: 'groupMembers',
  // One document per join code, id = the CODE itself. Two groups sharing a code
  // would send a student into someone else's match, so uniqueness is a
  // datastore constraint. Read and written by id only, so it needs no index.
  groupJoinCodes: 'groupJoinCodes',
  // One document per `${assignmentId}_${uid}`, so a student cannot hold seats
  // in two groups of the same assignment. Doubles as the index-free lookup for
  // "which group is this person in". By id only, so it needs no index either.
  groupSeatClaims: 'groupSeatClaims',
  // The shared match, id = the GROUP id. One match per group, by construction.
  groupGames: 'groupGames',
  // Subcollection of a match: decisions waiting for the quarter to run,
  // id = `q{n}_{seatKey}`.
  groupSubmissions: 'submissions',
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
     *
     * A collection group is selected by collection ID alone, ANYWHERE in the
     * database, so this query reaches every subcollection called `members` no
     * matter whose child it is. That is why `COLLECTIONS.groupMembers` is not
     * called `members`, and why the `courseId` guard below exists: a document
     * from some future subcollection of the same name would otherwise arrive
     * here without one and send `courses/undefined` to Firestore, which throws
     * rather than returning nothing. Dropping a stranger is the correct
     * reading of "courses this student is enrolled in"; crashing the home page
     * is not.
     */
    const snap = await this.db
      .collectionGroup(COLLECTIONS.courseMembers)
      .where('uid', '==', uid)
      .orderBy('joinedAt', 'asc')
      .get();
    const courseIds = [
      ...new Set(
        snap.docs
          .map((d) => (d.data() as CourseMemberDoc).courseId)
          .filter((id): id is string => typeof id === 'string' && id.length > 0),
      ),
    ];
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

// --- group competition (Part 2) --------------------------------------------

class FirestoreGroupRepository implements GroupRepository {
  constructor(private readonly db: Firestore) {}

  private groupRef(groupId: string) {
    return this.db.collection(COLLECTIONS.groups).doc(groupId);
  }

  /** Claim document for one join code. The code IS the id, so it cannot clash. */
  private codeRef(joinCode: string) {
    return this.db.collection(COLLECTIONS.groupJoinCodes).doc(joinCode.trim().toUpperCase());
  }

  private memberRef(groupId: string, uid: string) {
    return this.groupRef(groupId).collection(COLLECTIONS.groupMembers).doc(uid);
  }

  /**
   * Claim document for "this student is in a group for this assignment".
   *
   * Lives at the top level, keyed by `${assignmentId}_${uid}`, so it is both
   * the uniqueness constraint and the index-free way to find someone's group.
   */
  private seatClaimRef(assignmentId: string, uid: string) {
    return this.db.collection(COLLECTIONS.groupSeatClaims).doc(`${assignmentId}_${uid}`);
  }

  private emptySeats(): Record<string, string | null> {
    return Object.fromEntries(ARENA_SEATS.map((seat) => [seat, null]));
  }

  async create(
    group: Omit<GroupDoc, 'id' | 'createdAt' | 'seats' | 'archivedAt'>,
  ): Promise<CreateGroupOutcome> {
    const groupRef = this.db.collection(COLLECTIONS.groups).doc();
    const joinCode = group.joinCode.trim().toUpperCase();
    const codeRef = this.codeRef(joinCode);

    try {
      return await this.db.runTransaction<CreateGroupOutcome>(async (tx) => {
        const codeSnap = await tx.get(codeRef);
        if (codeSnap.exists) return { status: 'CODE_TAKEN' as const };

        const doc: GroupDoc = {
          ...group,
          joinCode,
          id: groupRef.id,
          seats: this.emptySeats(),
          createdAt: Date.now(),
          archivedAt: null,
        };
        // `create`, not `set`: if another transaction claimed this code between
        // the read and the commit, this throws rather than stealing it.
        tx.create(codeRef, { groupId: doc.id, joinCode });
        tx.set(groupRef, doc);
        return { status: 'CREATED' as const, group: doc };
      });
    } catch (error) {
      if (isAlreadyExists(error)) return { status: 'CODE_TAKEN' };
      throw error;
    }
  }

  async regenerateJoinCode(groupId: string, joinCode: string): Promise<CreateGroupOutcome> {
    const groupRef = this.groupRef(groupId);
    const next = joinCode.trim().toUpperCase();
    const nextRef = this.codeRef(next);

    try {
      return await this.db.runTransaction<CreateGroupOutcome>(async (tx) => {
        const [groupSnap, nextSnap] = await Promise.all([tx.get(groupRef), tx.get(nextRef)]);
        if (!groupSnap.exists) throw new Error(`Group ${groupId} not found`);

        const group = groupSnap.data() as GroupDoc;
        const holder = nextSnap.exists ? (nextSnap.data() as { groupId: string }) : null;
        if (holder && holder.groupId !== groupId) return { status: 'CODE_TAKEN' as const };

        const updated: GroupDoc = { ...group, joinCode: next };
        tx.delete(this.codeRef(group.joinCode));
        tx.set(nextRef, { groupId, joinCode: next });
        tx.set(groupRef, updated);
        return { status: 'CREATED' as const, group: updated };
      });
    } catch (error) {
      if (isAlreadyExists(error)) return { status: 'CODE_TAKEN' };
      throw error;
    }
  }

  async get(groupId: string): Promise<GroupDoc | null> {
    const snap = await this.groupRef(groupId).get();
    return snap.exists ? (snap.data() as GroupDoc) : null;
  }

  async getByJoinCode(joinCode: string): Promise<GroupDoc | null> {
    const snap = await this.codeRef(joinCode).get();
    if (!snap.exists) return null;
    return this.get((snap.data() as { groupId: string }).groupId);
  }

  async listByAssignment(assignmentId: string): Promise<GroupDoc[]> {
    const snap = await this.db
      .collection(COLLECTIONS.groups)
      .where('assignmentId', '==', assignmentId)
      .get();
    // Sorted in memory: an equality filter plus an orderBy on another field
    // would need a composite index for no gain at class scale.
    return snap.docs
      .map((d) => d.data() as GroupDoc)
      .sort((a, b) => a.createdAt - b.createdAt || a.name.localeCompare(b.name));
  }

  async update(groupId: string, patch: { name?: string }): Promise<void> {
    if (!patch.name) return;
    await this.groupRef(groupId).update({ name: patch.name });
  }

  async setArchived(groupId: string, at: number | null): Promise<void> {
    await this.groupRef(groupId).update({ archivedAt: at });
  }

  /** See the contract in `types.ts`: the seat is taken here, in a transaction. */
  async claimSeat(input: {
    groupId: string;
    uid: string;
    companyName: string;
    productName: string;
    positioning: GroupMemberDoc['positioning'];
    displayName: string;
    email: string;
    studentCode: string | null;
  }): Promise<ClaimSeatOutcome> {
    const groupRef = this.groupRef(input.groupId);
    const memberRef = this.memberRef(input.groupId, input.uid);

    return this.db.runTransaction<ClaimSeatOutcome>(async (tx) => {
      const groupSnap = await tx.get(groupRef);
      if (!groupSnap.exists) throw new Error(`Group ${input.groupId} not found`);
      const group = groupSnap.data() as GroupDoc;

      // Every read before every write — a Firestore transaction requires it.
      const claimRef = this.seatClaimRef(group.assignmentId, input.uid);
      const [memberSnap, claimSnap] = await Promise.all([tx.get(memberRef), tx.get(claimRef)]);

      if (memberSnap.exists) {
        const existing = memberSnap.data() as GroupMemberDoc;
        if (!hasLeftGroup(existing)) {
          return { status: 'ALREADY_IN_THIS_GROUP' as const, member: existing, group };
        }
      }

      if (claimSnap.exists) {
        const claim = claimSnap.data() as { groupId: string };
        if (claim.groupId !== group.id) {
          return { status: 'IN_ANOTHER_GROUP' as const, groupId: claim.groupId };
        }
      }

      if (isArchived(group)) return { status: 'GROUP_CLOSED' as const };

      const seatKey = ARENA_SEATS.find((seat) => group.seats[seat] == null);
      if (!seatKey) return { status: 'GROUP_FULL' as const };

      const member: GroupMemberDoc = {
        uid: input.uid,
        groupId: group.id,
        assignmentId: group.assignmentId,
        seatKey,
        companyName: input.companyName,
        productName: input.productName,
        positioning: input.positioning,
        displayName: input.displayName,
        email: input.email,
        studentCode: input.studentCode,
        joinedAt: Date.now(),
        leftAt: null,
      };
      const updated: GroupDoc = {
        ...group,
        seats: { ...group.seats, [seatKey]: input.uid },
      };

      tx.set(groupRef, updated);
      tx.set(memberRef, member);
      tx.set(claimRef, { groupId: group.id, uid: input.uid, seatKey });

      return { status: 'CLAIMED' as const, member, group: updated };
    });
  }

  /**
   * MIGRATION SHIM, and nothing more.
   *
   * Group members briefly lived in a subcollection called `members`, which
   * collided with the course roster's collection group and broke the student
   * home page (see `COLLECTIONS.groupMembers`). Renaming the collection fixes
   * the page but strands any row written during that window: the seat claim and
   * `group.seats` still say the student holds a seat, while the row describing
   * them has become unreadable — so they cannot play, cannot re-join, and an
   * instructor cannot even release the seat, because releasing it needs the
   * row to know which seat it is.
   *
   * Reading the old path by DOCUMENT ID keeps those students working. It is
   * safe precisely because it is a direct path read: no collectionGroup query
   * ever touches it, which was the whole defect.
   *
   * Safe to delete once no group predates the fix — writes only ever go to the
   * new path, so the old one cannot grow.
   */
  private legacyMemberRef(groupId: string, uid: string) {
    return this.groupRef(groupId).collection('members').doc(uid);
  }

  async releaseSeat(groupId: string, uid: string): Promise<void> {
    const groupRef = this.groupRef(groupId);
    const current = this.memberRef(groupId, uid);
    // Resolved before the transaction opens: a transaction may not choose its
    // reads based on an earlier read inside itself.
    const memberRef = (await current.get()).exists ? current : this.legacyMemberRef(groupId, uid);

    await this.db.runTransaction(async (tx) => {
      const [groupSnap, memberSnap] = await Promise.all([tx.get(groupRef), tx.get(memberRef)]);
      if (!groupSnap.exists || !memberSnap.exists) return;

      const group = groupSnap.data() as GroupDoc;
      const member = memberSnap.data() as GroupMemberDoc;

      tx.set(groupRef, { ...group, seats: { ...group.seats, [member.seatKey]: null } });
      tx.set(memberRef, { ...member, leftAt: Date.now() });
      tx.delete(this.seatClaimRef(group.assignmentId, uid));
    });
  }

  async listMembers(groupId: string): Promise<GroupMemberDoc[]> {
    const snap = await this.groupRef(groupId).collection(COLLECTIONS.groupMembers).get();
    // See `legacyMemberRef`. A group is either wholly before the rename or
    // wholly after it — writes only go to the new path — so an empty new
    // subcollection is the signal to look once at the old one.
    const docs = snap.empty
      ? (await this.groupRef(groupId).collection('members').get()).docs
      : snap.docs;
    return docs
      .map((d) => d.data() as GroupMemberDoc)
      .sort((a, b) => ARENA_SEATS.indexOf(a.seatKey) - ARENA_SEATS.indexOf(b.seatKey));
  }

  async getMember(groupId: string, uid: string): Promise<GroupMemberDoc | null> {
    const snap = await this.memberRef(groupId, uid).get();
    if (snap.exists) return snap.data() as GroupMemberDoc;

    const legacy = await this.legacyMemberRef(groupId, uid).get(); // see legacyMemberRef
    return legacy.exists ? (legacy.data() as GroupMemberDoc) : null;
  }

  async findMembership(assignmentId: string, uid: string): Promise<GroupMemberDoc | null> {
    const snap = await this.seatClaimRef(assignmentId, uid).get();
    if (!snap.exists) return null;
    return this.getMember((snap.data() as { groupId: string }).groupId, uid);
  }
}

class FirestoreGroupGameRepository implements GroupGameRepository {
  constructor(private readonly db: Firestore) {}

  /** The group id IS the document id — see `GroupGameDoc`. */
  private gameRef(groupId: string) {
    return this.db.collection(COLLECTIONS.groupGames).doc(groupId);
  }

  private quarterRef(groupId: string, quarter: number) {
    return this.gameRef(groupId).collection(COLLECTIONS.quarters).doc(String(quarter));
  }

  private submissionRef(groupId: string, quarter: number, seatKey: string) {
    return this.gameRef(groupId)
      .collection(COLLECTIONS.groupSubmissions)
      .doc(`q${quarter}_${seatKey}`);
  }

  async create(game: Omit<GroupGameDoc, 'id'>): Promise<GroupGameDoc> {
    const ref = this.gameRef(game.groupId);

    return this.db.runTransaction<GroupGameDoc>(async (tx) => {
      const snap = await tx.get(ref);
      // Keyed by group, so a second concurrent start returns the match that is
      // already running rather than replacing it with a fresh one — which would
      // wipe the quarters already played.
      if (snap.exists) return snap.data() as GroupGameDoc;

      const doc: GroupGameDoc = { ...game, id: game.groupId };
      tx.set(ref, doc);
      return doc;
    });
  }

  async get(groupId: string): Promise<GroupGameDoc | null> {
    const snap = await this.gameRef(groupId).get();
    return snap.exists ? (snap.data() as GroupGameDoc) : null;
  }

  async listByAssignment(assignmentId: string): Promise<GroupGameDoc[]> {
    const snap = await this.db
      .collection(COLLECTIONS.groupGames)
      .where('assignmentId', '==', assignmentId)
      .get();
    return snap.docs
      .map((d) => d.data() as GroupGameDoc)
      .sort((a, b) => a.startedAt - b.startedAt);
  }

  async submitDecision(
    groupId: string,
    submission: Omit<GroupSubmissionDoc, 'submittedAt'>,
  ): Promise<SubmitDecisionOutcome> {
    const ref = this.submissionRef(groupId, submission.quarter, submission.seatKey);

    return this.db.runTransaction<SubmitDecisionOutcome>(async (tx) => {
      const snap = await tx.get(ref);
      if (snap.exists) {
        return { status: 'ALREADY_SUBMITTED', submission: snap.data() as GroupSubmissionDoc };
      }

      const doc: GroupSubmissionDoc = { ...submission, submittedAt: Date.now() };
      tx.create(ref, doc);
      return { status: 'SUBMITTED', submission: doc };
    });
  }

  async listSubmissions(groupId: string, quarter: number): Promise<GroupSubmissionDoc[]> {
    const snap = await this.gameRef(groupId)
      .collection(COLLECTIONS.groupSubmissions)
      .where('quarter', '==', quarter)
      .get();
    return snap.docs
      .map((d) => d.data() as GroupSubmissionDoc)
      .sort((a, b) => ARENA_SEATS.indexOf(a.seatKey) - ARENA_SEATS.indexOf(b.seatKey));
  }

  async getQuarter(groupId: string, quarter: number): Promise<QuarterDoc | null> {
    const snap = await this.quarterRef(groupId, quarter).get();
    return snap.exists ? (snap.data() as QuarterDoc) : null;
  }

  async listQuarters(groupId: string): Promise<QuarterDoc[]> {
    const snap = await this.gameRef(groupId).collection(COLLECTIONS.quarters).get();
    return snap.docs
      .map((d) => d.data() as QuarterDoc)
      .sort((a, b) => a.quarter - b.quarter);
  }

  async saveQuarter(
    groupId: string,
    quarter: QuarterDoc,
    nextCompanies: GroupGameDoc['companies'],
  ): Promise<SaveGroupQuarterOutcome> {
    const gameRef = this.gameRef(groupId);
    const quarterRef = this.quarterRef(groupId, quarter.quarter);

    return this.db.runTransaction<SaveGroupQuarterOutcome>(async (tx) => {
      const [gameSnap, quarterSnap] = await Promise.all([tx.get(gameRef), tx.get(quarterRef)]);
      if (!gameSnap.exists) throw new Error(`Group game ${groupId} not found`);
      const game = gameSnap.data() as GroupGameDoc;

      if (quarterSnap.exists) {
        return {
          status: 'ALREADY_EXISTS',
          quarter: quarterSnap.data() as QuarterDoc,
          game,
        };
      }

      const updated: GroupGameDoc = {
        ...game,
        companies: nextCompanies,
        currentRound: Math.max(game.currentRound, quarter.quarter),
      };

      tx.create(quarterRef, quarter);
      tx.set(gameRef, updated);

      return { status: 'SAVED', quarter, game: updated };
    });
  }

  async complete(groupId: string, completedAt: number): Promise<void> {
    await this.gameRef(groupId).update({ status: 'COMPLETED', completedAt });
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
    groups: new FirestoreGroupRepository(db),
    groupGames: new FirestoreGroupGameRepository(db),
  };
  return cachedRepositories;
}
