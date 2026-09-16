import { beforeEach, describe, expect, it } from 'vitest';
import {
  ARENA_SCENARIO_VERSION,
  ARENA_SEATS,
  getGameConfig,
  type CompanyKey,
  type QuarterDecision,
} from '@/domain/simulation';
import { createMemoryRepositories } from '@/db/repositories/memory';
import type { AssignmentDoc, GroupDoc } from '@/db/models';
import type { Repositories } from '@/db/repositories/types';
import { GroupService } from '@/server/group/service';
import { GroupError } from '@/server/group/errors';

/**
 * A group match, end to end on the in-memory repositories.
 *
 * The properties worth proving here are the ones a mark depends on: a quarter
 * cannot run until everyone has decided, it runs exactly once however many
 * requests arrive, and what comes out at the end is an ordinary graded row —
 * which is what lets the existing leaderboard and CSV exports work unchanged.
 */

const arena = getGameConfig(ARENA_SCENARIO_VERSION);
const INSTRUCTOR = { uid: 'instructor-1', email: 'teacher@example.edu', displayName: 'Le Giang Vien' };

const decision: QuarterDecision = {
  productPoints: 25,
  technologyPoints: 25,
  marketingPoints: 20,
  distributionPoints: 20,
  cxPoints: 10,
  priceIndex: 105,
};

let repos: Repositories;
let service: GroupService;
let assignment: AssignmentDoc;
let courseId: string;

/** Six enrolled students, `student-1` … `student-6`. */
function students(count = 6) {
  return Array.from({ length: count }, (_, i) => ({
    uid: `student-${i + 1}`,
    email: `student${i + 1}@example.edu`,
    displayName: `Student ${i + 1}`,
    studentCode: `SV00${i + 1}`,
  }));
}

async function setup(overrides: Partial<Pick<AssignmentDoc, 'deadline' | 'isOpen' | 'mode'>> = {}) {
  repos = createMemoryRepositories();
  service = new GroupService(repos);

  await repos.users.upsert({ ...INSTRUCTOR, role: 'INSTRUCTOR' });
  const course = await repos.courses.create({
    courseName: 'Digital Business',
    semester: '2026A',
    instructorId: INSTRUCTOR.uid,
  });
  courseId = course.id;

  for (const student of students()) {
    await repos.users.upsert({ ...student, role: 'STUDENT' });
    await repos.courses.addMember({ ...student, courseId: course.id });
  }

  assignment = await repos.assignments.create({
    courseId: course.id,
    title: 'Group round 1',
    startAt: Date.now() - 1000,
    deadline: overrides.deadline ?? Date.now() + 86_400_000,
    maxAttempts: 1,
    scenarioVersion: ARENA_SCENARIO_VERSION,
    engineVersion: arena.engineVersion,
    officialSeed: 'smartwatch-v1-2026',
    isOpen: overrides.isOpen ?? true,
    createdBy: INSTRUCTOR.uid,
    mode: overrides.mode ?? 'GROUP',
  });
}

async function makeGroup(): Promise<GroupDoc> {
  const [group] = await service.createGroups({
    assignmentId: assignment.id,
    count: 1,
    createdBy: INSTRUCTOR.uid,
    namePrefix: 'Group',
  });
  if (!group) throw new Error('no group created');
  return group;
}

async function joinAll(group: GroupDoc, count = 6) {
  for (const student of students(count)) {
    await service.join({
      joinCode: group.joinCode,
      uid: student.uid,
      displayName: student.displayName,
      email: student.email,
      companyName: `Company ${student.uid}`,
      productName: 'Watch One',
      positioning: 'BALANCED',
    });
  }
}

/** Every seated student submits the same decision for one quarter. */
async function everyoneSubmits(group: GroupDoc, quarter: number, count = 6) {
  for (const student of students(count)) {
    await service.submitDecision({
      groupId: group.id,
      uid: student.uid,
      quarter,
      decision,
    });
  }
}

beforeEach(async () => {
  await setup();
});

describe('creating groups', () => {
  it('creates numbered groups, each with its own code', async () => {
    const groups = await service.createGroups({
      assignmentId: assignment.id,
      count: 4,
      createdBy: INSTRUCTOR.uid,
      namePrefix: 'Group',
    });

    expect(groups.map((g) => g.name)).toEqual(['Group 1', 'Group 2', 'Group 3', 'Group 4']);
    expect(new Set(groups.map((g) => g.joinCode)).size).toBe(4);
    for (const group of groups) expect(group.joinCode).toHaveLength(6);
  });

  it('continues the numbering when more groups are added later', async () => {
    await service.createGroups({
      assignmentId: assignment.id,
      count: 2,
      createdBy: INSTRUCTOR.uid,
      namePrefix: 'Group',
    });
    const more = await service.createGroups({
      assignmentId: assignment.id,
      count: 2,
      createdBy: INSTRUCTOR.uid,
      namePrefix: 'Group',
    });
    expect(more.map((g) => g.name)).toEqual(['Group 3', 'Group 4']);
  });

  it('refuses a solo assignment', async () => {
    await setup({ mode: 'SOLO' });
    await expect(
      service.createGroups({
        assignmentId: assignment.id,
        count: 1,
        createdBy: INSTRUCTOR.uid,
        namePrefix: 'Group',
      }),
    ).rejects.toMatchObject({ key: 'notGroupAssignment' });
  });

  it('issues a fresh code and invalidates the old one', async () => {
    const group = await makeGroup();
    const rotated = await service.regenerateJoinCode(group.id);

    expect(rotated.joinCode).not.toBe(group.joinCode);
    await expect(
      service.join({
        joinCode: group.joinCode,
        uid: 'student-1',
        displayName: 'Student 1',
        email: 'student1@example.edu',
        companyName: 'C',
        productName: 'P',
        positioning: 'BALANCED',
      }),
    ).rejects.toMatchObject({ key: 'groupCodeInvalid' });
  });
});

describe('joining', () => {
  it('seats six students, one per seat', async () => {
    const group = await makeGroup();
    await joinAll(group);

    const state = await service.getState(group.id);
    expect(state.members).toHaveLength(6);
    expect(new Set(state.members.map((m) => m.seatKey)).size).toBe(6);
    expect(state.botSeats).toEqual([]);
  });

  it('accepts the code however it was typed', async () => {
    const group = await makeGroup();
    const joined = await service.join({
      joinCode: `  ${group.joinCode.toLowerCase()} `,
      uid: 'student-1',
      displayName: 'Student 1',
      email: 'student1@example.edu',
      companyName: 'NovaTime',
      productName: 'Watch One',
      positioning: 'BALANCED',
    });
    expect(joined.group.id).toBe(group.id);
  });

  it('refuses a student who is not on the course roster', async () => {
    // A leaked code must not be a way into the class.
    const group = await makeGroup();
    await repos.users.upsert({
      uid: 'outsider',
      email: 'outsider@example.edu',
      displayName: 'Outsider',
      role: 'STUDENT',
    });

    await expect(
      service.join({
        joinCode: group.joinCode,
        uid: 'outsider',
        displayName: 'Outsider',
        email: 'outsider@example.edu',
        companyName: 'C',
        productName: 'P',
        positioning: 'BALANCED',
      }),
    ).rejects.toMatchObject({ key: 'notEnrolled' });
  });

  it('refuses a seventh student', async () => {
    const group = await makeGroup();
    await joinAll(group);

    await repos.users.upsert({
      uid: 'student-7',
      email: 'student7@example.edu',
      displayName: 'Student 7',
      role: 'STUDENT',
    });
    await repos.courses.addMember({
      uid: 'student-7',
      courseId,
      studentCode: 'SV007',
      displayName: 'Student 7',
      email: 'student7@example.edu',
    });

    await expect(
      service.join({
        joinCode: group.joinCode,
        uid: 'student-7',
        displayName: 'Student 7',
        email: 'student7@example.edu',
        companyName: 'C',
        productName: 'P',
        positioning: 'BALANCED',
      }),
    ).rejects.toMatchObject({ key: 'groupFull' });
  });

  it('closes the group once the market has run', async () => {
    // The six companies were built from the seat map at that moment, so a late
    // joiner would be holding a company a bot has already played.
    const group = await makeGroup();
    await joinAll(group, 5);
    await everyoneSubmits(group, 1, 5);

    await expect(
      service.join({
        joinCode: group.joinCode,
        uid: 'student-6',
        displayName: 'Student 6',
        email: 'student6@example.edu',
        companyName: 'C',
        productName: 'P',
        positioning: 'BALANCED',
      }),
    ).rejects.toMatchObject({ key: 'groupAlreadyStarted' });
  });

  it('refuses after the assignment deadline', async () => {
    const group = await makeGroup();
    await repos.assignments.update(assignment.id, { deadline: Date.now() - 1000 });

    await expect(
      service.join({
        joinCode: group.joinCode,
        uid: 'student-1',
        displayName: 'Student 1',
        email: 'student1@example.edu',
        companyName: 'C',
        productName: 'P',
        positioning: 'BALANCED',
      }),
    ).rejects.toMatchObject({ key: 'deadlinePassed' });
  });

  it('is idempotent — rejoining returns the same seat', async () => {
    const group = await makeGroup();
    const first = await service.join({
      joinCode: group.joinCode,
      uid: 'student-1',
      displayName: 'Student 1',
      email: 'student1@example.edu',
      companyName: 'NovaTime',
      productName: 'Watch One',
      positioning: 'BALANCED',
    });
    const again = await service.join({
      joinCode: group.joinCode,
      uid: 'student-1',
      displayName: 'Student 1',
      email: 'student1@example.edu',
      companyName: 'Different name',
      productName: 'Watch Two',
      positioning: 'PREMIUM',
    });

    expect(again.member.seatKey).toBe(first.member.seatKey);
    // The original company name stands: a second join is a refresh, not an edit.
    expect(again.member.companyName).toBe('NovaTime');
  });
});

describe('playing a quarter', () => {
  it('does not run until every seated student has decided', async () => {
    const group = await makeGroup();
    await joinAll(group);

    for (let i = 0; i < 5; i += 1) {
      const result = await service.submitDecision({
        groupId: group.id,
        uid: `student-${i + 1}`,
        quarter: 1,
        decision,
      });
      expect(result.ran).toBe(false);
      expect(result.state.waitingOnSeats).toHaveLength(5 - i);
    }

    const last = await service.submitDecision({
      groupId: group.id,
      uid: 'student-6',
      quarter: 1,
      decision,
    });
    expect(last.ran).toBe(true);
    expect(last.state.currentQuarter).toBe(2);
  });

  it('names exactly who it is waiting on', async () => {
    // The whole mitigation for having no automatic deadline.
    const group = await makeGroup();
    await joinAll(group);
    await service.submitDecision({ groupId: group.id, uid: 'student-1', quarter: 1, decision });

    const state = await service.getState(group.id);
    expect(state.submittedSeats).toHaveLength(1);
    expect(state.waitingOnSeats).toHaveLength(5);

    const waitingUids = state.waitingOnSeats.map((seat) => state.group.seats[seat]);
    expect(waitingUids).not.toContain('student-1');
  });

  it('ignores a resubmission rather than letting a decision be changed', async () => {
    const group = await makeGroup();
    await joinAll(group);

    await service.submitDecision({ groupId: group.id, uid: 'student-1', quarter: 1, decision });
    const again = await service.submitDecision({
      groupId: group.id,
      uid: 'student-1',
      quarter: 1,
      decision: { ...decision, priceIndex: 80 },
    });

    expect(again.submitted).toBe(false);
    const submissions = await repos.groupGames.listSubmissions(group.id, 1);
    expect(submissions).toHaveLength(1);
    expect(submissions[0]!.decision.priceIndex).toBe(105);
  });

  it('takes the quarter from the match, not from the browser', async () => {
    const group = await makeGroup();
    await joinAll(group);

    await expect(
      service.submitDecision({ groupId: group.id, uid: 'student-1', quarter: 4, decision }),
    ).rejects.toMatchObject({ key: 'quarterOutOfRange' });
  });

  it('rejects a decision that does not add up to 100', async () => {
    const group = await makeGroup();
    await joinAll(group);

    await expect(
      service.submitDecision({
        groupId: group.id,
        uid: 'student-1',
        quarter: 1,
        decision: { ...decision, productPoints: 99 },
      }),
    ).rejects.toThrow(GroupError);
  });

  it('refuses a student who is not in the group', async () => {
    const group = await makeGroup();
    await joinAll(group, 3);

    await expect(
      service.submitDecision({ groupId: group.id, uid: 'student-6', quarter: 1, decision }),
    ).rejects.toMatchObject({ key: 'notInThisGroup' });
  });

  it('SIMULATES ONCE when the last six submissions race', async () => {
    const group = await makeGroup();
    await joinAll(group);

    const results = await Promise.all(
      students().map((student) =>
        service.submitDecision({ groupId: group.id, uid: student.uid, quarter: 1, decision }),
      ),
    );

    // Exactly one request did the simulating; the rest found it already done.
    expect(results.filter((r) => r.ran)).toHaveLength(1);
    expect(await repos.groupGames.listQuarters(group.id)).toHaveLength(1);
    expect((await repos.groupGames.get(group.id))!.currentRound).toBe(1);
  });

  it('runs with fewer than six students, with bots in the empty seats', async () => {
    const group = await makeGroup();
    await joinAll(group, 4);

    const state = await service.getState(group.id);
    expect(state.botSeats).toEqual(['huawei', 'pixel']);

    await everyoneSubmits(group, 1, 4);

    const [quarter] = await repos.groupGames.listQuarters(group.id);
    expect(quarter).toBeDefined();
    // The market still holds six companies.
    expect(quarter!.results).toHaveLength(6);
    expect(Object.keys(quarter!.decisions)).toHaveLength(6);
  });

  it('stores no competitor intelligence, because it differs per viewer', async () => {
    const group = await makeGroup();
    await joinAll(group);
    await everyoneSubmits(group, 1);

    const [quarter] = await repos.groupGames.listQuarters(group.id);
    expect(quarter!.intel).toEqual([]);
  });
});

describe('forcing a quarter through', () => {
  it('fills in for whoever has not submitted, and flags it', async () => {
    const group = await makeGroup();
    await joinAll(group);
    await service.submitDecision({ groupId: group.id, uid: 'student-1', quarter: 1, decision });

    const forced = await service.forceQuarter(group.id);

    expect(forced.ran).toBe(true);
    expect(forced.filledSeats).toHaveLength(5);

    const submissions = await repos.groupGames.listSubmissions(group.id, 1);
    expect(submissions.filter((s) => s.wasDefault)).toHaveLength(5);
    // The one who did submit keeps their own decision, unflagged.
    const own = submissions.find((s) => s.uid === 'student-1');
    expect(own!.wasDefault).toBe(false);
  });

  it('repeats a student own previous decision rather than resetting them', async () => {
    const group = await makeGroup();
    await joinAll(group);

    const distinctive: QuarterDecision = {
      productPoints: 60,
      technologyPoints: 10,
      marketingPoints: 10,
      distributionPoints: 10,
      cxPoints: 10,
      priceIndex: 118,
    };
    // Quarter 1: student-6 plays something distinctive, everyone else plays flat.
    for (const student of students(5)) {
      await service.submitDecision({ groupId: group.id, uid: student.uid, quarter: 1, decision });
    }
    await service.submitDecision({
      groupId: group.id,
      uid: 'student-6',
      quarter: 1,
      decision: distinctive,
    });

    // Quarter 2: student-6 goes missing and the instructor forces it through.
    await everyoneSubmits(group, 2, 5);
    await service.forceQuarter(group.id);

    const submissions = await repos.groupGames.listSubmissions(group.id, 2);
    const filled = submissions.find((s) => s.uid === 'student-6');
    expect(filled!.wasDefault).toBe(true);
    expect(filled!.decision).toEqual(distinctive);
  });

  it('uses an even split in quarter one, where there is nothing to repeat', async () => {
    const group = await makeGroup();
    await joinAll(group);
    await service.forceQuarter(group.id);

    const submissions = await repos.groupGames.listSubmissions(group.id, 1);
    expect(submissions).toHaveLength(6);
    for (const submission of submissions) {
      expect(submission.decision).toEqual({
        productPoints: 20,
        technologyPoints: 20,
        marketingPoints: 20,
        distributionPoints: 20,
        cxPoints: 20,
        priceIndex: 100,
      });
    }
  });

  it('refuses once the match is over', async () => {
    const group = await makeGroup();
    await joinAll(group);
    for (let quarter = 1; quarter <= arena.quarters; quarter += 1) {
      await everyoneSubmits(group, quarter);
    }

    await expect(service.forceQuarter(group.id)).rejects.toMatchObject({
      key: 'gameAlreadyCompleted',
    });
  });
});

describe('a full six-quarter match', () => {
  it('plays through and grades all six students', async () => {
    const group = await makeGroup();
    await joinAll(group);

    for (let quarter = 1; quarter <= arena.quarters; quarter += 1) {
      await everyoneSubmits(group, quarter);
    }

    const state = await service.getState(group.id);
    expect(state.completed).toBe(true);
    expect(state.currentQuarter).toBeNull();
    expect(await repos.groupGames.listQuarters(group.id)).toHaveLength(6);

    // One ordinary graded row per student — which is what makes the existing
    // class leaderboard and CSV exports work on a group match unchanged.
    const board = await repos.finalResults.listByAssignment(assignment.id, 'finalScore');
    expect(board).toHaveLength(6);

    for (const row of board) {
      expect(row.groupId).toBe(group.id);
      expect(row.groupName).toBe(group.name);
      expect(row.scenarioVersion).toBe(ARENA_SCENARIO_VERSION);
      expect(row.studentCode).toMatch(/^SV00\d$/);
      expect(row.sessionId).toBe(`${group.id}__${row.seatKey}`);
    }

    // `gameRank` IS the rank inside the group: six distinct places.
    expect(new Set(board.map((r) => r.gameRank))).toEqual(new Set([1, 2, 3, 4, 5, 6]));
  });

  it('leaves six identical strategies level, in a real match', async () => {
    // The fairness property from phase A, now through the whole server path.
    const group = await makeGroup();
    await joinAll(group);
    for (let quarter = 1; quarter <= arena.quarters; quarter += 1) {
      await everyoneSubmits(group, quarter);
    }

    const board = await repos.finalResults.listByAssignment(assignment.id, 'finalScore');
    const scores = board.map((r) => r.finalScore);
    expect(Math.max(...scores) - Math.min(...scores)).toBeLessThan(1);
  });

  it('grades only the seats a student actually held', async () => {
    const group = await makeGroup();
    await joinAll(group, 4);
    for (let quarter = 1; quarter <= arena.quarters; quarter += 1) {
      await everyoneSubmits(group, quarter, 4);
    }

    const board = await repos.finalResults.listByAssignment(assignment.id, 'finalScore');
    expect(board).toHaveLength(4);
    // The two bot seats are in the match and in the ranking, but nobody is
    // marked for them.
    const seats = board.map((r) => r.seatKey as CompanyKey);
    expect(seats).not.toContain('huawei');
    expect(seats).not.toContain('pixel');
  });

  it('is idempotent — finalizing twice does not change a mark', async () => {
    const group = await makeGroup();
    await joinAll(group);
    for (let quarter = 1; quarter <= arena.quarters; quarter += 1) {
      await everyoneSubmits(group, quarter);
    }

    const before = await repos.finalResults.listByAssignment(assignment.id, 'finalScore');
    await service.finalize(group.id);
    const after = await repos.finalResults.listByAssignment(assignment.id, 'finalScore');

    expect(after).toEqual(before);
  });

  it('refuses a seventh quarter', async () => {
    const group = await makeGroup();
    await joinAll(group);
    for (let quarter = 1; quarter <= arena.quarters; quarter += 1) {
      await everyoneSubmits(group, quarter);
    }

    await expect(
      service.submitDecision({ groupId: group.id, uid: 'student-1', quarter: 7, decision }),
    ).rejects.toMatchObject({ key: 'gameAlreadyCompleted' });
  });
});

describe('removing a student mid-match', () => {
  it('frees the seat to a bot and lets the match carry on', async () => {
    const group = await makeGroup();
    await joinAll(group);
    await everyoneSubmits(group, 1);

    await service.releaseSeat(group.id, 'student-6');

    const state = await service.getState(group.id);
    expect(state.members.filter((m) => m.leftAt == null)).toHaveLength(5);
    expect(state.botSeats).toHaveLength(1);

    // The remaining five can finish the quarter on their own.
    await everyoneSubmits(group, 2, 5);
    expect((await repos.groupGames.get(group.id))!.currentRound).toBe(2);
  });

  it('keeps the seat order stable for everyone else', async () => {
    const group = await makeGroup();
    await joinAll(group);
    const before = await service.getState(group.id);

    await service.releaseSeat(group.id, 'student-3');
    const after = await service.getState(group.id);

    for (const student of ['student-1', 'student-2', 'student-4', 'student-5', 'student-6']) {
      const wasAt = before.members.find((m) => m.uid === student)?.seatKey;
      const isAt = after.members.find((m) => m.uid === student)?.seatKey;
      expect({ student, seat: isAt }).toEqual({ student, seat: wasAt });
    }
  });
});

describe('finding a student group', () => {
  it('reports the group they are in, and nothing once they leave', async () => {
    const group = await makeGroup();
    await joinAll(group, 1);

    expect((await service.findMembership(assignment.id, 'student-1'))?.groupId).toBe(group.id);
    expect(await service.findMembership(assignment.id, 'student-2')).toBeNull();

    await service.releaseSeat(group.id, 'student-1');
    expect(await service.findMembership(assignment.id, 'student-1')).toBeNull();
  });
});

describe('seat order', () => {
  it('fills `player` first, so the one seat with no bot archetype is last', async () => {
    const group = await makeGroup();
    await joinAll(group, 1);

    const state = await service.getState(group.id);
    expect(state.members[0]!.seatKey).toBe(ARENA_SEATS[0]);
    expect(state.botSeats).not.toContain('player');
  });
});
