'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { getRepositories } from '@/db/repositories/firestore';
import { requireRole } from '@/server/auth/session';
import { LtiError, type LtiErrorCode } from './service';
import { getLtiService, isLtiEnabled } from './runtime';

type LtiActionResult<T> = { ok: true; data: T } | { ok: false; error: LtiErrorCode | 'generic' };

function toError(error: unknown): LtiErrorCode | 'generic' {
  if (error instanceof LtiError) return error.code;
  console.error(JSON.stringify({ severity: 'ERROR', message: 'lti action failed', error: String(error) }));
  return 'generic';
}

const keySchema = z.object({ key: z.string().min(8).max(80) });
const newSchema = keySchema.extend({ mode: z.enum(['SOLO', 'GROUP']).optional() });

/**
 * Creates a course + assignment for the pending LMS activity and links it.
 * `GROUP` = industry competition: one company per student, six per industry.
 */
export async function linkNewAssignmentAction(
  input: z.input<typeof newSchema>,
): Promise<LtiActionResult<{ assignmentId: string }>> {
  try {
    if (!isLtiEnabled()) return { ok: false, error: 'notConfigured' };
    const user = await requireRole('INSTRUCTOR');
    const { key, mode } = newSchema.parse(input);
    const assignmentId = await getLtiService().linkNew(key, user, mode ?? 'SOLO');
    revalidatePath('/instructor');
    return { ok: true, data: { assignmentId } };
  } catch (error) {
    return { ok: false, error: toError(error) };
  }
}

const existingSchema = keySchema.extend({ assignmentId: z.string().min(1) });

/** Links the pending LMS activity to one of the instructor's assignments. */
export async function linkExistingAssignmentAction(
  input: z.input<typeof existingSchema>,
): Promise<LtiActionResult<{ assignmentId: string }>> {
  try {
    if (!isLtiEnabled()) return { ok: false, error: 'notConfigured' };
    const user = await requireRole('INSTRUCTOR');
    const { key, assignmentId } = existingSchema.parse(input);
    await getLtiService().linkExisting(key, user, assignmentId);
    revalidatePath(`/instructor/assignments/${assignmentId}`);
    return { ok: true, data: { assignmentId } };
  } catch (error) {
    return { ok: false, error: toError(error) };
  }
}

const sendSchema = z.object({ assignmentId: z.string().min(1) });

/** Sends every student's best official score to the linked LMS gradebook column(s). */
export async function sendClassGradesAction(
  input: z.input<typeof sendSchema>,
): Promise<LtiActionResult<{ rows: number; failed: string[] }>> {
  try {
    if (!isLtiEnabled()) return { ok: false, error: 'notConfigured' };
    const user = await requireRole('INSTRUCTOR');
    const { assignmentId } = sendSchema.parse(input);

    const repos = getRepositories();
    const assignment = await repos.assignments.get(assignmentId);
    const course = assignment ? await repos.courses.get(assignment.courseId) : null;
    if (!assignment || !course) return { ok: false, error: 'assignmentNotFound' };
    if (course.instructorId !== user.uid && user.role !== 'ADMIN') return { ok: false, error: 'forbidden' };

    const { rows, results } = await getLtiService().sendClassGrades(assignmentId);
    const failed = results.filter((r) => 'error' in r).map((r) => String(r.error));
    return { ok: true, data: { rows, failed } };
  } catch (error) {
    return { ok: false, error: toError(error) };
  }
}
