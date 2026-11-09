/**
 * Storage for the LMS connection (UniGame Hub / LTI 1.3).
 *
 * Kept apart from the game repositories: none of this is game data, and every
 * collection here is read and written by document id (or one equality filter),
 * so it needs no composite index. Collection ids all start with `lti` so they
 * cannot collide with a game collection group (see collection-ids.test.ts).
 */
import { createHash } from 'node:crypto';
import type { Firestore } from 'firebase-admin/firestore';

export const LTI_COLLECTIONS = {
  /** One per LMS user, id = Hub user id. Which app account they are. */
  users: 'ltiUsers',
  /** One per LMS activity, id = linkKey(). Which assignment it plays. */
  links: 'ltiLinks',
  /** An instructor opened an activity that is not linked yet. id = linkKey(). */
  pending: 'ltiPending',
  /** Where to send one student's grade for one assignment. id = `${uid}__${assignmentId}`. */
  gradeTargets: 'ltiGradeTargets',
  /** Launch tickets already used, id = ticket jti (replay protection). */
  usedTickets: 'ltiUsedTickets',
  /** Last grade sent for a session, id = session id. */
  gradeLog: 'ltiGradeLog',
} as const;

export interface LtiUserDoc {
  hubUserId: string;
  uid: string;
  tenantId: string;
  username: string | null;
  email: string | null;
  role: 'instructor' | 'learner';
  updatedAt: number;
}

/** Where an LMS activity lives, as reported by the Hub. */
export interface LtiActivityRef {
  key: string;
  tenantId: string;
  issuer: string;
  contextId: string;
  resourceLinkId: string;
  contextTitle: string | null;
  contextLabel: string | null;
  resourceTitle: string | null;
  /** Present when the LMS activity has a gradebook column (enables class grade sending). */
  linkTarget: string | null;
}

export interface LtiLinkDoc extends LtiActivityRef {
  assignmentId: string;
  courseId: string;
  linkedBy: string;
  linkedAt: number;
}

export interface LtiPendingDoc extends LtiActivityRef {
  hubUserId: string;
  uid: string;
  expiresAt: number;
}

export interface LtiGradeTargetDoc {
  uid: string;
  assignmentId: string;
  hubUserId: string;
  gradeTarget: string;
  updatedAt: number;
}

export interface LtiGradeLogDoc {
  sessionId: string;
  uid: string;
  assignmentId: string;
  score: number;
  status: string;
  sentAt: number;
  error: string | null;
}

export interface LtiStore {
  /** False when the ticket was already used. Atomic. */
  markTicketUsed(jti: string, expiresAt: number): Promise<boolean>;
  getUser(hubUserId: string): Promise<LtiUserDoc | null>;
  putUser(doc: LtiUserDoc): Promise<void>;
  getLink(key: string): Promise<LtiLinkDoc | null>;
  putLink(doc: LtiLinkDoc): Promise<void>;
  listLinksByAssignment(assignmentId: string): Promise<LtiLinkDoc[]>;
  getPending(key: string): Promise<LtiPendingDoc | null>;
  putPending(doc: LtiPendingDoc): Promise<void>;
  deletePending(key: string): Promise<void>;
  getGradeTarget(uid: string, assignmentId: string): Promise<LtiGradeTargetDoc | null>;
  putGradeTarget(doc: LtiGradeTargetDoc): Promise<void>;
  listGradeTargetsByAssignment(assignmentId: string): Promise<LtiGradeTargetDoc[]>;
  getGradeLog(sessionId: string): Promise<LtiGradeLogDoc | null>;
  putGradeLog(doc: LtiGradeLogDoc): Promise<void>;
}

/** Stable, path-safe id for one LMS activity. */
export function linkKey(parts: {
  tenantId: string;
  issuer: string;
  contextId: string;
  resourceLinkId: string;
}): string {
  return createHash('sha256')
    .update([parts.tenantId, parts.issuer, parts.contextId, parts.resourceLinkId].join('|'))
    .digest('hex')
    .slice(0, 40);
}

const gradeTargetId = (uid: string, assignmentId: string) => `${uid}__${assignmentId}`;

export class FirestoreLtiStore implements LtiStore {
  constructor(private readonly db: Firestore) {}

  private col(name: keyof typeof LTI_COLLECTIONS) {
    return this.db.collection(LTI_COLLECTIONS[name]);
  }

  async markTicketUsed(jti: string, expiresAt: number): Promise<boolean> {
    try {
      // create() fails if the document exists: that failure IS the replay check.
      await this.col('usedTickets').doc(jti).create({ usedAt: Date.now(), expiresAt });
      return true;
    } catch (error) {
      const code = (error as { code?: unknown }).code;
      if (code === 6 || code === 'already-exists') return false;
      throw error;
    }
  }

  async getUser(hubUserId: string) {
    const snap = await this.col('users').doc(hubUserId).get();
    return snap.exists ? (snap.data() as LtiUserDoc) : null;
  }
  async putUser(doc: LtiUserDoc) {
    await this.col('users').doc(doc.hubUserId).set(doc);
  }
  async getLink(key: string) {
    const snap = await this.col('links').doc(key).get();
    return snap.exists ? (snap.data() as LtiLinkDoc) : null;
  }
  async putLink(doc: LtiLinkDoc) {
    await this.col('links').doc(doc.key).set(doc);
  }
  async listLinksByAssignment(assignmentId: string) {
    const snap = await this.col('links').where('assignmentId', '==', assignmentId).get();
    return snap.docs.map((d) => d.data() as LtiLinkDoc);
  }
  async getPending(key: string) {
    const snap = await this.col('pending').doc(key).get();
    return snap.exists ? (snap.data() as LtiPendingDoc) : null;
  }
  async putPending(doc: LtiPendingDoc) {
    await this.col('pending').doc(doc.key).set(doc);
  }
  async deletePending(key: string) {
    await this.col('pending').doc(key).delete();
  }
  async getGradeTarget(uid: string, assignmentId: string) {
    const snap = await this.col('gradeTargets').doc(gradeTargetId(uid, assignmentId)).get();
    return snap.exists ? (snap.data() as LtiGradeTargetDoc) : null;
  }
  async putGradeTarget(doc: LtiGradeTargetDoc) {
    await this.col('gradeTargets').doc(gradeTargetId(doc.uid, doc.assignmentId)).set(doc);
  }
  async listGradeTargetsByAssignment(assignmentId: string) {
    const snap = await this.col('gradeTargets').where('assignmentId', '==', assignmentId).get();
    return snap.docs.map((d) => d.data() as LtiGradeTargetDoc);
  }
  async getGradeLog(sessionId: string) {
    const snap = await this.col('gradeLog').doc(sessionId).get();
    return snap.exists ? (snap.data() as LtiGradeLogDoc) : null;
  }
  async putGradeLog(doc: LtiGradeLogDoc) {
    await this.col('gradeLog').doc(doc.sessionId).set(doc);
  }
}

/** In-memory twin, for tests and local runs without Firestore. */
export class MemoryLtiStore implements LtiStore {
  readonly used = new Set<string>();
  readonly users = new Map<string, LtiUserDoc>();
  readonly links = new Map<string, LtiLinkDoc>();
  readonly pending = new Map<string, LtiPendingDoc>();
  readonly gradeTargets = new Map<string, LtiGradeTargetDoc>();
  readonly gradeLog = new Map<string, LtiGradeLogDoc>();

  async markTicketUsed(jti: string) {
    if (this.used.has(jti)) return false;
    this.used.add(jti);
    return true;
  }
  async getUser(id: string) {
    return this.users.get(id) ?? null;
  }
  async putUser(doc: LtiUserDoc) {
    this.users.set(doc.hubUserId, { ...doc });
  }
  async getLink(key: string) {
    return this.links.get(key) ?? null;
  }
  async putLink(doc: LtiLinkDoc) {
    this.links.set(doc.key, { ...doc });
  }
  async listLinksByAssignment(assignmentId: string) {
    return [...this.links.values()].filter((l) => l.assignmentId === assignmentId);
  }
  async getPending(key: string) {
    return this.pending.get(key) ?? null;
  }
  async putPending(doc: LtiPendingDoc) {
    this.pending.set(doc.key, { ...doc });
  }
  async deletePending(key: string) {
    this.pending.delete(key);
  }
  async getGradeTarget(uid: string, assignmentId: string) {
    return this.gradeTargets.get(gradeTargetId(uid, assignmentId)) ?? null;
  }
  async putGradeTarget(doc: LtiGradeTargetDoc) {
    this.gradeTargets.set(gradeTargetId(doc.uid, doc.assignmentId), { ...doc });
  }
  async listGradeTargetsByAssignment(assignmentId: string) {
    return [...this.gradeTargets.values()].filter((g) => g.assignmentId === assignmentId);
  }
  async getGradeLog(sessionId: string) {
    return this.gradeLog.get(sessionId) ?? null;
  }
  async putGradeLog(doc: LtiGradeLogDoc) {
    this.gradeLog.set(doc.sessionId, { ...doc });
  }
}
