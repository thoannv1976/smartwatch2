import { ARENA_SCENARIO_VERSION, getGameConfig, type CompanyKey } from '@/domain/simulation';
import {
  isRemoved,
  type CourseMemberDoc,
  type FinalResultDoc,
  type GameSessionDoc,
  type GroupGameDoc,
} from '@/db/models';

/**
 * Who played what, for the instructor's participation table and stat tiles.
 *
 * Pure on purpose: the queries read the datastore, these functions decide what
 * the rows say, and the tests check the decisions without a datastore.
 *
 * A student plays either alone (a `GameSessionDoc`) or in a group match (a seat
 * in a group whose shared game is a `GroupGameDoc`). Both kinds end in the same
 * graded `FinalResultDoc`, so the leaderboard never needed to know which; this
 * table does, because "started" and "quarters played" live in different places.
 */

/** A student's seat in a group match. */
export interface GroupPlay {
  groupId: string;
  seatKey: CompanyKey;
  /** Shown when the student has no session of their own. */
  displayName: string;
  studentCode: string | null;
  /** null until someone in the group has submitted quarter 1. */
  game: GroupGameDoc | null;
}

export interface StudentParticipation {
  member: CourseMemberDoc;
  /** True when the student is no longer on the roster but did play. */
  removed: boolean;
  session: GameSessionDoc | null;
  /** Set when the student plays in a group match instead of alone. */
  groupPlay: GroupPlay | null;
  result: FinalResultDoc | null;
  status: 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETED';
  quartersPlayed: number;
  startedAt: number | null;
}

/** Id of the graded result a group match writes for one seat. */
export function groupResultId(groupId: string, seatKey: CompanyKey): string {
  return `${groupId}__${seatKey}`;
}

/** Quarters in a full group match. */
const QUARTERS = getGameConfig(ARENA_SCENARIO_VERSION).quarters;

function groupGameFinished(game: GroupGameDoc): boolean {
  return game.status === 'COMPLETED' || game.currentRound >= QUARTERS;
}

/** Students who have begun playing, alone or in a started group match. */
export function countStarted(
  sessions: GameSessionDoc[],
  groupPlay: Map<string, GroupPlay>,
): number {
  const started = new Set(sessions.map((s) => s.userId));
  for (const [uid, play] of groupPlay) {
    if (play.game) started.add(uid);
  }
  return started.size;
}

/**
 * One row per student: the roster UNION everyone who actually played.
 *
 * Driving it from the roster alone would drop a student who completed the
 * assignment and was then removed from the course — while their row is still
 * on the leaderboard, which reads graded results and never consults a roster.
 * Two screens for the same instructor would then disagree, and the person who
 * silently vanished is one who already has a grade. Anyone who played is listed
 * whatever their enrolment says; `removed` tells the UI to mark them.
 */
export function buildParticipation(input: {
  courseId: string;
  members: CourseMemberDoc[];
  sessions: GameSessionDoc[];
  results: FinalResultDoc[];
  groupPlay: Map<string, GroupPlay>;
}): StudentParticipation[] {
  const { courseId, members, sessions, results, groupPlay } = input;

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
  const resultsById = new Map(results.map((r) => [r.sessionId, r]));

  const byUid = new Map<string, CourseMemberDoc>(members.map((m) => [m.uid, m]));

  for (const session of sessions) {
    if (byUid.has(session.userId)) continue;
    const result = resultsById.get(session.id) ?? null;
    // A stand-in row for someone who played without ever being on the roster.
    byUid.set(session.userId, {
      uid: session.userId,
      courseId,
      studentCode: result?.studentCode ?? '',
      displayName: result?.displayName ?? '',
      email: '',
      joinedAt: session.startedAt,
      removedAt: session.startedAt,
    });
  }
  for (const [uid, play] of groupPlay) {
    if (byUid.has(uid) || !play.game) continue;
    byUid.set(uid, {
      uid,
      courseId,
      studentCode: play.studentCode ?? '',
      displayName: play.displayName,
      email: '',
      joinedAt: play.game.startedAt,
      removedAt: play.game.startedAt,
    });
  }

  return [...byUid.values()]
    .sort((a, b) => a.studentCode.localeCompare(b.studentCode))
    .map((member): StudentParticipation => {
      const session = sessionsByUser.get(member.uid) ?? null;
      const removed = isRemoved(member);

      if (session) {
        return {
          member,
          removed,
          session,
          groupPlay: null,
          result: resultsById.get(session.id) ?? null,
          status: session.status === 'COMPLETED' ? 'COMPLETED' : 'IN_PROGRESS',
          quartersPlayed: session.currentRound ?? 0,
          startedAt: session.startedAt,
        };
      }

      const play = groupPlay.get(member.uid) ?? null;
      const game = play?.game ?? null;
      return {
        member,
        removed,
        session: null,
        groupPlay: play,
        result: play ? (resultsById.get(groupResultId(play.groupId, play.seatKey)) ?? null) : null,
        status: !game ? 'NOT_STARTED' : groupGameFinished(game) ? 'COMPLETED' : 'IN_PROGRESS',
        quartersPlayed: game ? Math.min(game.currentRound, QUARTERS) : 0,
        startedAt: game?.startedAt ?? null,
      };
    });
}
