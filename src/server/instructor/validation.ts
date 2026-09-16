import type { AssignmentDoc } from '@/db/models';

/**
 * Assignment validation shared by the create and update paths.
 *
 * Deliberately NOT in `actions.ts`: that file is `'use server'`, where every
 * export must be an async server action, so a plain predicate cannot live
 * there. Keeping it here also makes it directly testable without auth.
 */

/**
 * True when the schedule leaves the assignment openable.
 *
 * Creation rejects `deadline <= startAt`; editing has to as well, and against
 * the MERGED values, because a patch normally carries only one of the two
 * timestamps. Comparing only what the patch contains would let an instructor
 * move the deadline before the existing start, which makes the assignment
 * permanently unusable — too early to begin, then past due, with no state in
 * between — and nobody finds out until no student can start it.
 */
export function patchKeepsWindowValid(
  current: Pick<AssignmentDoc, 'startAt' | 'deadline'>,
  patch: { startAt?: number; deadline?: number },
): boolean {
  const startAt = patch.startAt ?? current.startAt;
  const deadline = patch.deadline ?? current.deadline;
  return deadline > startAt;
}
