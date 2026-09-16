import { beforeEach, describe, expect, it } from 'vitest';
import { activeOnly, isArchived, isRemoved, type Archivable, type CourseDoc } from '@/db/models';
import { createMemoryRepositories } from '@/db/repositories/memory';
import type { Repositories } from '@/db/repositories/types';

/**
 * Archiving, self-enrolment and role invites at the repository level.
 *
 * The one rule these exist to defend: archiving HIDES, it never destroys, and
 * it must never make a document written before archiving existed disappear.
 */

let repos: Repositories;

beforeEach(() => {
  repos = createMemoryRepositories();
});

async function makeCourse(overrides: Partial<CourseDoc> = {}) {
  return repos.courses.create({
    courseName: 'Thương mại điện tử',
    semester: 'HK1 2025-2026',
    instructorId: 'teacher-1',
    ...overrides,
  });
}

describe('the archived predicate tolerates documents that predate the field', () => {
  /**
   * The live database already holds courses, members and assignments written
   * before `archivedAt` existed. Firestore cannot tell "missing" from any
   * value, and excludes documents lacking a field from every query that
   * mentions it — so an equality filter would have hidden the whole class.
   * These assertions pin the tolerant behaviour that replaces it.
   */
  it('treats a missing field as not archived', () => {
    expect(isArchived({})).toBe(false);
    expect(isArchived({ archivedAt: undefined })).toBe(false);
    expect(isArchived({ archivedAt: null })).toBe(false);
    expect(isArchived({ archivedAt: 1_700_000_000_000 })).toBe(true);
  });

  it('keeps legacy rows in a filtered list', () => {
    // `legacy` has no archivedAt at all — the shape every row in the live
    // database has today.
    const rows: ({ id: string } & Archivable)[] = [
      { id: 'old' },
      { id: 'new', archivedAt: null },
      { id: 'gone', archivedAt: 1 },
    ];

    expect(activeOnly(rows).map((d) => d.id)).toEqual(['old', 'new']);
  });

  it('treats a missing removedAt as still on the roster', () => {
    const legacy = {
      uid: 'u1',
      courseId: 'c1',
      studentCode: 'SV001',
      displayName: 'A',
      email: 'a@x.edu',
      joinedAt: 1,
    };
    expect(isRemoved(legacy)).toBe(false);
  });
});

describe('courses students may join', () => {
  it('lists only courses whose enrolment is open', async () => {
    await makeCourse({ courseName: 'Closed' });
    const open = await makeCourse({ courseName: 'Open', enrollmentOpen: true });

    const listed = await repos.courses.listOpenForEnrollment();

    expect(listed.map((c) => c.id)).toEqual([open.id]);
  });

  it('defaults a new course to closed, so a deploy cannot open one', async () => {
    const course = await makeCourse();
    expect(course.enrollmentOpen).toBe(false);
    expect(await repos.courses.listOpenForEnrollment()).toEqual([]);
  });

  it('drops an archived course from the list but keeps the document', async () => {
    const course = await makeCourse({ enrollmentOpen: true });
    await repos.courses.setArchived(course.id, Date.now());

    expect(await repos.courses.listOpenForEnrollment()).toEqual([]);
    expect(await repos.courses.get(course.id)).not.toBeNull();
  });

  it('restores on un-archive', async () => {
    const course = await makeCourse({ enrollmentOpen: true });
    await repos.courses.setArchived(course.id, Date.now());
    await repos.courses.setArchived(course.id, null);

    expect((await repos.courses.listOpenForEnrollment()).map((c) => c.id)).toEqual([course.id]);
  });
});

describe('self-enrolment', () => {
  const student = {
    uid: 'student-1',
    studentCode: 'SV001',
    displayName: 'Nguyen Van A',
    email: 'a@uni.edu',
  };

  it('adds the student to the roster', async () => {
    const course = await makeCourse({ enrollmentOpen: true });

    const outcome = await repos.courses.selfEnroll({ ...student, courseId: course.id });

    expect(outcome.status).toBe('JOINED');
    expect((await repos.courses.listMembers(course.id)).map((m) => m.uid)).toEqual([student.uid]);
  });

  it('refuses a second enrolment instead of overwriting the first', async () => {
    const course = await makeCourse({ enrollmentOpen: true });
    await repos.courses.selfEnroll({ ...student, courseId: course.id });

    const again = await repos.courses.selfEnroll({
      ...student,
      courseId: course.id,
      studentCode: 'DIFFERENT',
    });

    expect(again.status).toBe('ALREADY_MEMBER');
    const member = await repos.courses.getMember(course.id, student.uid);
    expect(member?.studentCode).toBe('SV001');
  });

  it('refuses a student code already taken in the same course', async () => {
    const course = await makeCourse({ enrollmentOpen: true });
    await repos.courses.selfEnroll({ ...student, courseId: course.id });

    const clash = await repos.courses.selfEnroll({
      uid: 'student-2',
      courseId: course.id,
      studentCode: 'SV001',
      displayName: 'Impostor',
      email: 'b@uni.edu',
    });

    expect(clash.status).toBe('CODE_TAKEN');
  });

  it('allows the same code in a different course', async () => {
    const a = await makeCourse({ courseName: 'A', enrollmentOpen: true });
    const b = await makeCourse({ courseName: 'B', enrollmentOpen: true });
    await repos.courses.selfEnroll({ ...student, courseId: a.id });

    const other = await repos.courses.selfEnroll({
      uid: 'student-2',
      courseId: b.id,
      studentCode: 'SV001',
      displayName: 'Someone else',
      email: 'b@uni.edu',
    });

    expect(other.status).toBe('JOINED');
  });

  it('creates exactly one membership when two enrolments race', async () => {
    const course = await makeCourse({ enrollmentOpen: true });

    const outcomes = await Promise.all([
      repos.courses.selfEnroll({ ...student, courseId: course.id }),
      repos.courses.selfEnroll({ ...student, courseId: course.id }),
    ]);

    expect(outcomes.filter((o) => o.status === 'JOINED')).toHaveLength(1);
    expect(await repos.courses.listMembers(course.id)).toHaveLength(1);
  });

  it('keeps the original student code when a removed student rejoins', async () => {
    // That code may already be inside a graded FinalResultDoc from an earlier
    // attempt; two codes for one person breaks the gradebook join.
    const course = await makeCourse({ enrollmentOpen: true });
    await repos.courses.selfEnroll({ ...student, courseId: course.id });
    await repos.courses.setMemberRemoved(course.id, student.uid, Date.now());

    const rejoin = await repos.courses.selfEnroll({
      ...student,
      courseId: course.id,
      studentCode: 'TYPED-SOMETHING-ELSE',
    });

    expect(rejoin.status).toBe('JOINED');
    const member = await repos.courses.getMember(course.id, student.uid);
    expect(member?.studentCode).toBe('SV001');
    expect(isRemoved(member!)).toBe(false);
  });
});

describe('removing a student keeps the row', () => {
  it('marks rather than deletes, so listMembers still names them', async () => {
    const course = await makeCourse({ enrollmentOpen: true });
    await repos.courses.selfEnroll({
      uid: 'student-1',
      courseId: course.id,
      studentCode: 'SV001',
      displayName: 'A',
      email: 'a@uni.edu',
    });

    await repos.courses.setMemberRemoved(course.id, 'student-1', Date.now());

    const members = await repos.courses.listMembers(course.id);
    expect(members).toHaveLength(1);
    expect(isRemoved(members[0]!)).toBe(true);
  });

  it('still returns a removed member from getMember', async () => {
    // getMember feeds the enrolment check mid-game, leaderboard access, and the
    // student code written into the graded row. It must stay archive-blind.
    const course = await makeCourse({ enrollmentOpen: true });
    await repos.courses.selfEnroll({
      uid: 'student-1',
      courseId: course.id,
      studentCode: 'SV001',
      displayName: 'A',
      email: 'a@uni.edu',
    });
    await repos.courses.setMemberRemoved(course.id, 'student-1', Date.now());

    const member = await repos.courses.getMember(course.id, 'student-1');
    expect(member).not.toBeNull();
    expect(member!.studentCode).toBe('SV001');
  });
});

describe('correcting a student code', () => {
  beforeEach(async () => {
    const course = await makeCourse({ enrollmentOpen: true });
    await repos.courses.selfEnroll({
      uid: 'student-1',
      courseId: course.id,
      studentCode: 'TYPO',
      displayName: 'A',
      email: 'a@uni.edu',
    });
  });

  it('applies the correction and frees the old code', async () => {
    const [course] = await repos.courses.listAll();

    const result = await repos.courses.updateMember(course!.id, 'student-1', {
      studentCode: 'SV001',
    });

    expect(result.ok).toBe(true);
    expect((await repos.courses.getMember(course!.id, 'student-1'))?.studentCode).toBe('SV001');

    const reuse = await repos.courses.selfEnroll({
      uid: 'student-2',
      courseId: course!.id,
      studentCode: 'TYPO',
      displayName: 'B',
      email: 'b@uni.edu',
    });
    expect(reuse.status).toBe('JOINED');
  });

  it('refuses a code another student in the course already holds', async () => {
    const [course] = await repos.courses.listAll();
    await repos.courses.selfEnroll({
      uid: 'student-2',
      courseId: course!.id,
      studentCode: 'SV002',
      displayName: 'B',
      email: 'b@uni.edu',
    });

    const result = await repos.courses.updateMember(course!.id, 'student-1', {
      studentCode: 'SV002',
    });

    expect(result).toEqual({ ok: false, reason: 'CODE_TAKEN' });
  });

  it('reports a non-member rather than creating one', async () => {
    const [course] = await repos.courses.listAll();
    const result = await repos.courses.updateMember(course!.id, 'nobody', {
      studentCode: 'SV009',
    });
    expect(result).toEqual({ ok: false, reason: 'NOT_A_MEMBER' });
  });
});

describe('role invites', () => {
  const invite = { email: 'gv@uni.edu', role: 'INSTRUCTOR' as const, createdBy: 'admin-1', createdAt: 1 };

  it('grants the role on the first claim', async () => {
    await repos.roleInvites.put(invite);
    expect(await repos.roleInvites.claim('gv@uni.edu', 'uid-1')).toBe('INSTRUCTOR');
  });

  it('grants nothing on a second claim', async () => {
    // Otherwise an admin who later demotes this person would see them
    // re-promoted at their next sign-in, silently undoing the demotion.
    await repos.roleInvites.put(invite);
    await repos.roleInvites.claim('gv@uni.edu', 'uid-1');

    expect(await repos.roleInvites.claim('gv@uni.edu', 'uid-1')).toBeNull();
  });

  it('grants the invite to exactly one of two concurrent claims', async () => {
    await repos.roleInvites.put(invite);

    const claims = await Promise.all([
      repos.roleInvites.claim('gv@uni.edu', 'uid-1'),
      repos.roleInvites.claim('gv@uni.edu', 'uid-2'),
    ]);

    expect(claims.filter((r) => r !== null)).toHaveLength(1);
  });

  it('matches on the lowercased email, like every other email lookup', async () => {
    await repos.roleInvites.put({ ...invite, email: 'GV@Uni.Edu' });
    expect(await repos.roleInvites.claim('gv@uni.edu', 'uid-1')).toBe('INSTRUCTOR');
  });

  it('returns null when there is no invite', async () => {
    expect(await repos.roleInvites.claim('nobody@uni.edu', 'uid-1')).toBeNull();
  });
});
