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
  UserDoc,
} from '../models';
import type {
  AssignmentRepository,
  CourseRepository,
  FinalResultRepository,
  Repositories,
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
 */

export const COLLECTIONS = {
  users: 'users',
  courses: 'courses',
  courseMembers: 'members',
  assignments: 'assignments',
  gameSessions: 'gameSessions',
  quarters: 'quarters',
  finalResults: 'finalResults',
} as const;

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
    const doc: CourseDoc = { ...course, id: ref.id, createdAt: Date.now() };
    await ref.set(doc);
    return doc;
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
    // Collection-group query over every course's members subcollection.
    const snap = await this.db
      .collectionGroup(COLLECTIONS.courseMembers)
      .where('uid', '==', uid)
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

  async create(assignment: Omit<AssignmentDoc, 'id' | 'createdAt'>): Promise<AssignmentDoc> {
    const ref = this.db.collection(COLLECTIONS.assignments).doc();
    const doc: AssignmentDoc = { ...assignment, id: ref.id, createdAt: Date.now() };
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
export function getRepositories(): Repositories {
  if (cachedRepositories) return cachedRepositories;
  const db = getDb();
  cachedRepositories = {
    users: new FirestoreUserRepository(db),
    courses: new FirestoreCourseRepository(db),
    assignments: new FirestoreAssignmentRepository(db),
    sessions: new FirestoreSessionRepository(db),
    finalResults: new FirestoreFinalResultRepository(db),
  };
  return cachedRepositories;
}
