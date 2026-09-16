import { beforeEach, describe, expect, it } from 'vitest';
import { ENGINE_VERSION, SCENARIO_VERSION, type QuarterDecision } from '@/domain/simulation';
import { createMemoryRepositories } from '@/db/repositories/memory';
import type { Repositories } from '@/db/repositories/types';
import { GameService } from '@/server/game/service';
import { quartersToCsv, resultsToCsv } from '@/server/instructor/csv';

/**
 * The invariant the whole archiving design exists to protect.
 *
 * Archiving HIDES. It must never change a grade, reorder a leaderboard, or
 * remove a row from the gradebook. Ranks are rendered as the position in the
 * returned array, so dropping one archived student would silently move every
 * student below them up a place — on a report page they have already seen.
 */

let repos: Repositories;
let games: GameService;

const TEACHER = { uid: 'teacher-1', displayName: 'GV', email: 'gv@uni.edu' };
const A = { uid: 'student-a', displayName: 'Sinh vien A', email: 'a@uni.edu' };
const B = { uid: 'student-b', displayName: 'Sinh vien B', email: 'b@uni.edu' };

const strong: QuarterDecision = {
  productPoints: 30,
  technologyPoints: 20,
  marketingPoints: 40,
  distributionPoints: 10,
  cxPoints: 0,
  priceIndex: 100,
};
const weak: QuarterDecision = {
  productPoints: 0,
  technologyPoints: 0,
  marketingPoints: 0,
  distributionPoints: 0,
  cxPoints: 100,
  priceIndex: 120,
};

async function seedGradedAssignment() {
  const course = await repos.courses.create({
    courseName: 'Thương mại điện tử',
    semester: 'HK1 2025-2026',
    instructorId: TEACHER.uid,
    enrollmentOpen: true,
  });
  const assignment = await repos.assignments.create({
    courseId: course.id,
    title: 'Bài tập 1',
    startAt: Date.now() - 1000,
    deadline: Date.now() + 86_400_000,
    maxAttempts: 1,
    scenarioVersion: SCENARIO_VERSION,
    engineVersion: ENGINE_VERSION,
    officialSeed: 'official-seed',
    isOpen: true,
    createdBy: TEACHER.uid,
  });

  for (const [student, code, decision] of [
    [A, 'SV001', strong],
    [B, 'SV002', weak],
  ] as const) {
    await repos.users.upsert({ ...student, role: 'STUDENT' });
    await repos.courses.selfEnroll({
      uid: student.uid,
      courseId: course.id,
      studentCode: code,
      displayName: student.displayName,
      email: student.email,
    });
    const session = await games.createSession({
      userId: student.uid,
      displayName: student.displayName,
      email: student.email,
      mode: 'OFFICIAL',
      assignmentId: assignment.id,
      companyName: `Co-${code}`,
      productName: 'Watch',
      positioning: 'BALANCED',
    });
    for (let q = 1; q <= 6; q += 1) {
      await games.submitQuarter(session.id, student.uid, q, decision);
    }
  }

  return { course, assignment };
}

/** The leaderboard and both CSVs, as one comparable snapshot. */
async function gradebookSnapshot(courseId: string, assignmentId: string) {
  const results = await repos.finalResults.listByAssignment(assignmentId, 'finalScore');
  const members = await repos.courses.listMembers(courseId);
  const quarters = await Promise.all(
    results.map(async (r) => ({
      studentCode: r.studentCode,
      displayName: r.displayName,
      companyName: r.companyName,
      quarters: await repos.sessions.listQuarters(r.sessionId),
    })),
  );

  return {
    order: results.map((r) => `${r.studentCode}:${r.finalScore}`),
    resultsCsv: resultsToCsv(results),
    quartersCsv: quartersToCsv(quarters),
    memberCount: members.length,
  };
}

beforeEach(async () => {
  repos = createMemoryRepositories();
  games = new GameService(repos);
  await repos.users.upsert({ ...TEACHER, role: 'INSTRUCTOR' });
});

describe('archiving never touches a grade', () => {
  it('leaves the leaderboard order and both exports byte-identical', async () => {
    const { course, assignment } = await seedGradedAssignment();
    const before = await gradebookSnapshot(course.id, assignment.id);
    expect(before.order).toHaveLength(2);

    // Everything an administrator could do, at once.
    await repos.courses.setArchived(course.id, Date.now());
    await repos.assignments.setArchived(assignment.id, Date.now());
    await repos.courses.setMemberRemoved(course.id, A.uid, Date.now());
    await repos.users.setArchived(A.uid, Date.now());

    const after = await gradebookSnapshot(course.id, assignment.id);

    expect(after.order).toEqual(before.order);
    expect(after.resultsCsv).toBe(before.resultsCsv);
    expect(after.quartersCsv).toBe(before.quartersCsv);
    expect(after.memberCount).toBe(before.memberCount);
  });

  it('keeps every graded row after a restore too', async () => {
    const { course, assignment } = await seedGradedAssignment();
    const before = await gradebookSnapshot(course.id, assignment.id);

    await repos.courses.setArchived(course.id, Date.now());
    await repos.courses.setArchived(course.id, null);

    expect(await gradebookSnapshot(course.id, assignment.id)).toEqual(before);
  });

  it('does not renumber a rank when a student is archived', async () => {
    const { course, assignment } = await seedGradedAssignment();
    const board = await repos.finalResults.listByAssignment(assignment.id, 'finalScore');
    const lastPlace = board[board.length - 1]!;

    await repos.users.setArchived(board[0]!.userId, Date.now());
    await repos.courses.setMemberRemoved(course.id, board[0]!.userId, Date.now());

    const after = await repos.finalResults.listByAssignment(assignment.id, 'finalScore');
    expect(after.findIndex((r) => r.sessionId === lastPlace.sessionId)).toBe(board.length - 1);
  });

  it('still finds the member record that supplies a student code at finalize', async () => {
    // getMember is archive-blind on purpose: it feeds the studentCode written
    // into the immutable graded row, and a null there loses the gradebook key.
    const { course } = await seedGradedAssignment();
    await repos.courses.setMemberRemoved(course.id, A.uid, Date.now());

    const member = await repos.courses.getMember(course.id, A.uid);
    expect(member?.studentCode).toBe('SV001');
  });
});

describe('the participation view never loses a student who played', () => {
  it('keeps a removed student listed, marked, alongside the leaderboard', async () => {
    // Driving this view from the roster alone would drop them here while their
    // row stayed on the leaderboard — two screens for one instructor
    // disagreeing, about someone who already has a grade.
    const { course, assignment } = await seedGradedAssignment();
    await repos.courses.setMemberRemoved(course.id, A.uid, Date.now());

    const members = await repos.courses.listMembers(course.id);
    const removed = members.find((m) => m.uid === A.uid);

    expect(members).toHaveLength(2);
    expect(removed?.removedAt).toBeTypeOf('number');

    const board = await repos.finalResults.listByAssignment(assignment.id, 'finalScore');
    expect(board.map((r) => r.userId)).toContain(A.uid);
  });
});

describe('correcting a student code after a grade exists', () => {
  it('changes the roster but not the code already written into the graded row', async () => {
    // The graded row is a snapshot taken at finalize. Rewriting history would
    // change a record an instructor may already have exported and marked.
    const { course, assignment } = await seedGradedAssignment();
    const before = await repos.finalResults.listByAssignment(assignment.id, 'finalScore');
    const graded = before.find((r) => r.userId === A.uid)!;

    await repos.courses.updateMember(course.id, A.uid, { studentCode: 'SV999' });

    expect((await repos.courses.getMember(course.id, A.uid))?.studentCode).toBe('SV999');
    const after = await repos.finalResults.listByAssignment(assignment.id, 'finalScore');
    expect(after.find((r) => r.userId === A.uid)?.studentCode).toBe(graded.studentCode);
  });
});
