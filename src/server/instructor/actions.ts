'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import {
  ENGINE_VERSION,
  SCENARIO_VERSION,
  SELECTABLE_SCENARIO_VERSIONS,
} from '@/domain/simulation';
import { getRepositories } from '@/db/repositories/firestore';
import { ROLES, type Role } from '@/db/models';
import { AuthorizationError, hasRole, requireRole } from '@/server/auth/session';
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

    await getRepositories().users.setRole(parsed.uid, parsed.role);
    revalidatePath('/admin/users');
    return { ok: true, data: {} };
  } catch (error) {
    return { ok: false, error: toError(error) };
  }
}
