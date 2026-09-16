import { beforeEach, describe, expect, it } from 'vitest';
import {
  ARENA_SEATS,
  ARENA_SCENARIO_VERSION,
  getGameConfig,
  type QuarterDecision,
} from '@/domain/simulation';
import { createMemoryRepositories } from '@/db/repositories/memory';
import { hasLeftGroup, type GroupDoc, type QuarterDoc } from '@/db/models';
import type { Repositories } from '@/db/repositories/types';

/**
 * The group data layer.
 *
 * Two invariants here are not features but grade-integrity boundaries, and both
 * MUST be enforced by the datastore rather than by a check in a service:
 *
 *   1. one student, one seat — several students in one seat means several
 *      students sharing one company and one mark;
 *   2. one simulation per quarter — six students all arriving at "everyone has
 *      submitted" must not each run the market and write a different result.
 *
 * The in-memory repository is written to be at least as strict as the Firestore
 * transaction (no `await` between a check and its write), which is what lets
 * these races be tested at all.
 */

const arena = getGameConfig(ARENA_SCENARIO_VERSION);

const decision: QuarterDecision = {
  productPoints: 25,
  technologyPoints: 25,
  marketingPoints: 20,
  distributionPoints: 20,
  cxPoints: 10,
  priceIndex: 105,
};

let repos: Repositories;

async function makeGroup(joinCode = 'ABC123', assignmentId = 'assignment-1'): Promise<GroupDoc> {
  const outcome = await repos.groups.create({
    assignmentId,
    courseId: 'course-1',
    name: 'Group 1',
    joinCode,
    createdBy: 'instructor-1',
  });
  if (outcome.status !== 'CREATED') throw new Error(`expected CREATED, got ${outcome.status}`);
  return outcome.group;
}

function joinInput(uid: string) {
  return {
    uid,
    companyName: `Company of ${uid}`,
    productName: 'Watch One',
    positioning: 'BALANCED' as const,
    displayName: uid,
    email: `${uid}@example.edu`,
    studentCode: uid.toUpperCase(),
  };
}

async function startGame(group: GroupDoc) {
  return repos.groupGames.create({
    groupId: group.id,
    assignmentId: group.assignmentId,
    courseId: group.courseId,
    currentRound: 0,
    scenarioVersion: arena.scenarioVersion,
    engineVersion: arena.engineVersion,
    randomSeed: 'group-seed-1',
    status: 'IN_PROGRESS',
    companies: [],
    startedAt: Date.now(),
    completedAt: null,
  });
}

function quarterDoc(quarter: number): QuarterDoc {
  return {
    quarter,
    eventKey: 'NORMAL_MARKET',
    marketUnits: 1_000_000,
    weights: arena.defaultDemandWeights,
    decisions: {},
    results: [],
    ranking: [...ARENA_SEATS],
    intel: [],
    simulatedAt: Date.now(),
  };
}

beforeEach(() => {
  repos = createMemoryRepositories();
});

describe('join codes', () => {
  it('cannot be shared by two groups', async () => {
    await makeGroup('SAME01');
    const second = await repos.groups.create({
      assignmentId: 'assignment-2',
      courseId: 'course-1',
      name: 'Group 2',
      joinCode: 'SAME01',
      createdBy: 'instructor-1',
    });

    // Refused rather than thrown, so the caller can retry with a fresh code.
    expect(second.status).toBe('CODE_TAKEN');
  });

  it('is matched case-insensitively and ignores surrounding space', async () => {
    const group = await makeGroup('AbC123');
    expect(group.joinCode).toBe('ABC123');

    expect((await repos.groups.getByJoinCode('abc123'))?.id).toBe(group.id);
    expect((await repos.groups.getByJoinCode('  ABC123 '))?.id).toBe(group.id);
    expect(await repos.groups.getByJoinCode('NOPE00')).toBeNull();
  });

  it('releases the old code when regenerated', async () => {
    const group = await makeGroup('OLD001');
    const outcome = await repos.groups.regenerateJoinCode(group.id, 'new002');

    expect(outcome.status).toBe('CREATED');
    expect(await repos.groups.getByJoinCode('OLD001')).toBeNull();
    expect((await repos.groups.getByJoinCode('NEW002'))?.id).toBe(group.id);

    // And the freed code can be handed to someone else.
    const reuse = await repos.groups.create({
      assignmentId: 'assignment-2',
      courseId: 'course-1',
      name: 'Group 2',
      joinCode: 'OLD001',
      createdBy: 'instructor-1',
    });
    expect(reuse.status).toBe('CREATED');
  });

  it('will not take a code another group already holds', async () => {
    const first = await makeGroup('AAA111');
    await repos.groups.create({
      assignmentId: 'assignment-1',
      courseId: 'course-1',
      name: 'Group 2',
      joinCode: 'BBB222',
      createdBy: 'instructor-1',
    });

    expect((await repos.groups.regenerateJoinCode(first.id, 'BBB222')).status).toBe('CODE_TAKEN');
    // The original code still works, so a failed rename strands nobody.
    expect((await repos.groups.getByJoinCode('AAA111'))?.id).toBe(first.id);
  });
});

describe('claiming a seat', () => {
  it('hands out seats in order, one per student', async () => {
    const group = await makeGroup();

    for (let i = 0; i < ARENA_SEATS.length; i += 1) {
      const outcome = await repos.groups.claimSeat({
        groupId: group.id,
        ...joinInput(`student-${i + 1}`),
      });
      expect(outcome.status).toBe('CLAIMED');
      if (outcome.status !== 'CLAIMED') return;
      expect(outcome.member.seatKey).toBe(ARENA_SEATS[i]);
    }
  });

  it('gives the same student their existing seat back, not a second one', async () => {
    const group = await makeGroup();
    const first = await repos.groups.claimSeat({ groupId: group.id, ...joinInput('student-1') });
    const again = await repos.groups.claimSeat({ groupId: group.id, ...joinInput('student-1') });

    expect(first.status).toBe('CLAIMED');
    expect(again.status).toBe('ALREADY_IN_THIS_GROUP');
    if (first.status !== 'CLAIMED' || again.status !== 'ALREADY_IN_THIS_GROUP') return;
    expect(again.member.seatKey).toBe(first.member.seatKey);

    expect(await repos.groups.listMembers(group.id)).toHaveLength(1);
  });

  it('refuses a seventh student', async () => {
    const group = await makeGroup();
    for (let i = 0; i < 6; i += 1) {
      await repos.groups.claimSeat({ groupId: group.id, ...joinInput(`student-${i + 1}`) });
    }

    const seventh = await repos.groups.claimSeat({
      groupId: group.id,
      ...joinInput('student-7'),
    });
    expect(seventh.status).toBe('GROUP_FULL');
  });

  it('SEATS EXACTLY SIX WHEN EIGHT STUDENTS ARRIVE TOGETHER', async () => {
    // The race the whole transaction exists for. A read-then-write in the
    // service would let several of these read the same free seat.
    const group = await makeGroup();

    const outcomes = await Promise.all(
      Array.from({ length: 8 }, (_, i) =>
        repos.groups.claimSeat({ groupId: group.id, ...joinInput(`student-${i + 1}`) }),
      ),
    );

    const claimed = outcomes.filter((o) => o.status === 'CLAIMED');
    expect(claimed).toHaveLength(6);
    expect(outcomes.filter((o) => o.status === 'GROUP_FULL')).toHaveLength(2);

    // And every one of the six got a DIFFERENT seat.
    const seats = claimed.map((o) => (o.status === 'CLAIMED' ? o.member.seatKey : null));
    expect(new Set(seats).size).toBe(6);

    const stored = await repos.groups.get(group.id);
    expect(Object.values(stored!.seats).filter((uid) => uid !== null)).toHaveLength(6);
  });

  it('keeps a student out of two groups of the same assignment', async () => {
    const first = await makeGroup('GRP001', 'assignment-1');
    const second = await makeGroup('GRP002', 'assignment-1');

    await repos.groups.claimSeat({ groupId: first.id, ...joinInput('student-1') });
    const elsewhere = await repos.groups.claimSeat({
      groupId: second.id,
      ...joinInput('student-1'),
    });

    expect(elsewhere.status).toBe('IN_ANOTHER_GROUP');
    if (elsewhere.status !== 'IN_ANOTHER_GROUP') return;
    expect(elsewhere.groupId).toBe(first.id);
  });

  it('lets the same student join groups of DIFFERENT assignments', async () => {
    const first = await makeGroup('GRP001', 'assignment-1');
    const other = await makeGroup('GRP002', 'assignment-2');

    expect((await repos.groups.claimSeat({ groupId: first.id, ...joinInput('s1') })).status).toBe(
      'CLAIMED',
    );
    expect((await repos.groups.claimSeat({ groupId: other.id, ...joinInput('s1') })).status).toBe(
      'CLAIMED',
    );
  });

  it('refuses an archived group', async () => {
    const group = await makeGroup();
    await repos.groups.setArchived(group.id, Date.now());

    expect((await repos.groups.claimSeat({ groupId: group.id, ...joinInput('s1') })).status).toBe(
      'GROUP_CLOSED',
    );
  });

  it('finds which group a student is in without an index', async () => {
    const group = await makeGroup('GRP001', 'assignment-1');
    await repos.groups.claimSeat({ groupId: group.id, ...joinInput('student-1') });

    const membership = await repos.groups.findMembership('assignment-1', 'student-1');
    expect(membership?.groupId).toBe(group.id);
    expect(await repos.groups.findMembership('assignment-1', 'nobody')).toBeNull();
    expect(await repos.groups.findMembership('assignment-2', 'student-1')).toBeNull();
  });
});

describe('releasing a seat', () => {
  it('frees the seat but KEEPS the member row', async () => {
    // Someone who played four quarters still has results in the match; a row
    // that vanished would make those look like they came from nowhere.
    const group = await makeGroup();
    const claim = await repos.groups.claimSeat({ groupId: group.id, ...joinInput('student-1') });
    if (claim.status !== 'CLAIMED') throw new Error('expected CLAIMED');

    await repos.groups.releaseSeat(group.id, 'student-1');

    const stored = await repos.groups.get(group.id);
    expect(stored!.seats[claim.member.seatKey]).toBeNull();

    const member = await repos.groups.getMember(group.id, 'student-1');
    expect(member).not.toBeNull();
    expect(hasLeftGroup(member!)).toBe(true);
  });

  it('lets someone else take the freed seat', async () => {
    const group = await makeGroup();
    await repos.groups.claimSeat({ groupId: group.id, ...joinInput('student-1') });
    await repos.groups.releaseSeat(group.id, 'student-1');

    const next = await repos.groups.claimSeat({ groupId: group.id, ...joinInput('student-2') });
    expect(next.status).toBe('CLAIMED');
    if (next.status !== 'CLAIMED') return;
    expect(next.member.seatKey).toBe(ARENA_SEATS[0]);
  });

  it('frees the student to join a different group of the same assignment', async () => {
    const first = await makeGroup('GRP001', 'assignment-1');
    const second = await makeGroup('GRP002', 'assignment-1');

    await repos.groups.claimSeat({ groupId: first.id, ...joinInput('student-1') });
    await repos.groups.releaseSeat(first.id, 'student-1');

    expect(
      (await repos.groups.claimSeat({ groupId: second.id, ...joinInput('student-1') })).status,
    ).toBe('CLAIMED');
  });
});

describe('the match', () => {
  it('is keyed by group, so starting twice returns the SAME match', async () => {
    const group = await makeGroup();
    const first = await startGame(group);
    await repos.groupGames.saveQuarter(group.id, quarterDoc(1), []);

    const second = await startGame(group);

    expect(second.id).toBe(first.id);
    // Critically, the quarter already played is still there: a second start
    // must never replace a running match with a fresh one.
    expect(second.currentRound).toBe(1);
    expect(await repos.groupGames.listQuarters(group.id)).toHaveLength(1);
  });

  it('records a decision once, and ignores a resubmission', async () => {
    const group = await makeGroup();
    await startGame(group);

    const first = await repos.groupGames.submitDecision(group.id, {
      quarter: 1,
      seatKey: 'player',
      uid: 'student-1',
      decision,
      wasDefault: false,
    });
    const changed = await repos.groupGames.submitDecision(group.id, {
      quarter: 1,
      seatKey: 'player',
      uid: 'student-1',
      decision: { ...decision, priceIndex: 80 },
      wasDefault: false,
    });

    expect(first.status).toBe('SUBMITTED');
    expect(changed.status).toBe('ALREADY_SUBMITTED');
    // A student must not be able to change their mind by submitting again: the
    // other five are waiting on this and would be racing a moving target.
    expect(changed.submission.decision.priceIndex).toBe(105);
    expect(await repos.groupGames.listSubmissions(group.id, 1)).toHaveLength(1);
  });

  it('keeps each quarter and each seat separate', async () => {
    const group = await makeGroup();
    await startGame(group);

    for (const seatKey of ARENA_SEATS) {
      await repos.groupGames.submitDecision(group.id, {
        quarter: 1,
        seatKey,
        uid: `student-${seatKey}`,
        decision,
        wasDefault: false,
      });
    }
    await repos.groupGames.submitDecision(group.id, {
      quarter: 2,
      seatKey: 'player',
      uid: 'student-player',
      decision,
      wasDefault: false,
    });

    expect(await repos.groupGames.listSubmissions(group.id, 1)).toHaveLength(6);
    expect(await repos.groupGames.listSubmissions(group.id, 2)).toHaveLength(1);
    expect(await repos.groupGames.listSubmissions(group.id, 3)).toHaveLength(0);
  });

  it('SIMULATES A QUARTER ONCE, even when six requests race', async () => {
    // Six students all observe "everyone has submitted" at the same instant.
    // Whoever loses must discard their work and take the stored result.
    const group = await makeGroup();
    await startGame(group);

    const outcomes = await Promise.all(
      Array.from({ length: 6 }, (_, i) =>
        repos.groupGames.saveQuarter(group.id, { ...quarterDoc(1), marketUnits: 1000 + i }, []),
      ),
    );

    expect(outcomes.filter((o) => o.status === 'SAVED')).toHaveLength(1);
    expect(outcomes.filter((o) => o.status === 'ALREADY_EXISTS')).toHaveLength(5);

    // And everybody ends up looking at the same numbers.
    const stored = await repos.groupGames.getQuarter(group.id, 1);
    for (const outcome of outcomes) {
      expect(outcome.quarter.marketUnits).toBe(stored!.marketUnits);
    }
    expect(await repos.groupGames.listQuarters(group.id)).toHaveLength(1);
  });

  it('advances the round and never rewinds it', async () => {
    const group = await makeGroup();
    await startGame(group);

    await repos.groupGames.saveQuarter(group.id, quarterDoc(1), []);
    await repos.groupGames.saveQuarter(group.id, quarterDoc(2), []);
    expect((await repos.groupGames.get(group.id))!.currentRound).toBe(2);

    // A late replay of quarter 1 must not drag the match backwards.
    await repos.groupGames.saveQuarter(group.id, quarterDoc(1), []);
    expect((await repos.groupGames.get(group.id))!.currentRound).toBe(2);
  });

  it('marks the match complete', async () => {
    const group = await makeGroup();
    await startGame(group);

    await repos.groupGames.complete(group.id, 1_700_000_000_000);
    const stored = await repos.groupGames.get(group.id);
    expect(stored!.status).toBe('COMPLETED');
    expect(stored!.completedAt).toBe(1_700_000_000_000);
  });

  it('lists matches and groups by assignment', async () => {
    const a = await makeGroup('AAA111', 'assignment-1');
    const b = await makeGroup('BBB222', 'assignment-1');
    const other = await makeGroup('CCC333', 'assignment-2');
    await startGame(a);
    await startGame(b);
    await startGame(other);

    expect((await repos.groups.listByAssignment('assignment-1')).map((g) => g.id)).toEqual([
      a.id,
      b.id,
    ]);
    expect((await repos.groupGames.listByAssignment('assignment-1')).map((g) => g.id)).toEqual([
      a.id,
      b.id,
    ]);
  });
});

describe('stored documents are isolated from their callers', () => {
  it('does not let a caller mutate stored state through a returned object', async () => {
    const group = await makeGroup();
    const claim = await repos.groups.claimSeat({ groupId: group.id, ...joinInput('student-1') });
    if (claim.status !== 'CLAIMED') throw new Error('expected CLAIMED');

    claim.member.companyName = 'Hacked';
    claim.group.seats.player = 'someone-else';

    const member = await repos.groups.getMember(group.id, 'student-1');
    const stored = await repos.groups.get(group.id);
    expect(member!.companyName).toBe('Company of student-1');
    expect(stored!.seats.player).toBe('student-1');
  });
});
