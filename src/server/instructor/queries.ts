import 'server-only';
import { getRepositories } from '@/db/repositories/firestore';
import { isRemoved } from '@/db/models';
import type {
  AssignmentDoc,
  CourseDoc,
  CourseMemberDoc,
  FinalResultDoc,
  GameSessionDoc,
  LeaderboardSort,
} from '@/db/models';

/**
 * Instructor analytics (spec 9.4).
 *
 * Answers not only "who won?" but "why did this student win or lose?", which is
 * what the stored per-quarter decisions and results are for (spec 13.4).
 */

export interface AssignmentAnalytics {
  assignment: AssignmentDoc;
  course: CourseDoc | null;
  enrolled: number;
  started: number;
  completed: number;
  averageScore: number | null;
  highestScore: number | null;
  lowestScore: number | null;
  averageCumulativeProfit: number | null;
  averageFinalMarketShare: number | null;
}

export interface StudentParticipation {
  member: CourseMemberDoc;
  /** True when the student is no longer on the roster but did play. */
  removed: boolean;
  session: GameSessionDoc | null;
  result: FinalResultDoc | null;
  status: 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETED';
  quartersPlayed: number;
}

/** Courses an instructor may inspect. Admins see every course. */
export async function listCoursesForStaff(
  uid: string,
  role: 'INSTRUCTOR' | 'ADMIN',
): Promise<CourseDoc[]> {
  const repos = getRepositories();
  return role === 'ADMIN' ? repos.courses.listAll() : repos.courses.listByInstructor(uid);
}

export async function getAssignmentAnalytics(
  assignmentId: string,
): Promise<AssignmentAnalytics | null> {
  const repos = getRepositories();
  const assignment = await repos.assignments.get(assignmentId);
  if (!assignment) return null;

  const [course, members, sessions, results] = await Promise.all([
    repos.courses.get(assignment.courseId),
    repos.courses.listMembers(assignment.courseId),
    repos.sessions.listByAssignment(assignmentId),
    repos.finalResults.listByAssignment(assignmentId, 'finalScore'),
  ]);

  const startedStudents = new Set(sessions.map((s) => s.userId));
  // Currently enrolled, not "ever enrolled". A student who played and was then
  // removed still counts in `completed`, so `completed` can legitimately exceed
  // `enrolled` — the labels in the UI say which is which.
  const activeMembers = members.filter((m) => !isRemoved(m));
  const scores = results.map((r) => r.finalScore);
  const mean = (values: number[]) =>
    values.length === 0 ? null : values.reduce((a, b) => a + b, 0) / values.length;

  return {
    assignment,
    course,
    enrolled: activeMembers.length,
    started: startedStudents.size,
    completed: results.length,
    averageScore: mean(scores),
    highestScore: scores.length ? Math.max(...scores) : null,
    lowestScore: scores.length ? Math.min(...scores) : null,
    averageCumulativeProfit: mean(results.map((r) => r.cumulativeProfit)),
    averageFinalMarketShare: mean(results.map((r) => r.finalMarketShare)),
  };
}

/** Per-student participation, including students who never started. */
export async function listParticipation(
  assignmentId: string,
): Promise<StudentParticipation[]> {
  const repos = getRepositories();
  const assignment = await repos.assignments.get(assignmentId);
  if (!assignment) return [];

  const [members, sessions, results] = await Promise.all([
    repos.courses.listMembers(assignment.courseId),
    repos.sessions.listByAssignment(assignmentId),
    repos.finalResults.listByAssignment(assignmentId, 'finalScore'),
  ]);

  const sessionsByUser = new Map<string, GameSessionDoc>();
  for (const session of sessions) {
    const existing = sessionsByUser.get(session.userId);
    // Prefer the completed attempt, then the most recent one.
    if (
      !existing ||
      (session.status === 'COMPLETED' && existing.status !== 'COMPLETED') ||
      (session.status === existing.status && session.startedAt > existing.startedAt)
    ) {
      sessionsByUser.set(session.userId, session);
    }
  }
  const resultsBySession = new Map(results.map((r) => [r.sessionId, r]));

  // The row set is the roster UNION everyone who actually played.
  //
  // Driving it from the roster alone would drop a student who completed the
  // assignment and was then removed from the course — while their row is still
  // on the leaderboard, which reads graded results and never consults a roster.
  // Two screens for the same instructor would then disagree, and the person who
  // silently vanished is one who already has a grade. Anyone with a session is
  // listed whatever their enrolment says; `removed` tells the UI to mark them.
  const byUid = new Map<string, CourseMemberDoc>(members.map((m) => [m.uid, m]));

  for (const session of sessions) {
    if (byUid.has(session.userId)) continue;
    const result = resultsBySession.get(session.id) ?? null;
    // A stand-in row for someone who played without ever being on the roster.
    byUid.set(session.userId, {
      uid: session.userId,
      courseId: assignment.courseId,
      studentCode: result?.studentCode ?? '',
      displayName: result?.displayName ?? '',
      email: '',
      joinedAt: session.startedAt,
      removedAt: session.startedAt,
    });
  }

  return [...byUid.values()]
    .sort((a, b) => a.studentCode.localeCompare(b.studentCode))
    .map((member) => {
      const session = sessionsByUser.get(member.uid) ?? null;
      const result = session ? (resultsBySession.get(session.id) ?? null) : null;
      return {
        member,
        session,
        result,
        removed: isRemoved(member),
        status: !session
          ? 'NOT_STARTED'
          : session.status === 'COMPLETED'
            ? 'COMPLETED'
            : 'IN_PROGRESS',
        quartersPlayed: session?.currentRound ?? 0,
      };
    });
}

export async function listLeaderboard(
  assignmentId: string,
  sort: LeaderboardSort = 'finalScore',
): Promise<FinalResultDoc[]> {
  return getRepositories().finalResults.listByAssignment(assignmentId, sort);
}

/** Everything needed for the student-detail screen: six quarters of decisions and results. */
export async function getStudentDetail(sessionId: string) {
  const repos = getRepositories();
  const session = await repos.sessions.get(sessionId);
  if (!session) return null;

  const [quarters, result, user] = await Promise.all([
    repos.sessions.listQuarters(sessionId),
    repos.finalResults.get(sessionId),
    repos.users.get(session.userId),
  ]);

  return { session, quarters, result, user };
}
