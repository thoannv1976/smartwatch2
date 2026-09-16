'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import {
  POSITIONINGS,
  getGameConfig,
  type GoldenStrategy,
  type HindsightQuarter,
} from '@/domain/simulation';
import { getRepositories } from '@/db/repositories/firestore';
import { AuthorizationError, requireUser } from '@/server/auth/session';
import { GameError, type GameErrorKey } from './errors';
import { createEnrollmentService } from './enrollment';
import { createGameService } from './service';

/**
 * Server actions used by the student screens.
 *
 * These are the only write paths a browser can reach. Each one authenticates,
 * validates with zod, and delegates to the service, which owns all authorisation
 * and simulation. Failures come back as a dictionary key so the UI renders them
 * in the user's language instead of leaking an internal message.
 */

export type ActionResult<T> = { ok: true; data: T } | { ok: false; error: GameErrorKey };

function toError(error: unknown): GameErrorKey {
  if (error instanceof GameError) return error.key;
  if (error instanceof AuthorizationError) return error.key;
  console.error(
    JSON.stringify({ severity: 'ERROR', message: 'game action failed', error: String(error) }),
  );
  return 'sessionNotFound';
}

const createSessionSchema = z.object({
  mode: z.enum(['PRACTICE', 'OFFICIAL']),
  assignmentId: z.string().min(1).nullable(),
  companyName: z.string().trim().min(1).max(60),
  productName: z.string().trim().min(1).max(60),
  positioning: z.enum(POSITIONINGS as unknown as [string, ...string[]]),
});

export async function createSessionAction(
  input: z.input<typeof createSessionSchema>,
): Promise<ActionResult<{ sessionId: string }>> {
  try {
    const user = await requireUser();
    const parsed = createSessionSchema.parse(input);
    const service = createGameService(getRepositories());

    const session = await service.createSession({
      userId: user.uid,
      displayName: user.displayName,
      email: user.email,
      mode: parsed.mode,
      assignmentId: parsed.mode === 'OFFICIAL' ? parsed.assignmentId : null,
      companyName: parsed.companyName,
      productName: parsed.productName,
      positioning: parsed.positioning as (typeof POSITIONINGS)[number],
    });

    revalidatePath('/home');
    return { ok: true, data: { sessionId: session.id } };
  } catch (error) {
    return { ok: false, error: toError(error) };
  }
}

const submitSchema = z.object({
  sessionId: z.string().min(1),
  quarter: z.number().int().min(1).max(24),
  decision: z.object({
    productPoints: z.number().int().min(0).max(100),
    technologyPoints: z.number().int().min(0).max(100),
    marketingPoints: z.number().int().min(0).max(100),
    distributionPoints: z.number().int().min(0).max(100),
    cxPoints: z.number().int().min(0).max(100),
    priceIndex: z.number().int().min(80).max(120),
  }),
});

/**
 * Submits one quarter's decision.
 *
 * The browser never sends a result, only a decision — every KPI in the response
 * was computed and persisted on the server first (spec 13.1). Re-submitting an
 * already processed quarter returns the stored result with `replayed: true`
 * rather than simulating again (spec 13.2).
 */
export async function submitQuarterAction(
  input: z.input<typeof submitSchema>,
): Promise<ActionResult<{ quarter: number; replayed: boolean; completed: boolean }>> {
  try {
    const user = await requireUser();
    const parsed = submitSchema.parse(input);
    const service = createGameService(getRepositories());

    const result = await service.submitQuarter(
      parsed.sessionId,
      user.uid,
      parsed.quarter,
      parsed.decision,
    );

    const config = getGameConfig(result.session.scenarioVersion);
    revalidatePath(`/game/${parsed.sessionId}`);

    return {
      ok: true,
      data: {
        quarter: result.quarter.quarter,
        replayed: result.replayed,
        completed: result.quarter.quarter >= config.quarters,
      },
    };
  } catch (error) {
    return { ok: false, error: toError(error) };
  }
}

// --- the coach -------------------------------------------------------------

const coachSchema = z.object({ sessionId: z.string().min(1) });

/**
 * Runs the Golden Strategy search for the quarter the student is about to play.
 *
 * Costs one of a strictly limited set of uses, claimed in the datastore before
 * the search runs. The quarter is taken from the SESSION, never from the
 * browser: letting the client name a quarter would let it ask for the answer to
 * a quarter it has not reached.
 */
export async function goldenStrategyAction(
  input: z.input<typeof coachSchema>,
): Promise<ActionResult<{ golden: GoldenStrategy; usedQuarters: number[]; maxQuarters: number }>> {
  try {
    const user = await requireUser();
    const parsed = coachSchema.parse(input);
    const service = createGameService(getRepositories());

    // Deliberately NO revalidatePath: refreshing this route would re-render the
    // decision screen and throw away the allocation the student is part-way
    // through typing. The action already returns the updated use list, which is
    // the only thing that changed.
    const result = await service.goldenStrategy(parsed.sessionId, user.uid);
    return { ok: true, data: result };
  } catch (error) {
    return { ok: false, error: toError(error) };
  }
}

/**
 * The post-game per-quarter comparison. Refused unless the session is finished
 * — see `GameService.hindsight`.
 */
export async function hindsightAction(
  input: z.input<typeof coachSchema>,
): Promise<ActionResult<{ quarters: HindsightQuarter[] }>> {
  try {
    const user = await requireUser();
    const parsed = coachSchema.parse(input);
    const service = createGameService(getRepositories());

    const quarters = await service.hindsight(parsed.sessionId, user.uid);
    return { ok: true, data: { quarters } };
  } catch (error) {
    return { ok: false, error: toError(error) };
  }
}

const finalizeSchema = z.object({ sessionId: z.string().min(1) });

export async function finalizeSessionAction(
  input: z.input<typeof finalizeSchema>,
): Promise<ActionResult<{ sessionId: string }>> {
  try {
    const user = await requireUser();
    const parsed = finalizeSchema.parse(input);
    const service = createGameService(getRepositories());
    await service.finalize(parsed.sessionId, user.uid);
    revalidatePath(`/report/${parsed.sessionId}`);
    return { ok: true, data: { sessionId: parsed.sessionId } };
  } catch (error) {
    return { ok: false, error: toError(error) };
  }
}

// --- class enrolment -------------------------------------------------------

const joinCourseSchema = z.object({
  courseId: z.string().min(1),
  studentCode: z.string().trim().min(1).max(40),
});

/**
 * Joins the signed-in student to a class they picked from the open list.
 *
 * Every condition is re-checked on the server. The browser was shown a list of
 * open courses, but that list is a snapshot: the course may have closed or been
 * archived since, and the student code may have been taken in between.
 */
export async function joinCourseAction(
  input: z.input<typeof joinCourseSchema>,
): Promise<ActionResult<{ courseId: string }>> {
  try {
    const user = await requireUser();
    const parsed = joinCourseSchema.parse(input);

    const course = await createEnrollmentService(getRepositories()).join({
      uid: user.uid,
      displayName: user.displayName,
      email: user.email,
      courseId: parsed.courseId,
      studentCode: parsed.studentCode,
    });

    revalidatePath('/home');
    revalidatePath('/join');
    return { ok: true, data: { courseId: course.id } };
  } catch (error) {
    return { ok: false, error: toError(error) };
  }
}

const leaveCourseSchema = z.object({ courseId: z.string().min(1) });

export async function leaveCourseAction(
  input: z.input<typeof leaveCourseSchema>,
): Promise<ActionResult<Record<string, never>>> {
  try {
    const user = await requireUser();
    const parsed = leaveCourseSchema.parse(input);

    await createEnrollmentService(getRepositories()).leave(user.uid, parsed.courseId);

    revalidatePath('/home');
    revalidatePath('/join');
    return { ok: true, data: {} };
  } catch (error) {
    return { ok: false, error: toError(error) };
  }
}
