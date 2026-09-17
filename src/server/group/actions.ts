'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { FORECAST_NOTE_MAX, POSITIONINGS } from '@/domain/simulation';
import { getRepositories } from '@/db/repositories/firestore';
import { AuthorizationError, requireUser } from '@/server/auth/session';
import { GroupError, type GroupErrorKey } from './errors';
import { createGroupService } from './service';

/**
 * Server actions for the group screens.
 *
 * The only write paths a student's browser can reach in group mode. Each one
 * authenticates, validates with zod and delegates to the service, which owns
 * every authorisation decision. Failures come back as a dictionary key so the
 * screen renders them in the student's language rather than leaking an
 * internal message.
 */

export type GroupActionResult<T> = { ok: true; data: T } | { ok: false; error: GroupErrorKey };

function toError(error: unknown): GroupErrorKey {
  if (error instanceof GroupError) return error.key;
  if (error instanceof AuthorizationError) return error.key;
  console.error(
    JSON.stringify({ severity: 'ERROR', message: 'group action failed', error: String(error) }),
  );
  return 'groupNotFound';
}

const joinSchema = z.object({
  joinCode: z.string().trim().min(1).max(20),
  companyName: z.string().trim().min(1).max(60),
  productName: z.string().trim().min(1).max(60),
  positioning: z.enum(POSITIONINGS as unknown as [string, ...string[]]),
});

export async function joinGroupAction(
  input: z.input<typeof joinSchema>,
): Promise<GroupActionResult<{ groupId: string }>> {
  try {
    const user = await requireUser();
    const parsed = joinSchema.parse(input);
    const service = createGroupService(getRepositories());

    const { group } = await service.join({
      joinCode: parsed.joinCode,
      uid: user.uid,
      displayName: user.displayName,
      email: user.email,
      companyName: parsed.companyName,
      productName: parsed.productName,
      positioning: parsed.positioning as (typeof POSITIONINGS)[number],
    });

    revalidatePath('/home');
    return { ok: true, data: { groupId: group.id } };
  } catch (error) {
    return { ok: false, error: toError(error) };
  }
}

const submitSchema = z.object({
  groupId: z.string().min(1),
  quarter: z.number().int().min(1).max(24),
  decision: z.object({
    productPoints: z.number().int().min(0).max(100),
    technologyPoints: z.number().int().min(0).max(100),
    marketingPoints: z.number().int().min(0).max(100),
    distributionPoints: z.number().int().min(0).max(100),
    cxPoints: z.number().int().min(0).max(100),
    priceIndex: z.number().int().min(80).max(120),
  }),
  forecast: z
    .object({
      predictedRank: z.number().int().min(1).max(6),
      predictedShare: z.number().min(0).max(1).nullish(),
      note: z.string().trim().max(FORECAST_NOTE_MAX).nullish(),
    })
    .nullish(),
});

/**
 * Submits one student's decision, and runs the quarter if it was the last one
 * outstanding.
 *
 * `ran` tells the screen whether to move on to the result or back to the
 * waiting room. The quarter number is checked against the MATCH inside the
 * service; sending one here cannot make the match play a quarter it has not
 * reached.
 */
export async function submitGroupDecisionAction(
  input: z.input<typeof submitSchema>,
): Promise<GroupActionResult<{ submitted: boolean; ran: boolean; quarter: number }>> {
  try {
    const user = await requireUser();
    const parsed = submitSchema.parse(input);
    const service = createGroupService(getRepositories());

    const result = await service.submitDecision({
      groupId: parsed.groupId,
      uid: user.uid,
      quarter: parsed.quarter,
      decision: parsed.decision,
      forecast: parsed.forecast ?? null,
    });

    revalidatePath(`/group/${parsed.groupId}`);
    return {
      ok: true,
      data: { submitted: result.submitted, ran: result.ran, quarter: parsed.quarter },
    };
  } catch (error) {
    return { ok: false, error: toError(error) };
  }
}

const refreshSchema = z.object({ groupId: z.string().min(1) });

/**
 * Re-checks whether the quarter can run now.
 *
 * The waiting room polls this. It exists because the LAST student to submit is
 * the one whose request runs the market — the other five are sitting on a page
 * that knows nothing about it until they ask. Safe to call from anyone in the
 * group and safe to call concurrently: the simulation is guarded by the
 * quarter document's uniqueness, not by who called.
 */
export async function refreshGroupAction(
  input: z.input<typeof refreshSchema>,
): Promise<GroupActionResult<{ currentQuarter: number | null; completed: boolean }>> {
  try {
    const user = await requireUser();
    const parsed = refreshSchema.parse(input);
    const service = createGroupService(getRepositories());

    const member = await service.getMemberOf(parsed.groupId, user.uid);
    if (!member) throw new GroupError('notInThisGroup');

    await service.advanceIfReady(parsed.groupId);
    const state = await service.getState(parsed.groupId);

    return {
      ok: true,
      data: { currentQuarter: state.currentQuarter, completed: state.completed },
    };
  } catch (error) {
    return { ok: false, error: toError(error) };
  }
}
