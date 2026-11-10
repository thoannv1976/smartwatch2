/**
 * LMS connection through UniGame Hub (LTI 1.3).
 *
 * Flow: Moodle → Hub → https://<app>/lti-launch#ticket=… → POST /api/lti/launch.
 *
 * - The ticket is verified against the Hub's public keys and can be used once.
 * - The LMS user is matched to an app account: first by the Hub user id seen
 *   before, then by e-mail, otherwise a new account is created. They are then
 *   signed in with a Firebase custom token, through the normal session route.
 * - Each LMS activity is linked to ONE assignment. The first instructor to open
 *   an unlinked activity chooses (or creates) the assignment.
 * - A student who opens a linked activity is put on the course roster (student
 *   code = LMS username) and sent straight to the assignment.
 * - Official results are sent to the LMS gradebook when a game finishes; the
 *   instructor can also send the whole class at once.
 *
 * No role above INSTRUCTOR is ever granted from the LMS, and an existing role is
 * never lowered.
 */
import { createHash } from 'node:crypto';
import {
  ARENA_SCENARIO_VERSION,
  ENGINE_VERSION,
  OFFICIAL_SEED_EXAMPLE,
  SCENARIO_VERSION,
} from '@/domain/simulation';
import { ROLES, assignmentMode, assignmentSeating, isArchived, type Role, type UserDoc } from '@/db/models';
import { GroupService } from '@/server/group/service';
import type { Repositories } from '@/db/repositories/types';
import type { BulkResponse, LaunchContext, ResultInput, BulkInput, SubmitResponse } from './hub-sdk';
import { linkKey, type LtiActivityRef, type LtiStore } from './store';

export const LTI_MAX_SCORE = 100;
const PENDING_TTL_MS = 2 * 60 * 60 * 1000;
const NEW_ASSIGNMENT_DAYS = 120;

export type LtiErrorCode =
  | 'notConfigured'
  | 'ticketInvalid'
  | 'tenantNotAllowed'
  | 'noContext'
  | 'notLinked'
  | 'linkExpired'
  | 'forbidden'
  | 'assignmentNotFound';

export class LtiError extends Error {
  constructor(
    public readonly code: LtiErrorCode,
    public readonly status: number,
  ) {
    super(code);
  }
}

/** The Firebase Auth operations the launch needs. */
export interface LtiIdentity {
  findUidByEmail(email: string): Promise<string | null>;
  userExists(uid: string): Promise<boolean>;
  /** Creates an account with no password (sign-in only through the LMS or a reset link). */
  createUser(input: { email: string; displayName: string }): Promise<string>;
  createCustomToken(uid: string): Promise<string>;
}

/** Hub calls, injectable so tests need no network. */
export interface LtiHubClient {
  submitResult(r: ResultInput): Promise<SubmitResponse>;
  submitBulkResult(b: BulkInput): Promise<BulkResponse>;
}

export interface LtiDeps {
  repos: Repositories;
  store: LtiStore;
  identity: LtiIdentity;
  hub: LtiHubClient | null;
  /** Allowed Hub tenant ids; empty = any. */
  tenants: string[];
  now?: () => number;
}

const norm = (v?: string | null) => (v ?? '').trim().toLowerCase();
const atLeast = (role: Role, minimum: Role) => ROLES.indexOf(role) >= ROLES.indexOf(minimum);

function displayNameOf(ctx: LaunchContext): string {
  return (
    ctx.name ||
    [ctx.givenName, ctx.familyName].filter(Boolean).join(' ') ||
    ctx.username ||
    ctx.email?.split('@')[0] ||
    'Moodle user'
  );
}

/** An address for an LMS user who shares no e-mail. `.invalid` can never be delivered. */
function placeholderEmail(ctx: LaunchContext): string {
  const id = createHash('sha256').update(ctx.hubUserId).digest('hex').slice(0, 16);
  return `lti-${id}@lti.invalid`;
}

export function activityRef(ctx: LaunchContext): LtiActivityRef | null {
  if (!ctx.context?.id || !ctx.resourceLink?.id) return null;
  return {
    key: linkKey({
      tenantId: ctx.tenantId,
      issuer: ctx.platform.issuer,
      contextId: ctx.context.id,
      resourceLinkId: ctx.resourceLink.id,
    }),
    tenantId: ctx.tenantId,
    issuer: ctx.platform.issuer,
    contextId: ctx.context.id,
    resourceLinkId: ctx.resourceLink.id,
    contextTitle: ctx.context.title ?? null,
    contextLabel: ctx.context.label ?? null,
    resourceTitle: ctx.resourceLink.title ?? null,
    linkTarget: ctx.linkTarget ?? null,
  };
}

export function createLtiService(deps: LtiDeps) {
  const { repos, store, identity } = deps;
  const now = deps.now ?? Date.now;

  /** Finds or creates the app account for this LMS user, with the right role. */
  async function resolveAccount(ctx: LaunchContext): Promise<UserDoc> {
    let uid: string | null = null;

    const known = await store.getUser(ctx.hubUserId);
    if (known && (await identity.userExists(known.uid))) uid = known.uid;

    const email = norm(ctx.email);
    if (!uid && email) uid = await identity.findUidByEmail(email);

    const name = displayNameOf(ctx);
    if (!uid) uid = await identity.createUser({ email: email || placeholderEmail(ctx), displayName: name });

    const existing = await repos.users.get(uid);
    const wanted = ctx.role === 'instructor' ? 'INSTRUCTOR' : 'STUDENT';
    let user: UserDoc;
    if (!existing) {
      user = await repos.users.upsert({
        uid,
        email: email || placeholderEmail(ctx),
        displayName: name,
        role: wanted,
      });
    } else {
      user = existing;
      // Promote a student whom the LMS says teaches this course; never demote,
      // and never grant ADMIN.
      if (wanted === 'INSTRUCTOR' && !atLeast(existing.role, 'INSTRUCTOR')) {
        await repos.users.setRole(uid, 'INSTRUCTOR');
        user = { ...existing, role: 'INSTRUCTOR' };
      }
    }

    await store.putUser({
      hubUserId: ctx.hubUserId,
      uid,
      tenantId: ctx.tenantId,
      username: ctx.username ?? null,
      email: email || null,
      role: ctx.role,
      updatedAt: now(),
    });
    return user;
  }

  /** Puts a student on the course roster, using the LMS username as student code. */
  async function ensureMember(user: UserDoc, courseId: string, ctx: LaunchContext): Promise<void> {
    const existing = await repos.courses.getMember(courseId, user.uid);
    if (existing) {
      if (existing.removedAt) await repos.courses.setMemberRemoved(courseId, user.uid, null);
      return;
    }
    const base = (ctx.username || user.email.split('@')[0] || `moodle-${ctx.hubUserId.slice(0, 6)}`).slice(0, 40);
    for (const code of [base, `${base}-${ctx.hubUserId.slice(0, 4)}`]) {
      const outcome = await repos.courses.selfEnroll({
        uid: user.uid,
        courseId,
        studentCode: code,
        displayName: user.displayName,
        email: user.email,
      });
      if (outcome.status !== 'CODE_TAKEN') return;
    }
  }

  /** Where a student should land for this assignment. */
  async function studentDestination(user: UserDoc, assignmentId: string): Promise<string> {
    const uid = user.uid;
    const assignment = await repos.assignments.get(assignmentId);
    if (!assignment) return '/home';
    if (assignmentMode(assignment) === 'GROUP') return groupDestination(user, assignment);

    const sessions = (await repos.sessions.listByUser(uid, 50)).filter(
      (s) => s.assignmentId === assignmentId && s.mode === 'OFFICIAL',
    );
    const inProgress = sessions.find((s) => s.status === 'IN_PROGRESS');
    if (inProgress) return `/game/${inProgress.id}`;

    const t = now();
    const used = await repos.sessions.countAttempts(uid, assignmentId);
    const open = assignment.isOpen && t >= assignment.startAt && t <= assignment.deadline;
    if (open && used < assignment.maxAttempts) {
      return `/new-game?mode=OFFICIAL&assignmentId=${encodeURIComponent(assignmentId)}`;
    }
    const latest = sessions
      .filter((s) => s.status === 'COMPLETED')
      .sort((a, b) => (b.completedAt ?? 0) - (a.completedAt ?? 0))[0];
    return latest ? `/report/${latest.id}` : '/home';
  }

  /**
   * Group assignment: straight into the student's industry. With automatic
   * seating a student who has no seat yet is given one first; with join codes
   * they land on the code form.
   */
  async function groupDestination(
    user: UserDoc,
    assignment: NonNullable<Awaited<ReturnType<typeof repos.assignments.get>>>,
  ): Promise<string> {
    const groups = new GroupService(repos);
    const member = await groups.findMembership(assignment.id, user.uid);
    if (member) return `/group/${member.groupId}`;
    const t = now();
    const open = !isArchived(assignment) && assignment.isOpen && t >= assignment.startAt && t <= assignment.deadline;
    if (!open) return '/home';
    if (assignmentSeating(assignment) !== 'AUTO') return '/group/join';
    try {
      const seat = await groups.autoSeat({
        assignmentId: assignment.id,
        uid: user.uid,
        displayName: user.displayName,
        email: user.email,
      });
      return `/group/${seat.groupId}`;
    } catch {
      // The home page explains why (closed, full…) better than a launch error would.
      return '/home';
    }
  }

  return {
    /** Handles a verified launch. Returns a sign-in token and where to go next. */
    async launch(ctx: LaunchContext): Promise<{ customToken: string; next: string }> {
      if (deps.tenants.length && !deps.tenants.includes(ctx.tenantId)) {
        throw new LtiError('tenantNotAllowed', 403);
      }
      const ref = activityRef(ctx);
      if (!ref) throw new LtiError('noContext', 400);

      const link = await store.getLink(ref.key);
      // A learner on an activity nobody has linked yet is refused BEFORE any
      // account is created for them.
      if (!link && ctx.role !== 'instructor') throw new LtiError('notLinked', 409);

      const user = await resolveAccount(ctx);
      let next: string;

      if (ctx.role === 'instructor') {
        if (link) {
          if (ref.linkTarget && link.linkTarget !== ref.linkTarget) {
            await store.putLink({ ...link, linkTarget: ref.linkTarget });
          }
          next = `/instructor/assignments/${link.assignmentId}`;
        } else {
          const previous = await store.getPending(ref.key);
          await store.putPending({
            ...ref,
            linkTarget: ref.linkTarget ?? previous?.linkTarget ?? null,
            hubUserId: ctx.hubUserId,
            uid: user.uid,
            expiresAt: now() + PENDING_TTL_MS,
          });
          next = `/lti/link?key=${ref.key}`;
        }
      } else {
        const assignment = await repos.assignments.get(link!.assignmentId);
        if (!assignment) throw new LtiError('assignmentNotFound', 404);
        await ensureMember(user, assignment.courseId, ctx);
        if (ctx.gradeTarget) {
          await store.putGradeTarget({
            uid: user.uid,
            assignmentId: assignment.id,
            hubUserId: ctx.hubUserId,
            gradeTarget: ctx.gradeTarget,
            updatedAt: now(),
          });
        }
        next = await studentDestination(user, assignment.id);
      }

      return { customToken: await identity.createCustomToken(user.uid), next };
    },

    /** The pending link an instructor is about to complete, if it is theirs and fresh. */
    async pendingFor(key: string, user: UserDoc) {
      const pending = await store.getPending(key);
      if (!pending || pending.expiresAt < now()) throw new LtiError('linkExpired', 410);
      if (pending.uid !== user.uid && user.role !== 'ADMIN') throw new LtiError('forbidden', 403);
      return pending;
    },

    /** Assignments the instructor may link an activity to (their own courses; all for admin). */
    async linkableAssignments(user: UserDoc) {
      const courses =
        user.role === 'ADMIN' ? await repos.courses.listAll() : await repos.courses.listByInstructor(user.uid);
      const live = courses.filter((c) => !isArchived(c));
      const assignments = await repos.assignments.listByCourses(live.map((c) => c.id));
      const byCourse = new Map(live.map((c) => [c.id, c]));
      return assignments
        .filter((a) => !isArchived(a))
        .map((a) => ({ assignment: a, course: byCourse.get(a.courseId)! }))
        .filter((x) => x.course);
    },

    /**
     * Creates a course + one official assignment for the activity, and links them.
     * `GROUP` makes an industry competition: arena scenario, automatic seating.
     */
    async linkNew(key: string, user: UserDoc, mode: 'SOLO' | 'GROUP' = 'SOLO'): Promise<string> {
      const pending = await this.pendingFor(key, user);
      const t = now();
      const course = await repos.courses.create({
        courseName: pending.contextTitle || pending.contextLabel || 'Moodle',
        semester: pending.contextLabel || String(new Date(t).getFullYear()),
        instructorId: user.uid,
        enrollmentOpen: false,
      });
      const assignment = await repos.assignments.create({
        courseId: course.id,
        title: pending.resourceTitle || pending.contextTitle || 'Smartwatch CEO Challenge',
        startAt: t,
        deadline: t + NEW_ASSIGNMENT_DAYS * 86_400_000,
        maxAttempts: 1,
        // Six humans need the arena scenario, where every seat starts equal.
        scenarioVersion: mode === 'GROUP' ? ARENA_SCENARIO_VERSION : SCENARIO_VERSION,
        engineVersion: ENGINE_VERSION,
        officialSeed: OFFICIAL_SEED_EXAMPLE,
        isOpen: true,
        createdBy: user.uid,
        mode,
        ...(mode === 'GROUP' ? { seating: 'AUTO' as const } : {}),
      });
      await this.saveLink(pending, assignment.id, course.id, user.uid);
      return assignment.id;
    },

    /** Links the activity to an assignment the instructor already has. */
    async linkExisting(key: string, user: UserDoc, assignmentId: string): Promise<string> {
      const pending = await this.pendingFor(key, user);
      const allowed = await this.linkableAssignments(user);
      const match = allowed.find((x) => x.assignment.id === assignmentId);
      if (!match) throw new LtiError('forbidden', 403);
      await this.saveLink(pending, assignmentId, match.course.id, user.uid);
      return assignmentId;
    },

    async saveLink(ref: LtiActivityRef, assignmentId: string, courseId: string, uid: string) {
      await store.putLink({
        key: ref.key,
        tenantId: ref.tenantId,
        issuer: ref.issuer,
        contextId: ref.contextId,
        resourceLinkId: ref.resourceLinkId,
        contextTitle: ref.contextTitle,
        contextLabel: ref.contextLabel,
        resourceTitle: ref.resourceTitle,
        linkTarget: ref.linkTarget,
        assignmentId,
        courseId,
        linkedBy: uid,
        linkedAt: now(),
      });
      await store.deletePending(ref.key);
    },

    /** LMS activities linked to an assignment. */
    async linksForAssignment(assignmentId: string) {
      return store.listLinksByAssignment(assignmentId);
    },

    /**
     * Sends one finished official game to the LMS gradebook, if the student
     * opened this assignment from the LMS. Sends each score once.
     */
    async sendGradeForSession(sessionId: string): Promise<{ sent: boolean; status?: string }> {
      if (!deps.hub) return { sent: false };
      const result = await repos.finalResults.get(sessionId);
      if (!result || result.mode !== 'OFFICIAL' || !result.assignmentId) return { sent: false };
      const target = await store.getGradeTarget(result.userId, result.assignmentId);
      if (!target) return { sent: false };

      const score = Math.round(result.finalScore * 100) / 100;
      const previous = await store.getGradeLog(sessionId);
      if (previous && previous.score === score && previous.status !== 'error') {
        return { sent: false, status: previous.status };
      }
      try {
        const response = await deps.hub.submitResult({
          gradeTarget: target.gradeTarget,
          attemptId: sessionId,
          score,
          maxScore: LTI_MAX_SCORE,
          occurredAt: new Date(result.completedAt).toISOString(),
          comment: `Smartwatch CEO Challenge – ${result.companyName}: ${score}/100`,
        });
        await store.putGradeLog({
          sessionId,
          uid: result.userId,
          assignmentId: result.assignmentId,
          score,
          status: response.status,
          sentAt: now(),
          error: null,
        });
        return { sent: true, status: response.status };
      } catch (error) {
        await store.putGradeLog({
          sessionId,
          uid: result.userId,
          assignmentId: result.assignmentId,
          score,
          status: 'error',
          sentAt: now(),
          error: String((error as Error)?.message ?? error).slice(0, 300),
        });
        throw error;
      }
    },

    /**
     * Sends every student's best official score for an assignment to each linked
     * LMS activity that has a gradebook column.
     */
    async sendClassGrades(assignmentId: string) {
      if (!deps.hub) throw new LtiError('notConfigured', 400);
      const links = (await store.listLinksByAssignment(assignmentId)).filter((l) => l.linkTarget);
      if (!links.length) return { rows: 0, results: [] as Array<Record<string, unknown>> };

      const results = (await repos.finalResults.listByAssignment(assignmentId)).filter(
        (r) => r.mode === 'OFFICIAL',
      );
      const best = new Map<string, (typeof results)[number]>();
      for (const r of results) {
        const current = best.get(r.userId);
        if (!current || r.finalScore > current.finalScore) best.set(r.userId, r);
      }
      const targets = new Map(
        (await store.listGradeTargetsByAssignment(assignmentId)).map((g) => [g.uid, g]),
      );
      const assignment = await repos.assignments.get(assignmentId);

      const rows = [];
      let latest = 0;
      for (const r of best.values()) {
        const member = assignment ? await repos.courses.getMember(assignment.courseId, r.userId) : null;
        const ltiUser = targets.get(r.userId);
        rows.push({
          ...(ltiUser ? { hubUserId: ltiUser.hubUserId } : {}),
          ...(member?.studentCode || r.studentCode ? { username: member?.studentCode ?? r.studentCode! } : {}),
          ...(r.email && !r.email.endsWith('.invalid') ? { email: r.email } : {}),
          score: Math.round(r.finalScore * 100) / 100,
        });
        latest = Math.max(latest, r.completedAt);
      }
      if (!rows.length) return { rows: 0, results: [] };

      const batchId = createHash('sha256')
        .update(JSON.stringify({ assignmentId, rows }))
        .digest('hex')
        .slice(0, 32);
      const out: Array<Record<string, unknown>> = [];
      for (const link of links) {
        try {
          const response = await deps.hub.submitBulkResult({
            linkTarget: link.linkTarget!,
            batchId,
            maxScore: LTI_MAX_SCORE,
            occurredAt: new Date(latest || now()).toISOString(),
            rows,
          });
          out.push({ activity: link.resourceTitle || link.contextTitle, ...response });
        } catch (error) {
          out.push({ activity: link.resourceTitle || link.contextTitle, error: String((error as Error)?.message ?? error) });
        }
      }
      return { rows: rows.length, results: out };
    },
  };
}

export type LtiService = ReturnType<typeof createLtiService>;
