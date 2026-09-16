import { beforeEach, describe, expect, it } from 'vitest';
import { ARENA_SCENARIO_VERSION, getGameConfig, type QuarterDecision } from '@/domain/simulation';
import { createMemoryRepositories } from '@/db/repositories/memory';
import type { AssignmentDoc, GroupDoc } from '@/db/models';
import type { Repositories } from '@/db/repositories/types';
import { GroupService } from '@/server/group/service';
import { groupsToCsv } from '@/server/instructor/csv';

/**
 * The group export.
 *
 * The one file in the system that carries every company's exact allocation.
 * That is deliberate and is the inverse of the student view: staff may see
 * exact decisions (spec 7.3), and comparing six of them side by side is how an
 * instructor explains why one company beat another.
 */

const arena = getGameConfig(ARENA_SCENARIO_VERSION);

/** Six distinctive strategies, so each row is identifiable in the output. */
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

/** Assembles the export input the way the route does. */
async function exportGroup() {
  const [members, quarters] = await Promise.all([
    repos.groups.listMembers(group.id),
    repos.groupGames.listQuarters(group.id),
  ]);

  const defaults = new Map<string, boolean>();
  for (const quarter of quarters) {
    for (const submission of await repos.groupGames.listSubmissions(group.id, quarter.quarter)) {
      defaults.set(`${quarter.quarter}_${submission.seatKey}`, submission.wasDefault);
    }
  }

  return groupsToCsv([
    {
      groupName: group.name,
      quarters,
      members: members.map((m) => ({
        seatKey: m.seatKey,
        studentCode: m.studentCode,
        displayName: m.displayName,
        email: m.email,
        companyName: m.companyName,
      })),
      defaults,
    },
  ]);
}

beforeEach(async () => {
  await setupMatch();
});

describe('the group export', () => {
  it('writes one row per company per quarter — all six, not just one', async () => {
    for (const [index, student] of students().entries()) {
      await service.submitDecision({
        groupId: group.id,
        uid: student.uid,
        quarter: 1,
        decision: STRATEGIES[index]!,
      });
    }

    const rows = (await exportGroup()).trim().split('\r\n').slice(1);
    expect(rows).toHaveLength(6);
  });

  it('CARRIES EVERY COMPANY EXACT ALLOCATION — the opposite of the student view', async () => {
    for (const [index, student] of students().entries()) {
      await service.submitDecision({
        groupId: group.id,
        uid: student.uid,
        quarter: 1,
        decision: STRATEGIES[index]!,
      });
    }

    const csv = await exportGroup();
    const rows = csv.trim().split('\r\n').slice(1);

    // Every strategy must appear, in full, on some row.
    for (const strategy of STRATEGIES) {
      const signature = [
        strategy.productPoints,
        strategy.technologyPoints,
        strategy.marketingPoints,
        strategy.distributionPoints,
        strategy.cxPoints,
        strategy.priceIndex,
      ].join(',');
      expect({ signature, present: rows.some((row) => row.includes(signature)) }).toEqual({
        signature,
        present: true,
      });
    }
  });

  it('identifies the student behind each company', async () => {
    for (const [index, student] of students().entries()) {
      await service.submitDecision({
        groupId: group.id,
        uid: student.uid,
        quarter: 1,
        decision: STRATEGIES[index]!,
      });
    }

    const csv = await exportGroup();
    for (const student of students()) {
      expect(csv).toContain(student.studentCode);
      expect(csv).toContain(student.email);
    }
    expect(csv).toContain(group.name);
  });

  it('flags a decision the system supplied', async () => {
    await service.submitDecision({
      groupId: group.id,
      uid: 'student-1',
      quarter: 1,
      decision: STRATEGIES[0]!,
    });
    await service.forceQuarter(group.id);

    const csv = await exportGroup();
    const header = csv.trim().split('\r\n')[0]!.split(',');
    const flagIndex = header.indexOf('was_default');
    expect(flagIndex).toBeGreaterThan(-1);

    const rows = csv.trim().split('\r\n').slice(1);
    const flags = rows.map((row) => row.split(',')[flagIndex]);
    // Five filled in by the instructor forcing the quarter, one genuine.
    expect(flags.filter((flag) => flag === '1')).toHaveLength(5);
    expect(flags.filter((flag) => flag === '0')).toHaveLength(1);
  });

  it('includes bot-driven seats, with no student attached', async () => {
    // The market in the file has to be the market that was simulated.
    await setupMatch(4);
    for (const [index, student] of students(4).entries()) {
      await service.submitDecision({
        groupId: group.id,
        uid: student.uid,
        quarter: 1,
        decision: STRATEGIES[index]!,
      });
    }

    const csv = await exportGroup();
    const header = csv.trim().split('\r\n')[0]!.split(',');
    const codeIndex = header.indexOf('student_code');
    const rows = csv.trim().split('\r\n').slice(1);

    expect(rows).toHaveLength(6);
    expect(rows.filter((row) => row.split(',')[codeIndex] === '')).toHaveLength(2);
  });

  it('covers all six quarters of a finished match', async () => {
    for (let quarter = 1; quarter <= arena.quarters; quarter += 1) {
      for (const [index, student] of students().entries()) {
        await service.submitDecision({
          groupId: group.id,
          uid: student.uid,
          quarter,
          decision: STRATEGIES[index]!,
        });
      }
    }

    const rows = (await exportGroup()).trim().split('\r\n').slice(1);
    expect(rows).toHaveLength(6 * arena.quarters);
  });

  it('is still protected against spreadsheet formula injection', async () => {
    // A company name is student input and lands in this file unescaped
    // otherwise — the same risk the other two exports already guard against.
    await setupMatch(0);
    await service.join({
      joinCode: group.joinCode,
      uid: 'student-1',
      displayName: 'Student 1',
      email: 'student1@example.edu',
      companyName: '=HYPERLINK("http://evil","Grades")',
      productName: 'Watch One',
      positioning: 'BALANCED',
    });
    await service.submitDecision({
      groupId: group.id,
      uid: 'student-1',
      quarter: 1,
      decision: STRATEGIES[0]!,
    });

    const csv = await exportGroup();
    expect(csv).toContain("'=HYPERLINK");
  });
});
