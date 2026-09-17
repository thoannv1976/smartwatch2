import { beforeEach, describe, expect, it } from 'vitest';
import {
  ARENA_SCENARIO_VERSION,
  ARENA_SEATS,
  INVESTMENT_FIELDS,
  getGameConfig,
  type CompanyKey,
  type QuarterDecision,
} from '@/domain/simulation';
import { createMemoryRepositories } from '@/db/repositories/memory';
import type { AssignmentDoc, GroupDoc } from '@/db/models';
import type { Repositories } from '@/db/repositories/types';
import { GroupService } from '@/server/group/service';

/**
 * What the instructor sees while a quarter is still being decided.
 *
 * The students' waiting room names whoever is holding the group up; the
 * instructor's group page did not, which left the one person who can actually
 * unblock a match — by forcing the quarter or releasing a seat — as the only
 * person who could not see that it was blocked.
 *
 * The constraint that makes this delicate: an instructor demonstrating a match
 * in class usually has the screen projected. Showing WHO has submitted is the
 * point; showing WHAT they submitted, before the quarter runs, would hand the
 * room the early submitters' allocations and give everyone still deciding an
 * advantage the mode exists to deny. So the live view carries times, not
 * decisions — asserted below by shape, not by trust.
 */

const arena = getGameConfig(ARENA_SCENARIO_VERSION);

/** Six distinguishable strategies, so a leak would be identifiable. */
const STRATEGIES: QuarterDecision[] = [
  { productPoints: 41, technologyPoints: 17, marketingPoints: 13, distributionPoints: 19, cxPoints: 10, priceIndex: 103 },
  { productPoints: 12, technologyPoints: 44, marketingPoints: 16, distributionPoints: 18, cxPoints: 10, priceIndex: 117 },
  { productPoints: 14, technologyPoints: 11, marketingPoints: 47, distributionPoints: 18, cxPoints: 10, priceIndex: 91 },
  { productPoints: 13, technologyPoints: 12, marketingPoints: 14, distributionPoints: 46, cxPoints: 15, priceIndex: 109 },
  { productPoints: 16, technologyPoints: 13, marketingPoints: 12, distributionPoints: 16, cxPoints: 43, priceIndex: 96 },
  { productPoints: 22, technologyPoints: 23, marketingPoints: 21, distributionPoints: 16, cxPoints: 18, priceIndex: 112 },
];

let repos: Repositories;
let service: GroupService;
let assignment: AssignmentDoc;
let group: GroupDoc;
let seatByUid: Map<string, CompanyKey>;

function students(count = 6) {
  return Array.from({ length: count }, (_, i) => ({
    uid: `student-${i + 1}`,
    email: `student${i + 1}@example.edu`,
    displayName: `Student ${i + 1}`,
    studentCode: `SV00${i + 1}`,
  }));
}

async function setupMatch(memberCount = 6) {
  repos = createMemoryRepositories();
  service = new GroupService(repos);
  seatByUid = new Map();

  await repos.users.upsert({
    uid: 'instructor-1',
    email: 'teacher@example.edu',
    displayName: 'Teacher',
    role: 'INSTRUCTOR',
  });
  const course = await repos.courses.create({
    courseName: 'Digital Business',
    semester: '2026A',
    instructorId: 'instructor-1',
  });
  for (const student of students()) {
    await repos.users.upsert({ ...student, role: 'STUDENT' });
    await repos.courses.addMember({ ...student, courseId: course.id });
  }

  assignment = await repos.assignments.create({
    courseId: course.id,
    title: 'Group round 1',
    startAt: Date.now() - 1000,
    deadline: Date.now() + 86_400_000,
    maxAttempts: 1,
    scenarioVersion: ARENA_SCENARIO_VERSION,
    engineVersion: arena.engineVersion,
    officialSeed: 'smartwatch-v1-2026',
    isOpen: true,
    createdBy: 'instructor-1',
    mode: 'GROUP',
  });

  const [created] = await service.createGroups({
    assignmentId: assignment.id,
    count: 1,
    createdBy: 'instructor-1',
    namePrefix: 'Group',
  });
  group = created!;

  for (const student of students(memberCount)) {
    const { member } = await service.join({
      joinCode: group.joinCode,
      uid: student.uid,
      displayName: student.displayName,
      email: student.email,
      companyName: `Company ${student.uid}`,
      productName: 'Watch One',
      positioning: 'BALANCED',
    });
    seatByUid.set(student.uid, member.seatKey);
  }
}

/** Plays one full quarter with everybody submitting. */
async function playQuarter(quarter: number) {
  for (const [index, student] of students().entries()) {
    await service.submitDecision({
      groupId: group.id,
      uid: student.uid,
      quarter,
      decision: STRATEGIES[index]!,
    });
  }
}

/**
 * Every object anywhere in a structure that has the SHAPE of a decision.
 *
 * Lifted from group-confidentiality.test.ts, and for the reason recorded there:
 * scanning for bare numbers reports a leak that is not one, because a rival's
 * `12` collides with the trailing cents of a legitimate `returnCost:
 * 356331.12`. Five investment fields plus a price index together are
 * unmistakably a decision.
 */
function decisionsInside(value: unknown, found: QuarterDecision[] = []): QuarterDecision[] {
  if (Array.isArray(value)) {
    for (const item of value) decisionsInside(item, found);
    return found;
  }
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const looksLikeDecision =
      INVESTMENT_FIELDS.every((field) => typeof record[field] === 'number') &&
      typeof record.priceIndex === 'number';
    if (looksLikeDecision) found.push(record as unknown as QuarterDecision);
    for (const child of Object.values(record)) decisionsInside(child, found);
  }
  return found;
}

beforeEach(async () => {
  await setupMatch();
});

describe('the live status of a quarter still being decided', () => {
  it('names exactly who has submitted, and who the group is waiting on', async () => {
    await playQuarter(1);

    // Quarter 2: three of the six have decided.
    const early = students().slice(0, 3);
    for (const [index, student] of early.entries()) {
      await service.submitDecision({
        groupId: group.id,
        uid: student.uid,
        quarter: 2,
        decision: STRATEGIES[index]!,
      });
    }

    const state = await service.getState(group.id);
    expect(state.currentQuarter).toBe(2);

    const status = await service.listSubmissionStatus(group.id, 2);
    expect(status.map((s) => s.uid).sort()).toEqual(early.map((s) => s.uid).sort());
    expect(state.waitingOnSeats.map((seat) => seat).sort()).toEqual(
      students()
        .slice(3)
        .map((s) => seatByUid.get(s.uid)!)
        .sort(),
    );

    // Every row carries a usable timestamp — the column is the point of it.
    for (const row of status) {
      expect(typeof row.submittedAt).toBe('number');
      expect(row.submittedAt).toBeGreaterThan(0);
      expect(row.wasDefault).toBe(false);
    }
  });

  it('CARRIES NO ALLOCATION AT ALL BEFORE THE QUARTER RUNS', async () => {
    // The assertion that enforces the projection. Three students have decided
    // quarter 1; the instructor may see that they have, and nothing more.
    for (const [index, student] of students().slice(0, 3).entries()) {
      await service.submitDecision({
        groupId: group.id,
        uid: student.uid,
        quarter: 1,
        decision: STRATEGIES[index]!,
      });
    }

    const status = await service.listSubmissionStatus(group.id, 1);
    expect(status).toHaveLength(3);
    expect(decisionsInside(status)).toEqual([]);

    // Exact key set, so a later field cannot ride along unnoticed.
    for (const row of status) {
      expect(Object.keys(row).sort()).toEqual(['seatKey', 'submittedAt', 'uid', 'wasDefault']);
    }
  });

  it('orders the rows by seat, so the table matches the students own view', async () => {
    for (const [index, student] of students().entries()) {
      if (index % 2 === 1) continue;
      await service.submitDecision({
        groupId: group.id,
        uid: student.uid,
        quarter: 1,
        decision: STRATEGIES[index]!,
      });
    }

    const status = await service.listSubmissionStatus(group.id, 1);
    const positions = status.map((row) => ARENA_SEATS.indexOf(row.seatKey));
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
  });

  it('still shows every allocation once the quarter HAS run', async () => {
    // The inverse guarantee. Tightening the live view must not tighten the
    // played-quarter tables, which are the teaching material (spec 7.3).
    await playQuarter(1);

    const quarter = await repos.groupGames.getQuarter(group.id, 1);
    expect(quarter).not.toBeNull();
    expect(decisionsInside(quarter!.decisions)).toHaveLength(ARENA_SEATS.length);

    for (const [index, student] of students().entries()) {
      expect(quarter!.decisions[seatByUid.get(student.uid)!]).toEqual(STRATEGIES[index]);
    }
  });

  it('reports nothing to wait for once the match is over', async () => {
    for (let quarter = 1; quarter <= arena.quarters; quarter += 1) {
      await playQuarter(quarter);
    }

    const state = await service.getState(group.id);
    expect(state.completed).toBe(true);
    expect(state.currentQuarter).toBeNull();
    expect(state.waitingOnSeats).toEqual([]);
  });

  it('flags the rows the system filled in when the instructor forces a quarter', async () => {
    // Nobody should be marked on a decision they did not make without that
    // being visible on the screen the instructor grades from.
    for (const [index, student] of students().slice(0, 4).entries()) {
      await service.submitDecision({
        groupId: group.id,
        uid: student.uid,
        quarter: 1,
        decision: STRATEGIES[index]!,
      });
    }

    const forced = await service.forceQuarter(group.id);
    expect(forced.ran).toBe(true);
    expect(forced.filledSeats).toHaveLength(2);

    const status = await service.listSubmissionStatus(group.id, 1);
    const defaulted = status.filter((row) => row.wasDefault).map((row) => row.seatKey);
    expect(defaulted.sort()).toEqual([...forced.filledSeats].sort());
  });
});

describe('a group that is not full', () => {
  it('waits only on the seats a student actually holds', async () => {
    await setupMatch(4);

    const state = await service.getState(group.id);
    expect(state.botSeats).toHaveLength(ARENA_SEATS.length - 4);
    expect(state.waitingOnSeats).toHaveLength(4);

    for (const student of students(4)) {
      await service.submitDecision({
        groupId: group.id,
        uid: student.uid,
        quarter: 1,
        decision: STRATEGIES[0]!,
      });
    }

    // Four humans is enough to run the market: the bots are not waited on.
    const after = await service.getState(group.id);
    expect(after.currentQuarter).toBe(2);
  });
});
