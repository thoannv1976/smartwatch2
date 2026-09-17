import { describe, expect, it } from 'vitest';
import { NO_UNLOCKS, guideUnlocks } from '@/lib/guide-unlocks';

/**
 * The gate on the guide's lesson answers.
 *
 * The property that matters: Part 2 must NOT open for a student who has only
 * played solo. The Part 2 answers are about competing with five real people
 * who are also reading you — handing them to someone who has never sat in a
 * group match gives away the discovery for a game they have not played yet.
 */

describe('guideUnlocks', () => {
  it('opens nothing for a visitor with no finished game', () => {
    expect(guideUnlocks([])).toEqual(NO_UNLOCKS);
  });

  it('opens part 1 for a finished solo game, and LEAVES PART 2 SHUT', () => {
    const unlocks = guideUnlocks([{ groupId: undefined }]);
    expect(unlocks).toEqual({ part1: true, part2: false });
  });

  it('counts a practice game, because the student played the same six quarters', () => {
    // A practice session writes a FinalResultDoc with assignmentId null. Gating
    // on an official attempt would withhold the explanation from the student
    // who did the extra work.
    expect(guideUnlocks([{ groupId: null }]).part1).toBe(true);
  });

  it('opens both once one result came from a group match', () => {
    expect(guideUnlocks([{ groupId: undefined }, { groupId: 'group-123' }])).toEqual({
      part1: true,
      part2: true,
    });
  });

  it('does not open part 2 on a row written before group mode existed', () => {
    // Those rows have no `groupId` key at all. Testing positively for a
    // non-empty string means old data can never accidentally satisfy it.
    expect(guideUnlocks([{}, {}, {}]).part2).toBe(false);
    expect(guideUnlocks([{ groupId: '' }]).part2).toBe(false);
  });
});
