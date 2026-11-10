import { describe, expect, it } from 'vitest';
import {
  buildParticipation,
  countStarted,
  groupResultId,
  type GroupPlay,
} from '@/server/instructor/participation';
import type {
  CourseMemberDoc,
  FinalResultDoc,
  GameSessionDoc,
  GroupGameDoc,
} from '@/db/models';

const member = (uid: string, studentCode: string): CourseMemberDoc => ({
  uid,
  courseId: 'c1',
  studentCode,
  displayName: uid,
  email: `${uid}@x`,
  joinedAt: 1,
});

const game = (currentRound: number, status: 'IN_PROGRESS' | 'COMPLETED' = 'IN_PROGRESS') =>
  ({ id: 'g1', groupId: 'g1', currentRound, status, startedAt: 500 }) as unknown as GroupGameDoc;

const seat = (uid: string, seatKey: string, g: GroupGameDoc | null): [string, GroupPlay] => [
  uid,
  { groupId: 'g1', seatKey: seatKey as GroupPlay['seatKey'], displayName: uid, studentCode: null, game: g },
];

const result = (sessionId: string, userId: string, finalScore: number) =>
  ({ sessionId, userId, finalScore, studentCode: '', displayName: userId }) as unknown as FinalResultDoc;

describe('participation in a group (industry) match', () => {
  it('a seat in a group nobody has started is "not started"', () => {
    const rows = buildParticipation({
      courseId: 'c1',
      members: [member('a', 'S1')],
      sessions: [],
      results: [],
      groupPlay: new Map([seat('a', 'player', null)]),
    });
    expect(rows[0]).toMatchObject({ status: 'NOT_STARTED', quartersPlayed: 0, startedAt: null });
  });

  it('counts the quarters the shared match has played', () => {
    const rows = buildParticipation({
      courseId: 'c1',
      members: [member('a', 'S1')],
      sessions: [],
      results: [],
      groupPlay: new Map([seat('a', 'apple', game(4))]),
    });
    expect(rows[0]).toMatchObject({ status: 'IN_PROGRESS', quartersPlayed: 4, startedAt: 500 });
    expect(rows[0]!.groupPlay?.groupId).toBe('g1');
  });

  it('a finished match shows completed with the seat\'s graded score', () => {
    const rows = buildParticipation({
      courseId: 'c1',
      members: [member('a', 'S1'), member('b', 'S2')],
      sessions: [],
      results: [result(groupResultId('g1', 'player'), 'a', 72.47), result(groupResultId('g1', 'apple'), 'b', 73.38)],
      groupPlay: new Map([seat('a', 'player', game(6, 'COMPLETED')), seat('b', 'apple', game(6, 'COMPLETED'))]),
    });
    expect(rows.map((r) => [r.status, r.quartersPlayed, r.result?.finalScore])).toEqual([
      ['COMPLETED', 6, 72.47],
      ['COMPLETED', 6, 73.38],
    ]);
  });

  it('keeps a removed student who played in a group, like solo players', () => {
    const rows = buildParticipation({
      courseId: 'c1',
      members: [],
      sessions: [],
      results: [],
      groupPlay: new Map([seat('gone', 'pixel', game(2))]),
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ removed: true, status: 'IN_PROGRESS' });
  });
});

describe('participation when playing alone (unchanged)', () => {
  it('uses the completed session and its result', () => {
    const sessions = [
      { id: 's1', userId: 'a', status: 'IN_PROGRESS', startedAt: 10, currentRound: 2 },
      { id: 's2', userId: 'a', status: 'COMPLETED', startedAt: 5, currentRound: 6 },
    ] as unknown as GameSessionDoc[];
    const rows = buildParticipation({
      courseId: 'c1',
      members: [member('a', 'S1')],
      sessions,
      results: [result('s2', 'a', 66.55)],
      groupPlay: new Map(),
    });
    expect(rows[0]).toMatchObject({ status: 'COMPLETED', quartersPlayed: 6, startedAt: 5, groupPlay: null });
    expect(rows[0]!.result?.finalScore).toBe(66.55);
  });
});

describe('countStarted', () => {
  it('counts solo players and seats in a started match, not seats still waiting', () => {
    const sessions = [{ userId: 'solo' }] as unknown as GameSessionDoc[];
    const groupPlay = new Map([seat('a', 'player', game(1)), seat('b', 'apple', null)]);
    expect(countStarted(sessions, groupPlay)).toBe(2);
  });
});
