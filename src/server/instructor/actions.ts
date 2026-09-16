'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import {
  ENGINE_VERSION,
  SCENARIO_VERSION,
  SELECTABLE_SCENARIO_VERSIONS,
} from '@/domain/simulation';
import { getRepositories, isUsableInviteId } from '@/db/repositories/firestore';
import { ROLES, type Role } from '@/db/models';
import { AuthorizationError, hasRole, requireRole } from '@/server/auth/session';
import { getAuthAdmin } from '@/server/auth/admin-users';
import { createAccountAdminService } from '@/server/auth/account-admin';
import { patchKeepsWindowValid } from './validation';
import type { GameErrorKey } from '@/server/game/errors';

/**
 * Instructor and admin write actions.
 *
 * Every one re-checks the role on the server. The UI hides what a user may not
 * do, but the UI is not the control: these checks are.
 */

export type StaffActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: GameErrorKey | 'invalidInput' };

function toError(error: unknown): GameErrorKey | 'invalidInput' {
  if (error instanceof AuthorizationError) return error.key;
  if (error instanceof z.ZodError) return 'invalidInput';
  console.error(
    JSON.stringify({ severity: 'ERROR', message: 'staff action failed', error: String(error) }),
  );
  return 'invalidInput';
}

/** Verifies the caller owns the course, or is an admin. */
async function requireCourseAccess(courseId: string) {
  const user = await requireRole('INSTRUCTOR');
  const course = await getRepositories().courses.get(courseId);
  if (!course) throw new AuthorizationError('forbidden');
  if (!hasRole(user.role, 'ADMIN') && course.instructorId !== user.uid) {
    throw new AuthorizationError('forbidden');
  }
  return { user, course };
}

// --- courses ---------------------------------------------------------------

const createCourseSchema = z.object({
  courseName: z.string().trim().min(1).max(120),
  semester: z.string().trim().min(1).max(40),
});

export async function createCourseAction(
  input: z.input<typeof createCourseSchema>,
): Promise<StaffActionResult<{ courseId: string }>> {
  try {
    const user = await requireRole('INSTRUCTOR');
    const parsed = createCourseSchema.parse(input);
    const course = await getRepositories().courses.create({
      ...parsed,
      instructorId: user.uid,
    });
    revalidatePath('/instructor');
    return { ok: true, data: { courseId: course.id } };
  } catch (error) {
    return { ok: false, error: toError(error) };
  }
}

const addMemberSchema = z.object({
  courseId: z.string().min(1),
  email: z.string().trim().email(),
  studentCode: z.string().trim().min(1).max(40),
});

/**
 * Adds a student to a course by email.
 *
 * The student must have signed in at least once, because enrolment is keyed by
 * their Firebase uid — there is no way to create an account on their behalf.
 */
export async function addCourseMemberAction(
  input: z.input<typeof addMemberSchema>,
): Promise<StaffActionResult<{ uid: string }>> {
  try {
    const parsed = addMemberSchema.parse(input);
    await requireCourseAccess(parsed.courseId);

    const repos = getRepositories();
    const student = await repos.users.getByEmail(parsed.email);
    if (!student) return { ok: false, error: 'memberNotFound' };

    await repos.courses.addMember({
      uid: student.uid,
      courseId: parsed.courseId,
      studentCode: parsed.studentCode,
      displayName: student.displayName,
      email: student.email,
    });

    revalidatePath(`/instructor/courses/${parsed.courseId}`);
    return { ok: true, data: { uid: student.uid } };
  } catch (error) {
    return { ok: false, error: toError(error) };
  }
}

const removeMemberSchema = z.object({
  courseId: z.string().min(1),
  uid: z.string().min(1),
});

export async function removeCourseMemberAction(
  input: z.input<typeof removeMemberSchema>,
): Promise<StaffActionResult<Record<string, never>>> {
  try {
    const parsed = removeMemberSchema.parse(input);
    await requireCourseAccess(parsed.courseId);
    await getRepositories().courses.removeMember(parsed.courseId, parsed.uid);
    revalidatePath(`/instructor/courses/${parsed.courseId}`);
    return { ok: true, data: {} };
  } catch (error) {
    return { ok: false, error: toError(error) };
  }
}

// --- assignments -----------------------------------------------------------

const createAssignmentSchema = z.object({
  courseId: z.string().min(1),
  title: z.string().trim().min(1).max(120),
  startAt: z.number().int(),
  deadline: z.number().int(),
  maxAttempts: z.number().int().min(1).max(10),
  scenarioVersion: z.enum(SELECTABLE_SCENARIO_VERSIONS as unknown as [string, ...string[]]),
  officialSeed: z.string().trim().min(3).max(80),
  isOpen: z.boolean(),
});

export async function createAssignmentAction(
  input: z.input<typeof createAssignmentSchema>,
): Promise<StaffActionResult<{ assignmentId: string }>> {
  try {
    const parsed = createAssignmentSchema.parse(input);
    const { user } = await requireCourseAccess(parsed.courseId);

    if (parsed.deadline <= parsed.startAt) return { ok: false, error: 'invalidInput' };

    const assignment = await getRepositories().assignments.create({
      courseId: parsed.courseId,
      title: parsed.title,
      startAt: parsed.startAt,
      deadline: parsed.deadline,
      maxAttempts: parsed.maxAttempts,
      scenarioVersion: parsed.scenarioVersion || SCENARIO_VERSION,
      // The engine version is recorded by the server, never chosen in the UI:
      // it identifies the code that will produce the results (spec 13.3).
      engineVersion: ENGINE_VERSION,
      officialSeed: parsed.officialSeed,
      isOpen: parsed.isOpen,
      createdBy: user.uid,
    });

    revalidatePath('/instructor');
    return { ok: true, data: { assignmentId: assignment.id } };
  } catch (error) {
    return { ok: false, error: toError(error) };
  }
}

const updateAssignmentSchema = z.object({
  assignmentId: z.string().min(1),
  title: z.string().trim().min(1).max(120).optional(),
  startAt: z.number().int().optional(),
  deadline: z.number().int().optional(),
  maxAttempts: z.number().int().min(1).max(10).optional(),
  isOpen: z.boolean().optional(),
});

/**
 * Updates an assignment's schedule and open state.
 *
 * Deliberately cannot change scenarioVersion, engineVersion or officialSeed:
 * students who already played would no longer be comparable with students who
 * play afterwards, which is exactly what spec 13.3 forbids.
 */
export async function updateAssignmentAction(
  input: z.input<typeof updateAssignmentSchema>,
): Promise<StaffActionResult<Record<string, never>>> {
  try {
    const parsed = updateAssignmentSchema.parse(input);
    const repos = getRepositories();
    const assignment = await repos.assignments.get(parsed.assignmentId);
    if (!assignment) return { ok: false, error: 'assignmentNotFound' };
    await requireCourseAccess(assignment.courseId);

    const { assignmentId, ...patch } = parsed;

    if (!patchKeepsWindowValid(assignment, patch)) {
      return { ok: false, error: 'invalidInput' };
    }

    await repos.assignments.update(assignmentId, patch);

    revalidatePath('/instructor');
    revalidatePath(`/instructor/assignments/${assignmentId}`);
    return { ok: true, data: {} };
  } catch (error) {
    return { ok: false, error: toError(error) };
  }
}

const updateCourseSchema = z.object({
  courseId: z.string().min(1),
  courseName: z.string().trim().min(1).max(120).optional(),
  semester: z.string().trim().min(1).max(40).optional(),
  enrollmentOpen: z.boolean().optional(),
});

/** Renames a course, moves its semester, or opens/closes self-enrolment. */
export async function updateCourseAction(
  input: z.input<typeof updateCourseSchema>,
): Promise<StaffActionResult<Record<string, never>>> {
  try {
    const parsed = updateCourseSchema.parse(input);
    await requireCourseAccess(parsed.courseId);

    const { courseId, ...patch } = parsed;
    await getRepositories().courses.update(courseId, patch);

    revalidatePath('/instructor');
    revalidatePath(`/instructor/courses/${courseId}`);
    revalidatePath('/join');
    return { ok: true, data: {} };
  } catch (error) {
    return { ok: false, error: toError(error) };
  }
}

const archiveCourseSchema = z.object({
  courseId: z.string().min(1),
  archived: z.boolean(),
});

/**
 * Archives or restores a course.
 *
 * Nothing is deleted. Grades, sessions and quarters are untouched, and the
 * leaderboard and CSV export do not consult a course at all — they read graded
 * results by assignment. Archiving only removes the course from the lists.
 */
export async function setCourseArchivedAction(
  input: z.input<typeof archiveCourseSchema>,
): Promise<StaffActionResult<Record<string, never>>> {
  try {
    const parsed = archiveCourseSchema.parse(input);
    await requireCourseAccess(parsed.courseId);

    await getRepositories().courses.setArchived(
      parsed.courseId,
      parsed.archived ? Date.now() : null,
    );

    revalidatePath('/instructor');
    revalidatePath(`/instructor/courses/${parsed.courseId}`);
    revalidatePath('/join');
    return { ok: true, data: {} };
  } catch (error) {
    return { ok: false, error: toError(error) };
  }
}

const updateMemberSchema = z.object({
  courseId: z.string().min(1),
  uid: z.string().min(1),
  studentCode: z.string().trim().min(1).max(40),
});

/** Corrects a student code a student typed for themselves. */
export async function updateCourseMemberAction(
  input: z.input<typeof updateMemberSchema>,
): Promise<StaffActionResult<Record<string, never>>> {
  try {
    const parsed = updateMemberSchema.parse(input);
    await requireCourseAccess(parsed.courseId);

    const result = await getRepositories().courses.updateMember(parsed.courseId, parsed.uid, {
      studentCode: parsed.studentCode,
    });
    if (!result.ok) {
      return {
        ok: false,
        error: result.reason === 'CODE_TAKEN' ? 'studentCodeTaken' : 'memberNotFound',
      };
    }

    revalidatePath(`/instructor/courses/${parsed.courseId}`);
    return { ok: true, data: {} };
  } catch (error) {
    return { ok: false, error: toError(error) };
  }
}

const setMemberRemovedSchema = z.object({
  courseId: z.string().min(1),
  uid: z.string().min(1),
  removed: z.boolean(),
});

/**
 * Removes a student from a course roster, or puts them back.
 *
 * A mark, not a delete: a student who already played has to keep appearing in
 * the participation view, or it would contradict the leaderboard, which reads
 * graded results and never looks at a roster.
 */
export async function setCourseMemberRemovedAction(
  input: z.input<typeof setMemberRemovedSchema>,
): Promise<StaffActionResult<Record<string, never>>> {
  try {
    const parsed = setMemberRemovedSchema.parse(input);
    await requireCourseAccess(parsed.courseId);

    await getRepositories().courses.setMemberRemoved(
      parsed.courseId,
      parsed.uid,
      parsed.removed ? Date.now() : null,
    );

    revalidatePath(`/instructor/courses/${parsed.courseId}`);
    return { ok: true, data: {} };
  } catch (error) {
    return { ok: false, error: toError(error) };
  }
}

const archiveAssignmentSchema = z.object({
  assignmentId: z.string().min(1),
  archived: z.boolean(),
});

export async function setAssignmentArchivedAction(
  input: z.input<typeof archiveAssignmentSchema>,
): Promise<StaffActionResult<Record<string, never>>> {
  try {
    const parsed = archiveAssignmentSchema.parse(input);
    const repos = getRepositories();
    const assignment = await repos.assignments.get(parsed.assignmentId);
    if (!assignment) return { ok: false, error: 'assignmentNotFound' };
    await requireCourseAccess(assignment.courseId);

    await repos.assignments.setArchived(
      parsed.assignmentId,
      parsed.archived ? Date.now() : null,
    );

    revalidatePath('/instructor');
    revalidatePath(`/instructor/courses/${assignment.courseId}`);
    revalidatePath(`/instructor/assignments/${parsed.assignmentId}`);
    return { ok: true, data: {} };
  } catch (error) {
    return { ok: false, error: toError(error) };
  }
}

// --- admin -----------------------------------------------------------------

const setRoleSchema = z.object({
  uid: z.string().min(1),
  role: z.enum(ROLES as unknown as [Role, ...Role[]]),
});

export async function setUserRoleAction(
  input: z.input<typeof setRoleSchema>,
): Promise<StaffActionResult<Record<string, never>>> {
  try {
    const admin = await requireRole('ADMIN');
    const parsed = setRoleSchema.parse(input);

    // Guard against an admin locking themselves out of the only admin account.
    if (parsed.uid === admin.uid && parsed.role !== 'ADMIN') {
      return { ok: false, error: 'cannotDemoteSelf' };
    }

    const repos = getRepositories();
    await repos.users.setRole(parsed.uid, parsed.role);

    // Drop any invite for this address. An invite only applies to a brand-new
    // account, so a leftover one cannot re-promote this person today — but it
    // would if the account were ever deleted and recreated, and a revoked role
    // that quietly returns is the kind of surprise worth designing out.
    const target = await repos.users.get(parsed.uid);
    if (target) await repos.roleInvites.remove(target.email);

    revalidatePath('/admin');
    revalidatePath('/admin/users');
    return { ok: true, data: {} };
  } catch (error) {
    return { ok: false, error: toError(error) };
  }
}

const archiveUserSchema = z.object({
  uid: z.string().min(1),
  archived: z.boolean(),
});

/**
 * Disables or re-enables an account.
 *
 * Deliberately does NOT block sign-in: someone disabled by mistake in the
 * middle of an exam would otherwise lose access to a game already in progress.
 * It removes them from the user list, and nothing else — every graded result
 * they hold is untouched.
 */
export async function setUserArchivedAction(
  input: z.input<typeof archiveUserSchema>,
): Promise<StaffActionResult<Record<string, never>>> {
  try {
    const admin = await requireRole('ADMIN');
    const parsed = archiveUserSchema.parse(input);

    if (parsed.uid === admin.uid && parsed.archived) {
      return { ok: false, error: 'cannotDemoteSelf' };
    }

    await getRepositories().users.setArchived(parsed.uid, parsed.archived ? Date.now() : null);
    revalidatePath('/admin');
    revalidatePath('/admin/users');
    return { ok: true, data: {} };
  } catch (error) {
    return { ok: false, error: toError(error) };
  }
}

const inviteSchema = z.object({
  email: z.string().trim().email().max(320),
  role: z.enum(ROLES as unknown as [Role, ...Role[]]),
});

/**
 * Grants a role to an email before that person has ever signed in.
 *
 * This removes the trap that made setup awkward: an instructor previously had
 * to sign in once so an admin could find them and promote them, and until then
 * nobody could tell them apart from a student.
 */
export async function inviteRoleAction(
  input: z.input<typeof inviteSchema>,
): Promise<StaffActionResult<Record<string, never>>> {
  try {
    const admin = await requireRole('ADMIN');
    const parsed = inviteSchema.parse(input);
    const email = parsed.email.toLowerCase();

    // The email is the document id, so reject anything Firestore cannot store
    // here rather than discovering it at the person's first sign-in.
    if (!isUsableInviteId(email)) return { ok: false, error: 'invalidInput' };

    const repos = getRepositories();

    // An account that already exists is changed through setUserRoleAction, not
    // by an invite that would never be read.
    const existing = await repos.users.getByEmail(email);
    if (existing) {
      await repos.users.setRole(existing.uid, parsed.role);
    } else {
      await repos.roleInvites.put({
        email,
        role: parsed.role,
        createdBy: admin.uid,
        createdAt: Date.now(),
      });
    }

    revalidatePath('/admin');
    revalidatePath('/admin/users');
    return { ok: true, data: {} };
  } catch (error) {
    return { ok: false, error: toError(error) };
  }
}

const revokeInviteSchema = z.object({ email: z.string().trim().email() });

export async function revokeRoleInviteAction(
  input: z.input<typeof revokeInviteSchema>,
): Promise<StaffActionResult<Record<string, never>>> {
  try {
    await requireRole('ADMIN');
    const parsed = revokeInviteSchema.parse(input);
    await getRepositories().roleInvites.remove(parsed.email.toLowerCase());
    revalidatePath('/admin');
    revalidatePath('/admin/users');
    return { ok: true, data: {} };
  } catch (error) {
    return { ok: false, error: toError(error) };
  }
}

const transferCourseSchema = z.object({
  courseId: z.string().min(1),
  instructorId: z.string().min(1),
});

/** Moves a course to another instructor. Admin only. */
export async function transferCourseAction(
  input: z.input<typeof transferCourseSchema>,
): Promise<StaffActionResult<Record<string, never>>> {
  try {
    await requireRole('ADMIN');
    const parsed = transferCourseSchema.parse(input);

    const repos = getRepositories();
    const target = await repos.users.get(parsed.instructorId);
    if (!target) return { ok: false, error: 'memberNotFound' };
    // Handing a course to a student would leave it unreachable by its owner.
    if (!hasRole(target.role, 'INSTRUCTOR')) return { ok: false, error: 'invalidInput' };

    await repos.courses.update(parsed.courseId, { instructorId: parsed.instructorId });
    revalidatePath('/admin');
    revalidatePath('/instructor');
    revalidatePath(`/instructor/courses/${parsed.courseId}`);
    return { ok: true, data: {} };
  } catch (error) {
    return { ok: false, error: toError(error) };
  }
}

// --- accounts and passwords -------------------------------------------------
//
// Thin wrappers. Everything that can be wrong lives in AccountAdminService,
// where it is testable; these only authenticate, validate and delegate.
//
// They deliberately do NOT pass a caught error to `toError`. That helper logs
// `String(error)`, and an Admin SDK error can carry the request that produced
// it — which here would be a plaintext password. Failures are logged as a code
// and nothing else.

/** Logs a stable code. Never the error object, never the input. */
function logAuthFailure(operation: string, error: unknown): void {
  const code = (error as { code?: unknown } | null)?.code;
  console.error(
    JSON.stringify({
      severity: 'ERROR',
      message: 'auth admin operation failed',
      operation,
      code: typeof code === 'string' ? code : 'unknown',
    }),
  );
}

function accounts() {
  return createAccountAdminService(getRepositories(), getAuthAdmin());
}

const createUserSchema = z.object({
  email: z.string().trim().email().max(320),
  displayName: z.string().trim().min(1).max(80),
  role: z.enum(ROLES as unknown as [Role, ...Role[]]),
  // Firebase accepts six characters. An administrator handing out a password
  // should clear more than the floor.
  password: z.string().min(8).max(128),
});

export async function createUserAction(
  input: z.input<typeof createUserSchema>,
): Promise<StaffActionResult<{ uid: string; adopted: boolean }>> {
  let parsed;
  try {
    await requireRole('ADMIN');
    parsed = createUserSchema.parse(input);
  } catch (error) {
    return { ok: false, error: toError(error) };
  }

  try {
    const result = await accounts().createAccount(parsed);
    if (result.ok) {
      revalidatePath('/admin');
      revalidatePath('/admin/users');
    }
    return result;
  } catch (error) {
    logAuthFailure('createAccount', error);
    return { ok: false, error: 'authOperationFailed' };
  }
}

const setPasswordSchema = z.object({
  uid: z.string().min(1),
  password: z.string().min(8).max(128),
  /** Set once the admin has acknowledged this account signs in with Google. */
  confirmNoPassword: z.boolean().optional(),
});

export async function setUserPasswordAction(
  input: z.input<typeof setPasswordSchema>,
): Promise<StaffActionResult<Record<string, never>>> {
  let admin;
  let parsed;
  try {
    admin = await requireRole('ADMIN');
    parsed = setPasswordSchema.parse(input);
  } catch (error) {
    return { ok: false, error: toError(error) };
  }

  try {
    const result = await accounts().setPassword({ ...parsed, byUid: admin.uid });
    if (result.ok) revalidatePath('/admin/users');
    return result;
  } catch (error) {
    logAuthFailure('setPassword', error);
    return { ok: false, error: 'authOperationFailed' };
  }
}

const resetLinkSchema = z.object({ uid: z.string().min(1) });

export async function passwordResetLinkAction(
  input: z.input<typeof resetLinkSchema>,
): Promise<StaffActionResult<{ link: string }>> {
  let parsed;
  try {
    await requireRole('ADMIN');
    parsed = resetLinkSchema.parse(input);
  } catch (error) {
    return { ok: false, error: toError(error) };
  }

  try {
    return await accounts().resetLink(parsed.uid);
  } catch (error) {
    logAuthFailure('passwordResetLink', error);
    return { ok: false, error: 'authOperationFailed' };
  }
}
