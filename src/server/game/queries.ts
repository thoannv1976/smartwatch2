import 'server-only';
import { getRepositories } from '@/db/repositories/firestore';
import { isArchived } from '@/db/models';
import type { AssignmentDoc, CourseDoc, FinalResultDoc, GameSessionDoc } from '@/db/models';

/**
 * Read-side helpers for the student screens.
 *
 * Kept separate from the write service so a page can load what it needs without
 * pulling in the simulation path.
 */

export interface AvailableAssignment {
  assignment: AssignmentDoc;
  course: CourseDoc;
  attemptsUsed: number;
  /** An unfinished session for this assignment, if the student has one. */
  inProgressSession: GameSessionDoc | null;
  completedResult: FinalResultDoc | null;
  /** Why the student cannot start, or null when they can. */
  blockedReason: 'notOpenYet' | 'deadlinePassed' | 'maxAttemptsReached' | 'archived' | null;
}

/** Every assignment the student can see, with their own status for each. */
export async function listAssignmentsForStudent(userId: string): Promise<AvailableAssignment[]> {
  const repos = getRepositories();

  const courses = await repos.courses.listCoursesForStudent(userId);
  if (courses.length === 0) return [];

  const assignments = await repos.assignments.listByCourses(courses.map((c) => c.id));
  if (assignments.length === 0) return [];

  const coursesById = new Map(courses.map((c) => [c.id, c]));
  const sessions = await repos.sessions.listByUser(userId, 200);
  const results = await repos.finalResults.listByUser(userId);

  const now = Date.now();

  return assignments
    .map((assignment): AvailableAssignment | null => {
      const course = coursesById.get(assignment.courseId);
      if (!course) return null;

      const mine = sessions.filter((s) => s.assignmentId === assignment.id);

      // An archived course or assignment disappears — UNLESS this student has
      // something invested in it. Someone who already played keeps the row,
      // because it carries the only links they have to their own report and to
      // a leaderboard they earned a place on. They simply cannot start again.
      const hidden = isArchived(course) || isArchived(assignment);
      if (hidden && mine.length === 0) return null;
      const inProgressSession = mine.find((s) => s.status === 'IN_PROGRESS') ?? null;
      const completedSession = mine.find((s) => s.status === 'COMPLETED') ?? null;
      const completedResult = completedSession
        ? (results.find((r) => r.sessionId === completedSession.id) ?? null)
        : null;

      let blockedReason: AvailableAssignment['blockedReason'] = null;
      if (hidden) blockedReason = 'archived';
      else if (!assignment.isOpen || now < assignment.startAt) blockedReason = 'notOpenYet';
      else if (now > assignment.deadline) blockedReason = 'deadlinePassed';
      else if (!inProgressSession && mine.length >= assignment.maxAttempts) {
        blockedReason = 'maxAttemptsReached';
      }

      return {
        assignment,
        course,
        attemptsUsed: mine.length,
        inProgressSession,
        completedResult,
        blockedReason,
      };
    })
    .filter((entry): entry is AvailableAssignment => entry !== null);
}

export interface SessionSummary {
  session: GameSessionDoc;
  finalResult: FinalResultDoc | null;
}

export async function listSessionsForStudent(userId: string): Promise<SessionSummary[]> {
  const repos = getRepositories();
  const [sessions, results] = await Promise.all([
    repos.sessions.listByUser(userId, 50),
    repos.finalResults.listByUser(userId),
  ]);
  const resultsBySession = new Map(results.map((r) => [r.sessionId, r]));

  return sessions.map((session) => ({
    session,
    finalResult: resultsBySession.get(session.id) ?? null,
  }));
}

/**
 * A student's rank within the official leaderboard of their assignment.
 * Returns null for practice games, which never appear on a leaderboard.
 */
export async function getClassRank(
  result: FinalResultDoc,
): Promise<{ rank: number; total: number } | null> {
  if (!result.assignmentId) return null;
  const board = await getRepositories().finalResults.listByAssignment(
    result.assignmentId,
    'finalScore',
  );
  const index = board.findIndex((r) => r.sessionId === result.sessionId);
  if (index < 0) return null;
  return { rank: index + 1, total: board.length };
}
