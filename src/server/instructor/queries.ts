import 'server-only';
import {
  ARENA_SCENARIO_VERSION,
  ARENA_SEATS,
  computeGameFinalScores,
  getGameConfig,
  groupResultsByCompany,
  type CompanyKey,
} from '@/domain/simulation';
import { getRepositories } from '@/db/repositories/firestore';
import { assignmentMode, isRemoved } from '@/db/models';
import { createGroupService } from '@/server/group/service';
import type {
  AssignmentDoc,
  CourseDoc,
  CourseMemberDoc,
  FinalResultDoc,
  GroupDoc,
  GroupGameDoc,
  GroupMemberDoc,
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

// --- group competition (Part 2) ---------------------------------------------

/** One group, as the instructor's progress table shows it. */
export interface GroupProgress {
  group: GroupDoc;
  members: GroupMemberDoc[];
  /** null until the first quarter has been submitted for. */
  game: GroupGameDoc | null;
  quartersPlayed: number;
  /** Quarter everyone is deciding, or null once the match is finished. */
  currentQuarter: number | null;
  completed: boolean;
  /** Students whose decision the whole group is waiting on. The blockers. */
  waitingOn: { uid: string; displayName: string; seatKey: CompanyKey }[];
  submittedCount: number;
  /** Seats with no student, driven by the rule-based generator. */
  botSeatCount: number;
}

/**
 * Every group of an assignment, with who is holding it up.
 *
 * This is the screen that makes "wait for all six, instructor can force it"
 * workable: without a per-quarter deadline, an instructor needs to see at a
 * glance which groups are stuck and on whom.
 */
export async function listGroupProgress(assignmentId: string): Promise<GroupProgress[]> {
  const repos = getRepositories();
  const groups = await repos.groups.listByAssignment(assignmentId);
  if (groups.length === 0) return [];

  const config = getGameConfig(ARENA_SCENARIO_VERSION);

  return Promise.all(
    groups.map(async (group) => {
      const [members, game] = await Promise.all([
        repos.groups.listMembers(group.id),
        repos.groupGames.get(group.id),
      ]);

      const round = game?.currentRound ?? 0;
      const completed = game?.status === 'COMPLETED' || round >= config.quarters;
      const currentQuarter = completed ? null : round + 1;

      const occupied = ARENA_SEATS.filter((seat) => group.seats[seat] != null);
      const submissions =
        currentQuarter !== null && game
          ? await repos.groupGames.listSubmissions(group.id, currentQuarter)
          : [];
      const submitted = new Set(submissions.map((s) => s.seatKey));

      const byUid = new Map(members.map((m) => [m.uid, m]));
      const waitingOn = occupied
        .filter((seat) => !submitted.has(seat))
        .map((seatKey) => {
          const uid = group.seats[seatKey]!;
          return { uid, displayName: byUid.get(uid)?.displayName ?? uid, seatKey };
        });

      return {
        group,
        members,
        game,
        quartersPlayed: round,
        currentQuarter,
        completed,
        waitingOn: completed ? [] : waitingOn,
        submittedCount: occupied.length - waitingOn.length,
        botSeatCount: ARENA_SEATS.length - occupied.length,
      } satisfies GroupProgress;
    }),
  );
}

/**
 * Everything the instructor's group report needs.
 *
 * Unlike the student view, this DOES carry all six decisions: staff may see the
 * exact allocations (spec 7.3), and the whole point of the screen is to explain
 * why one company beat another.
 */
export async function getGroupDetail(groupId: string) {
  const repos = getRepositories();
  const group = await repos.groups.get(groupId);
  if (!group) return null;

  // The live half of this screen comes from the SAME call that feeds the
  // students' waiting room, rather than a second copy of "which quarter is this
  // and has it finished". Two copies would eventually disagree, and an
  // instructor and their class reading different answers off the same match is
  // the worst failure this page could have.
  const service = createGroupService(repos);
  const state = await service.getState(groupId);
  const quarters = await service.listQuarters(groupId);

  const config = getGameConfig(state.game?.scenarioVersion ?? ARENA_SCENARIO_VERSION);
  const scores =
    quarters.length > 0
      ? computeGameFinalScores(
          groupResultsByCompany(quarters.flatMap((q) => q.results)),
          config,
        )
      : [];

  // Which decisions were supplied by the system rather than by the student.
  const defaults = new Map<string, boolean>();
  for (const quarter of quarters) {
    const submissions = await repos.groupGames.listSubmissions(groupId, quarter.quarter);
    for (const submission of submissions) {
      defaults.set(`${quarter.quarter}_${submission.seatKey}`, submission.wasDefault);
    }
  }

  // Status of the quarter still being decided. Times only, never allocations —
  // see `GroupService.listSubmissionStatus`.
  const submissionStatus =
    state.currentQuarter !== null
      ? await service.listSubmissionStatus(groupId, state.currentQuarter)
      : [];
  const submittedAt = new Map(submissionStatus.map((s) => [s.seatKey, s.submittedAt]));

  const byUid = new Map(state.members.map((m) => [m.uid, m]));
  const waitingOn = state.waitingOnSeats.map((seatKey) => {
    const uid = group.seats[seatKey] ?? '';
    const member = byUid.get(uid);
    return {
      uid,
      seatKey,
      displayName: member?.displayName ?? uid,
      companyName: member?.companyName ?? '',
    };
  });

  return {
    group,
    members: state.members,
    game: state.game,
    quarters,
    scores,
    defaults,
    // -- live, for the quarter nobody has seen the results of yet --
    currentQuarter: state.currentQuarter,
    completed: state.completed,
    submittedSeats: state.submittedSeats,
    waitingOn,
    submittedAt,
    /** True once all six quarters are in, so "final" is not a lie. */
    isFinal: state.completed && quarters.length >= config.quarters,
  };
}

/** A group that has been waiting on the same people for too long. */
export interface StalledGroup {
  groupId: string;
  groupName: string;
  courseId: string;
  courseName: string;
  assignmentId: string;
  assignmentTitle: string;
  quarter: number;
  waitingOn: string[];
  /** Days since the match last advanced, or since it was created. */
  idleDays: number;
}

/** A match idle this long is stuck rather than merely slow. */
export const STALLED_AFTER_DAYS = 7;

/**
 * Every group across the whole system that appears to be stuck.
 *
 * There is no automatic per-quarter deadline, which is a deliberate choice —
 * see `GroupService` — and its one failure mode is a group waiting forever on
 * somebody who has stopped turning up. An instructor sees that on their own
 * assignment page; this is the system-wide view, so an administrator can notice
 * a class nobody is watching and go and prod the instructor.
 *
 * Reads the whole assignment set, so it is an admin screen rather than
 * something on a hot path.
 */
export async function listStalledGroups(
  now: number = Date.now(),
  thresholdDays: number = STALLED_AFTER_DAYS,
): Promise<StalledGroup[]> {
  const repos = getRepositories();
  const courses = await repos.courses.listAll();
  if (courses.length === 0) return [];

  const assignments = await repos.assignments.listByCourses(courses.map((c) => c.id));
  const groupAssignments = assignments.filter((a) => assignmentMode(a) === 'GROUP');
  if (groupAssignments.length === 0) return [];

  const courseById = new Map(courses.map((c) => [c.id, c]));
  const stalled: StalledGroup[] = [];

  for (const assignment of groupAssignments) {
    for (const row of await listGroupProgress(assignment.id)) {
      if (row.completed || row.waitingOn.length === 0) continue;

      // Idle since the last quarter actually landed. `GroupGameDoc` records no
      // "last advanced" time, so the quarters are read — but only for groups
      // that already look stuck, which keeps this off the common path.
      const quarters = row.quartersPlayed > 0
        ? await repos.groupGames.listQuarters(row.group.id)
        : [];
      const lastActivity =
        quarters[quarters.length - 1]?.simulatedAt ??
        row.game?.startedAt ??
        row.group.createdAt;

      const idleDays = Math.floor((now - lastActivity) / 86_400_000);
      if (idleDays < thresholdDays) continue;

      stalled.push({
        groupId: row.group.id,
        groupName: row.group.name,
        courseId: assignment.courseId,
        courseName: courseById.get(assignment.courseId)?.courseName ?? '',
        assignmentId: assignment.id,
        assignmentTitle: assignment.title,
        quarter: row.currentQuarter ?? row.quartersPlayed,
        waitingOn: row.waitingOn.map((student) => student.displayName),
        idleDays,
      });
    }
  }

  return stalled.sort((a, b) => b.idleDays - a.idleDays);
}
