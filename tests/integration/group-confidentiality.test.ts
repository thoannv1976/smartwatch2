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
import { getQuarterView, getGroupReportView } from '@/server/group/queries';

/**
 * What a student is allowed to learn about their classmates.
 *
 * In solo play a rival is an invented brand and leaking its allocation would be
 * a curiosity. Here the rival is a person sitting in the same room who is being
 * marked against the viewer, so this is the most serious new risk in Part 2 and
 * gets its own file.
 *
 * The rule is the same one the solo game already follows (spec 7.3): public
 * outcomes — share, units, revenue, profit, satisfaction, rank — are visible,
 * because they are what a real market reveals. The five POINT ALLOCATIONS and
 * price indexes are not.
 */

const arena = getGameConfig(ARENA_SCENARIO_VERSION);

/** Six deliberately distinctive strategies, so a leak is unmistakable. */
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
let seatByUid = new Map<string, CompanyKey>();

function students() {
  return Array.from({ length: 6 }, (_, i) => ({
    uid: `student-${i + 1}`,
    email: `student${i + 1}@example.edu`,
    displayName: `Student ${i + 1}`,
    studentCode: `SV00${i + 1}`,
  }));
}

/** Plays `quarters` quarters with each student on their own distinctive strategy. */
async function playMatch(quarters = 1) {
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

  for (const student of students()) {
    const joined = await service.join({
      joinCode: group.joinCode,
      uid: student.uid,
      displayName: student.displayName,
      email: student.email,
      companyName: `Company ${student.uid}`,
      productName: 'Watch One',
      positioning: 'BALANCED',
    });
    seatByUid.set(student.uid, joined.member.seatKey);
  }

  for (let quarter = 1; quarter <= quarters; quarter += 1) {
    for (const [index, student] of students().entries()) {
      await service.submitDecision({
        groupId: group.id,
        uid: student.uid,
        quarter,
        decision: STRATEGIES[index]!,
      });
    }
  }
}

/**
 * Every object anywhere in a structure that has the shape of a decision.
 *
 * Scanning for bare NUMBERS was the first attempt and it does not work: a
 * rival's `12` collides with the trailing cents of a legitimate
 * `returnCost: 356331.12`, so the test reported a leak that was not one.
 * Matching the SHAPE has no such false positive — five investment fields plus
 * a price index together are unmistakably a decision, and accidentally
 * including one is exactly the mistake worth catching.
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
  await playMatch(1);
});

describe('a quarter, as one student sees it', () => {
  it('carries the viewer OWN decision', async () => {
    for (const [index, student] of students().entries()) {
      const seat = seatByUid.get(student.uid)!;
      const view = await getQuarterView(repos, group.id, seat, 1);
      expect(view).not.toBeNull();
      expect(view!.yourDecision).toEqual(STRATEGIES[index]);
    }
  });

  it('CARRIES NO RIVAL ALLOCATION ANYWHERE IN IT', async () => {
    // The core assertion of Part 2's confidentiality story. Walk the whole
    // view, however deeply nested, and collect every object shaped like a
    // decision. The viewer's own must be the only one there.
    for (const [index, student] of students().entries()) {
      const seat = seatByUid.get(student.uid)!;
      const view = await getQuarterView(repos, group.id, seat, 1);

      const found = decisionsInside(view);
      expect({ viewer: student.uid, count: found.length }).toEqual({
        viewer: student.uid,
        count: 1,
      });
      expect(found[0]).toEqual(STRATEGIES[index]);
    }
  });

  it('never carries a `decisions` map at all', async () => {
    // Belt and braces: the stored quarter has one and the view must not, so a
    // future field added to the view cannot accidentally bring it along.
    const seat = seatByUid.get('student-1')!;
    const view = await getQuarterView(repos, group.id, seat, 1);
    expect(JSON.stringify(view)).not.toContain('"decisions"');

    const stored = await repos.groupGames.getQuarter(group.id, 1);
    expect(Object.keys(stored!.decisions)).toHaveLength(6);
  });

  it('does show the public outcomes a real market would reveal', async () => {
    const seat = seatByUid.get('student-1')!;
    const view = await getQuarterView(repos, group.id, seat, 1);

    expect(view!.rivals).toHaveLength(5);
    for (const rival of view!.rivals) {
      expect(rival.seatKey).not.toBe(seat);
      expect(Number.isFinite(rival.marketShare)).toBe(true);
      expect(Number.isFinite(rival.unitsSold)).toBe(true);
      expect(Number.isFinite(rival.rank)).toBe(true);
      // And nothing resembling an allocation.
      expect(Object.keys(rival)).not.toContain('decision');
      expect(Object.keys(rival)).not.toContain('priceIndex');
    }
  });

  it('says a qualitative line about each rival and nothing about the viewer', async () => {
    const seat = seatByUid.get('student-3')!;
    const view = await getQuarterView(repos, group.id, seat, 1);

    expect(view!.intel).toHaveLength(5);
    expect(view!.intel.map((i) => i.companyKey)).not.toContain(seat);
    // The line is a dictionary KEY, never a number.
    for (const line of view!.intel) {
      expect(typeof line.key).toBe('string');
    }
  });

  it('gives each of the six a DIFFERENT view of the same quarter', async () => {
    // Proof that intel is per viewer rather than one stored list.
    const views = await Promise.all(
      students().map((student) =>
        getQuarterView(repos, group.id, seatByUid.get(student.uid)!, 1),
      ),
    );
    const signatures = views.map((view) =>
      view!.intel.map((line) => line.companyKey).sort().join(','),
    );
    expect(new Set(signatures).size).toBe(6);
  });

  it('marks a bot-driven company as such', async () => {
    await playMatch(0);
    await service.releaseSeat(group.id, 'student-6');
    for (const [index, student] of students().slice(0, 5).entries()) {
      await service.submitDecision({
        groupId: group.id,
        uid: student.uid,
        quarter: 1,
        decision: STRATEGIES[index]!,
      });
    }

    const view = await getQuarterView(repos, group.id, seatByUid.get('student-1')!, 1);
    const bots = view!.rivals.filter((r) => r.isBot);
    expect(bots).toHaveLength(1);
    expect(bots[0]!.seatKey).toBe(seatByUid.get('student-6'));
  });

  it('flags a decision that was made on the viewer behalf', async () => {
    await playMatch(0);
    await service.submitDecision({
      groupId: group.id,
      uid: 'student-1',
      quarter: 1,
      decision: STRATEGIES[0]!,
    });
    await service.forceQuarter(group.id);

    const own = await getQuarterView(repos, group.id, seatByUid.get('student-1')!, 1);
    const forced = await getQuarterView(repos, group.id, seatByUid.get('student-2')!, 1);

    expect(own!.yourDecisionWasDefault).toBe(false);
    expect(forced!.yourDecisionWasDefault).toBe(true);
  });
});

describe('the final report, as one student sees it', () => {
  it('carries no rival allocation either', async () => {
    await playMatch(arena.quarters);

    for (const [index, student] of students().entries()) {
      const report = await getGroupReportView(repos, group.id, student.uid);
      expect(report).not.toBeNull();

      // Six quarters, so the viewer's own decision may legitimately appear
      // several times — but it must be the only decision in there.
      const found = decisionsInside(report);
      for (const decision of found) {
        expect({ viewer: student.uid, decision }).toEqual({
          viewer: student.uid,
          decision: STRATEGIES[index],
        });
      }
    }
  });

  it('ranks the viewer inside their group', async () => {
    await playMatch(arena.quarters);
    const report = await getGroupReportView(repos, group.id, 'student-1');

    expect(report!.scores).toHaveLength(6);
    expect(report!.yourScore.companyKey).toBe(seatByUid.get('student-1'));
    expect(report!.yourScore.gameRank).toBeGreaterThanOrEqual(1);
    expect(report!.yourScore.gameRank).toBeLessThanOrEqual(6);
  });

  it('is withheld until every quarter has been played', async () => {
    await playMatch(3);
    expect(await getGroupReportView(repos, group.id, 'student-1')).toBeNull();
  });

  it('lists the quarters a decision was made for the viewer', async () => {
    await playMatch(0);
    await service.forceQuarter(group.id);
    for (let quarter = 2; quarter <= arena.quarters; quarter += 1) {
      for (const [index, student] of students().entries()) {
        await service.submitDecision({
          groupId: group.id,
          uid: student.uid,
          quarter,
          decision: STRATEGIES[index]!,
        });
      }
    }

    const report = await getGroupReportView(repos, group.id, 'student-1');
    expect(report!.defaultedQuarters).toEqual([1]);
  });
});

describe('seat keys stay out of sight', () => {
  it('shows companies by the name their owner chose', async () => {
    const view = await getQuarterView(repos, group.id, seatByUid.get('student-1')!, 1);
    for (const rival of view!.rivals) {
      expect(rival.companyName).toMatch(/^Company student-\d$/);
    }
  });

  it('covers every seat but the viewer', async () => {
    const seat = seatByUid.get('student-4')!;
    const view = await getQuarterView(repos, group.id, seat, 1);
    const covered = [...view!.rivals.map((r) => r.seatKey), seat].sort();
    expect(covered).toEqual([...ARENA_SEATS].sort());
  });
});
