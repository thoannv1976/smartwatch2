import 'server-only';
import { isArchived, isRemoved, type CourseDoc } from '@/db/models';
import type { Repositories } from '@/db/repositories/types';
import { GameError } from './errors';

/**
 * Students joining and leaving classes themselves.
 *
 * Kept out of GameService: none of this touches the simulation, and the class
 * roster has a very different failure model from a graded game — the worst
 * thing here is a wrong student code in a gradebook, not a wrong score.
 */

export interface JoinableCourse {
  course: CourseDoc;
  instructorName: string;
  alreadyMember: boolean;
}

export interface EnrolledCourse {
  course: CourseDoc;
  studentCode: string;
  joinedAt: number;
  archived: boolean;
  /** False once the student has started an official assignment for this course. */
  canLeave: boolean;
}

export class EnrollmentService {
  constructor(private readonly repos: Repositories) {}

  /** Courses the student may join, with the ones they are already in marked. */
  async listJoinable(uid: string): Promise<JoinableCourse[]> {
    const open = await this.repos.courses.listOpenForEnrollment();
    if (open.length === 0) return [];

    const instructorIds = [...new Set(open.map((c) => c.instructorId))];
    const instructors = await Promise.all(instructorIds.map((id) => this.repos.users.get(id)));
    const nameById = new Map(
      instructors.filter((u) => u !== null).map((u) => [u!.uid, u!.displayName]),
    );

    const memberships = await Promise.all(
      open.map((course) => this.repos.courses.getMember(course.id, uid)),
    );

    return open.map((course, index) => {
      const member = memberships[index] ?? null;
      return {
        course,
        instructorName: nameById.get(course.instructorId) ?? '',
        alreadyMember: member !== null && !isRemoved(member),
      };
    });
  }

  /**
   * Classes the student is currently in.
   *
   * Archived courses stay in the list, flagged, rather than disappearing: the
   * student keeps the link to a report and a leaderboard they already earned.
   */
  async listEnrolled(uid: string): Promise<EnrolledCourse[]> {
    const courses = await this.repos.courses.listCoursesForStudent(uid);
    if (courses.length === 0) return [];

    const rows = await Promise.all(
      courses.map(async (course) => {
        const member = await this.repos.courses.getMember(course.id, uid);
        if (!member || isRemoved(member)) return null;

        return {
          course,
          studentCode: member.studentCode,
          joinedAt: member.joinedAt,
          archived: isArchived(course),
          canLeave: !(await this.hasOfficialSession(uid, course.id)),
        } satisfies EnrolledCourse;
      }),
    );

    return rows.filter((row): row is EnrolledCourse => row !== null);
  }

  async join(input: {
    uid: string;
    displayName: string;
    email: string;
    courseId: string;
    studentCode: string;
  }): Promise<CourseDoc> {
    const course = await this.repos.courses.get(input.courseId);
    if (!course) throw new GameError('courseNotFound');

    // Checked here rather than trusted from the list the browser was shown: the
    // course may have closed, or been archived, since that page rendered.
    if (isArchived(course) || course.enrollmentOpen !== true) {
      throw new GameError('enrollmentClosed');
    }

    const studentCode = input.studentCode.trim();
    if (!studentCode) throw new GameError('invalidInput');

    const outcome = await this.repos.courses.selfEnroll({
      uid: input.uid,
      courseId: course.id,
      studentCode,
      displayName: input.displayName,
      email: input.email.toLowerCase(),
    });

    if (outcome.status === 'ALREADY_MEMBER') throw new GameError('alreadyEnrolled');
    if (outcome.status === 'CODE_TAKEN') throw new GameError('studentCodeTaken');
    return course;
  }

  /**
   * Leaves a class.
   *
   * Refused once an official session exists, because leaving would make the
   * student's own attempt look like it came from outside the class, and because
   * removing themselves is not a decision they should be able to take after a
   * grade is in play. The instructor can still remove them.
   */
  async leave(uid: string, courseId: string): Promise<void> {
    const member = await this.repos.courses.getMember(courseId, uid);
    if (!member || isRemoved(member)) throw new GameError('notEnrolled');

    if (await this.hasOfficialSession(uid, courseId)) {
      throw new GameError('cannotLeaveAfterStarting');
    }

    await this.repos.courses.setMemberRemoved(courseId, uid, Date.now());
  }

  private async hasOfficialSession(uid: string, courseId: string): Promise<boolean> {
    const assignments = await this.repos.assignments.listByCourse(courseId);
    if (assignments.length === 0) return false;

    const sessions = await this.repos.sessions.listByUser(uid, 200);
    const ids = new Set(assignments.map((a) => a.id));
    return sessions.some((s) => s.assignmentId !== null && ids.has(s.assignmentId));
  }
}

export function createEnrollmentService(repos: Repositories): EnrollmentService {
  return new EnrollmentService(repos);
}
