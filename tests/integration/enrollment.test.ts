import { beforeEach, describe, expect, it } from 'vitest';
import { SCENARIO_VERSION, ENGINE_VERSION, type QuarterDecision } from '@/domain/simulation';
import { createMemoryRepositories } from '@/db/repositories/memory';
import type { Repositories } from '@/db/repositories/types';
import { createEnrollmentService, type EnrollmentService } from '@/server/game/enrollment';
import { GameService } from '@/server/game/service';

/**
 * Students joining a class themselves.
 *
 * The open-list design means the server can never trust the course the browser
 * names: the page the student saw is a snapshot, and the course may have closed
 * or been archived since it rendered.
 */

let repos: Repositories;
let enrollment: EnrollmentService;
let games: GameService;

const STUDENT = { uid: 'student-1', displayName: 'Nguyen Van A', email: 'a@uni.edu' };
const TEACHER = { uid: 'teacher-1', displayName: 'GV Tran', email: 'gv@uni.edu' };

beforeEach(async () => {
  repos = createMemoryRepositories();
  enrollment = createEnrollmentService(repos);
  games = new GameService(repos);

  await repos.users.upsert({ ...TEACHER, role: 'INSTRUCTOR' });
  await repos.users.upsert({ ...STUDENT, role: 'STUDENT' });
});

async function openCourse(name = 'Thương mại điện tử') {
  const course = await repos.courses.create({
    courseName: name,
    semester: 'HK1 2025-2026',
    instructorId: TEACHER.uid,
    enrollmentOpen: true,
  });
  return course;
}

function join(courseId: string, studentCode = 'SV001') {
  return enrollment.join({ ...STUDENT, courseId, studentCode });
}

describe('the list of joinable classes', () => {
  it('names the instructor, so a student can tell two sections apart', async () => {
    await openCourse();

    const [row] = await enrollment.listJoinable(STUDENT.uid);

    expect(row?.instructorName).toBe('GV Tran');
    expect(row?.alreadyMember).toBe(false);
  });

  it('marks a class the student is already in', async () => {
    const course = await openCourse();
    await join(course.id);

    const [row] = await enrollment.listJoinable(STUDENT.uid);
    expect(row?.alreadyMember).toBe(true);
  });

  it('omits closed and archived classes', async () => {
    await repos.courses.create({
      courseName: 'Closed',
      semester: 'HK1',
      instructorId: TEACHER.uid,
    });
    const archived = await openCourse('Archived');
    await repos.courses.setArchived(archived.id, Date.now());

    expect(await enrollment.listJoinable(STUDENT.uid)).toEqual([]);
  });
});

describe('joining', () => {
  it('puts the student on the roster', async () => {
    const course = await openCourse();

    await join(course.id);

    const member = await repos.courses.getMember(course.id, STUDENT.uid);
    expect(member?.studentCode).toBe('SV001');
    expect(member?.email).toBe('a@uni.edu');
  });

  it('refuses a course that closed after the page rendered', async () => {
    const course = await openCourse();
    await repos.courses.update(course.id, { enrollmentOpen: false });

    await expect(join(course.id)).rejects.toMatchObject({ key: 'enrollmentClosed' });
  });

  it('refuses a course archived after the page rendered', async () => {
    const course = await openCourse();
    await repos.courses.setArchived(course.id, Date.now());

    await expect(join(course.id)).rejects.toMatchObject({ key: 'enrollmentClosed' });
  });

  it('refuses a course that does not exist', async () => {
    await expect(join('no-such-course')).rejects.toMatchObject({ key: 'courseNotFound' });
  });

  it('refuses a student code another student already holds', async () => {
    const course = await openCourse();
    await join(course.id, 'SV001');

    await expect(
      enrollment.join({
        uid: 'student-2',
        displayName: 'B',
        email: 'b@uni.edu',
        courseId: course.id,
        studentCode: 'SV001',
      }),
    ).rejects.toMatchObject({ key: 'studentCodeTaken' });
  });

  it('refuses joining twice', async () => {
    const course = await openCourse();
    await join(course.id);

    await expect(join(course.id, 'SV999')).rejects.toMatchObject({ key: 'alreadyEnrolled' });
  });

  it('rejects a blank student code', async () => {
    const course = await openCourse();
    await expect(join(course.id, '   ')).rejects.toMatchObject({ key: 'invalidInput' });
  });
});

describe('leaving', () => {
  const decision: QuarterDecision = {
    productPoints: 20,
    technologyPoints: 20,
    marketingPoints: 20,
    distributionPoints: 20,
    cxPoints: 20,
    priceIndex: 100,
  };

  it('is allowed before any official attempt', async () => {
    const course = await openCourse();
    await join(course.id);

    await enrollment.leave(STUDENT.uid, course.id);

    expect(await enrollment.listEnrolled(STUDENT.uid)).toEqual([]);
  });

  it('keeps the roster row rather than deleting it', async () => {
    const course = await openCourse();
    await join(course.id);
    await enrollment.leave(STUDENT.uid, course.id);

    // Still reachable, so the instructor's participation view can name them.
    expect(await repos.courses.getMember(course.id, STUDENT.uid)).not.toBeNull();
  });

  it('is refused once an official assignment has been started', async () => {
    const course = await openCourse();
    await join(course.id);
    const assignment = await repos.assignments.create({
      courseId: course.id,
      title: 'Bài tập 1',
      startAt: Date.now() - 1000,
      deadline: Date.now() + 86_400_000,
      maxAttempts: 1,
      scenarioVersion: SCENARIO_VERSION,
      engineVersion: ENGINE_VERSION,
      officialSeed: 'seed-1',
      isOpen: true,
      createdBy: TEACHER.uid,
    });
    const session = await games.createSession({
      userId: STUDENT.uid,
      displayName: STUDENT.displayName,
      email: STUDENT.email,
      mode: 'OFFICIAL',
      assignmentId: assignment.id,
      companyName: 'NovaTime',
      productName: 'Nova One',
      positioning: 'BALANCED',
    });
    await games.submitQuarter(session.id, STUDENT.uid, 1, decision);

    await expect(enrollment.leave(STUDENT.uid, course.id)).rejects.toMatchObject({
      key: 'cannotLeaveAfterStarting',
    });
    expect((await enrollment.listEnrolled(STUDENT.uid))[0]?.canLeave).toBe(false);
  });

  it('refuses when the student is not in the class', async () => {
    const course = await openCourse();
    await expect(enrollment.leave(STUDENT.uid, course.id)).rejects.toMatchObject({
      key: 'notEnrolled',
    });
  });
});

describe('an archived class stays visible to the student who is in it', () => {
  it('is listed, flagged, rather than disappearing', async () => {
    // The student keeps the route to a report and a leaderboard they earned.
    const course = await openCourse();
    await join(course.id);
    await repos.courses.setArchived(course.id, Date.now());

    const [row] = await enrollment.listEnrolled(STUDENT.uid);

    expect(row?.course.id).toBe(course.id);
    expect(row?.archived).toBe(true);
  });
});
