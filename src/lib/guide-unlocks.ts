/**
 * Which halves of the guide's lesson answers a student has earned.
 *
 * WHY THE ANSWERS ARE GATED AT ALL. A list that says "lesson: distribution is
 * the bottleneck" IS the answer. What makes a simulation worth more than a
 * reading is that the student walks into the wall themselves and then
 * understands why it was there. So the guide always shows the QUESTIONS — they
 * are what to pay attention to — and opens the answers once the student has
 * played the thing the answer is about.
 *
 * WHY THIS READS FINAL RESULTS AND NOTHING ELSE. One `finalResults.listByUser`
 * call answers both halves, so no new field, no new collection and no stored
 * "hasCompleted" flag that could drift out of step with the results it claims
 * to describe:
 *
 *   - any row at all      → they finished six quarters → Part 1 answers open
 *   - any row with groupId → they finished a group match → Part 2 answers open
 *
 * A practice session writes a `FinalResultDoc` too (with `assignmentId: null`),
 * and that counts on purpose: a student who played six quarters for practice
 * has had exactly the experience the Part 1 answers are about. Gating on an
 * OFFICIAL attempt would withhold the explanation from the student who did the
 * extra work.
 *
 * Pure, so the gate is a unit test rather than something to click through.
 */
export interface GuideUnlocks {
  /** Answers for the solo game. */
  part1: boolean;
  /** Answers for the six-student group match. */
  part2: boolean;
}

/** Nothing earned. The shape a signed-out visitor sees. */
export const NO_UNLOCKS: GuideUnlocks = { part1: false, part2: false };

/**
 * The only field read off a stored result.
 *
 * Deliberately `string | null | undefined` rather than `Pick<FinalResultDoc,
 * 'groupId'>`: the model types it optional, but Firestore is perfectly capable
 * of handing back an explicit null, and a gate on a student's grade-adjacent
 * material should not depend on which of the two absent-shapes arrives.
 */
export interface GuideResultRow {
  groupId?: string | null;
}

export function guideUnlocks(results: readonly GuideResultRow[]): GuideUnlocks {
  return {
    part1: results.length > 0,
    // `groupId` is absent on every solo result and on every row written before
    // group mode existed, so this is a positive test rather than a negation —
    // it cannot accidentally open on old data.
    part2: results.some((result) => typeof result.groupId === 'string' && result.groupId !== ''),
  };
}
