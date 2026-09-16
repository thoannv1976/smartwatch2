import { beforeEach, describe, expect, it } from 'vitest';
import {
  CHALLENGER_SCENARIO_VERSION,
  PLAYER_COMPANY_KEY,
  SCENARIO_VERSION,
  getGameConfig,
  type QuarterDecision,
} from '@/domain/simulation';
import { createMemoryRepositories } from '@/db/repositories/memory';
import type { Repositories } from '@/db/repositories/types';
import { GameService } from '@/server/game/service';
import { GameError } from '@/server/game/errors';

/**
 * Integration tests for the server-authoritative game flow (spec 13, 17).
 *
 * They run against the in-memory repositories, which implement the same
 * contract as the Firestore ones — including the transactional "create the
 * quarter document or return the stored one" behaviour that provides
 * idempotency. That makes the whole submit / score / leaderboard path testable
 * with no emulator, no credentials and no network.
 */

const STUDENT = { uid: 'student-1', email: 'student@example.edu', displayName: 'Nguyen Van A' };
const OTHER_STUDENT = { uid: 'student-2', email: 'other@example.edu', displayName: 'Tran Thi B' };
const INSTRUCTOR = { uid: 'instructor-1', email: 'teacher@example.edu', displayName: 'Le Giang Vien' };

const validDecision: QuarterDecision = {
  productPoints: 25,
  technologyPoints: 25,
  marketingPoints: 20,
  distributionPoints: 20,
  cxPoints: 10,
  priceIndex: 105,
};

let repos: Repositories;
let service: GameService;

async function seedUsers() {
  await repos.users.upsert({ ...STUDENT, role: 'STUDENT' });
  await repos.users.upsert({ ...OTHER_STUDENT, role: 'STUDENT' });
  await repos.users.upsert({ ...INSTRUCTOR, role: 'INSTRUCTOR' });
}

async function seedAssignment(overrides: Partial<{ maxAttempts: number; deadline: number; startAt: number; isOpen: boolean; scenarioVersion: string }> = {}) {
  const course = await repos.courses.create({
    courseName: 'Digital Business 2026',
    semester: '2026A',
    instructorId: INSTRUCTOR.uid,
  });
  await repos.courses.addMember({
    uid: STUDENT.uid,
    courseId: course.id,
    studentCode: 'SV001',
    displayName: STUDENT.displayName,
    email: STUDENT.email,
  });

  const assignment = await repos.assignments.create({
    courseId: course.id,
    title: 'Official run 1',
    startAt: overrides.startAt ?? Date.now() - 1000,
    deadline: overrides.deadline ?? Date.now() + 86_400_000,
    maxAttempts: overrides.maxAttempts ?? 1,
    scenarioVersion: overrides.scenarioVersion ?? SCENARIO_VERSION,
    engineVersion: getGameConfig().engineVersion,
    officialSeed: 'smartwatch-v1-2026',
    isOpen: overrides.isOpen ?? true,
    createdBy: INSTRUCTOR.uid,
  });

  return { course, assignment };
}

async function startPractice() {
  return service.createSession({
    userId: STUDENT.uid,
    displayName: STUDENT.displayName,
    email: STUDENT.email,
    mode: 'PRACTICE',
    assignmentId: null,
    companyName: 'NovaTime',
    productName: 'Nova Watch One',
    positioning: 'BALANCED',
  });
}

async function startOfficial(assignmentId: string) {
  return service.createSession({
    userId: STUDENT.uid,
    displayName: STUDENT.displayName,
    email: STUDENT.email,
    mode: 'OFFICIAL',
    assignmentId,
    companyName: 'NovaTime',
    productName: 'Nova Watch One',
    positioning: 'BALANCED',
  });
}

/** Plays every quarter of a session with one fixed decision. */
async function playAllQuarters(sessionId: string, decision = validDecision) {
  const config = getGameConfig();
  for (let quarter = 1; quarter <= config.quarters; quarter += 1) {
    await service.submitQuarter(sessionId, STUDENT.uid, quarter, decision);
  }
}

beforeEach(async () => {
  repos = createMemoryRepositories();
  service = new GameService(repos);
  await seedUsers();
});

describe('session creation', () => {
  it('creates six companies: one player and five AI competitors', async () => {
    const session = await startPractice();

    expect(session.companies).toHaveLength(6);
    expect(session.companies.filter((c) => c.controllerType === 'PLAYER')).toHaveLength(1);
    expect(session.companies.filter((c) => c.controllerType === 'AI')).toHaveLength(5);
    expect(session.currentRound).toBe(0);
    expect(session.status).toBe('IN_PROGRESS');
  });

  it('stores the scenario and engine version on every session (spec 13.3)', async () => {
    const session = await startPractice();
    expect(session.scenarioVersion).toBe(SCENARIO_VERSION);
    expect(session.engineVersion).toBe(getGameConfig().engineVersion);
  });

  it('rejects an empty or overlong company name', async () => {
    await expect(
      service.createSession({
        userId: STUDENT.uid,
        displayName: STUDENT.displayName,
        email: STUDENT.email,
        mode: 'PRACTICE',
        assignmentId: null,
        companyName: '   ',
        productName: 'Nova Watch One',
        positioning: 'BALANCED',
      }),
    ).rejects.toThrow(GameError);

    await expect(
      service.createSession({
        userId: STUDENT.uid,
        displayName: STUDENT.displayName,
        email: STUDENT.email,
        mode: 'PRACTICE',
        assignmentId: null,
        companyName: 'x'.repeat(61),
        productName: 'Nova Watch One',
        positioning: 'BALANCED',
      }),
    ).rejects.toThrow(GameError);
  });

  it('gives practice sessions their own seed and official sessions the assignment seed', async () => {
    const { assignment } = await seedAssignment();
    const practice = await startPractice();
    const official = await service.createSession({
      userId: STUDENT.uid,
      displayName: STUDENT.displayName,
      email: STUDENT.email,
      mode: 'OFFICIAL',
      assignmentId: assignment.id,
      companyName: 'NovaTime',
      productName: 'Nova Watch One',
      positioning: 'PREMIUM',
    });

    expect(official.randomSeed).toBe(assignment.officialSeed);
    expect(practice.randomSeed).not.toBe(assignment.officialSeed);
  });

  it('honours the assignment scenario version', async () => {
    const { assignment } = await seedAssignment({
      scenarioVersion: CHALLENGER_SCENARIO_VERSION,
    });
    const session = await service.createSession({
      userId: STUDENT.uid,
      displayName: STUDENT.displayName,
      email: STUDENT.email,
      mode: 'OFFICIAL',
      assignmentId: assignment.id,
      companyName: 'NovaTime',
      productName: 'Nova Watch One',
      positioning: 'PREMIUM',
    });

    expect(session.scenarioVersion).toBe(CHALLENGER_SCENARIO_VERSION);
    const player = session.companies.find((c) => c.companyKey === PLAYER_COMPANY_KEY)!;
    expect(player.productQuality).toBe(
      getGameConfig(CHALLENGER_SCENARIO_VERSION).playerStart.productQuality,
    );
  });
});

describe('official assignment rules (spec 9.2)', () => {
  it('refuses a student who is not enrolled in the course', async () => {
    const { assignment } = await seedAssignment();
    await expect(
      service.createSession({
        userId: OTHER_STUDENT.uid,
        displayName: OTHER_STUDENT.displayName,
        email: OTHER_STUDENT.email,
        mode: 'OFFICIAL',
        assignmentId: assignment.id,
        companyName: 'Rival',
        productName: 'Rival One',
        positioning: 'BALANCED',
      }),
    ).rejects.toMatchObject({ key: 'notEnrolled' });
  });

  it('refuses after the deadline and before the start', async () => {
    const past = await seedAssignment({ deadline: Date.now() - 1000 });
    await expect(
      service.createSession({
        userId: STUDENT.uid,
        displayName: STUDENT.displayName,
        email: STUDENT.email,
        mode: 'OFFICIAL',
        assignmentId: past.assignment.id,
        companyName: 'NovaTime',
        productName: 'Nova Watch One',
        positioning: 'BALANCED',
      }),
    ).rejects.toMatchObject({ key: 'deadlinePassed' });

    repos = createMemoryRepositories();
    service = new GameService(repos);
    await seedUsers();
    const future = await seedAssignment({ startAt: Date.now() + 86_400_000 });
    await expect(
      service.createSession({
        userId: STUDENT.uid,
        displayName: STUDENT.displayName,
        email: STUDENT.email,
        mode: 'OFFICIAL',
        assignmentId: future.assignment.id,
        companyName: 'NovaTime',
        productName: 'Nova Watch One',
        positioning: 'BALANCED',
      }),
    ).rejects.toMatchObject({ key: 'notOpenYet' });
  });

  it('enforces the maximum number of attempts', async () => {
    const { assignment } = await seedAssignment({ maxAttempts: 1 });
    const start = () =>
      service.createSession({
        userId: STUDENT.uid,
        displayName: STUDENT.displayName,
        email: STUDENT.email,
        mode: 'OFFICIAL',
        assignmentId: assignment.id,
        companyName: 'NovaTime',
        productName: 'Nova Watch One',
        positioning: 'BALANCED',
      });

    const first = await start();
    expect(first.attemptNo).toBe(1);
    await expect(start()).rejects.toMatchObject({ key: 'maxAttemptsReached' });
  });
});

describe('submitting a quarter is server-authoritative (spec 13.1)', () => {
  it('persists decisions and results for all six companies', async () => {
    const session = await startPractice();
    const { quarter } = await service.submitQuarter(session.id, STUDENT.uid, 1, validDecision);

    expect(Object.keys(quarter.decisions)).toHaveLength(6);
    expect(quarter.results).toHaveLength(6);
    expect(quarter.ranking).toHaveLength(6);
    expect(quarter.intel).toHaveLength(5);

    const player = quarter.results.find((r) => r.companyKey === PLAYER_COMPANY_KEY)!;
    expect(player.unitsSold).toBeGreaterThan(0);
    expect(player.revenue).toBeGreaterThan(0);
  });

  it('advances the session state between quarters', async () => {
    const session = await startPractice();
    await service.submitQuarter(session.id, STUDENT.uid, 1, validDecision);
    const afterQ1 = await repos.sessions.get(session.id);
    expect(afterQ1?.currentRound).toBe(1);

    const playerBefore = session.companies.find((c) => c.companyKey === PLAYER_COMPANY_KEY)!;
    const playerAfter = afterQ1!.companies.find((c) => c.companyKey === PLAYER_COMPANY_KEY)!;
    expect(playerAfter.productQuality).toBeGreaterThan(playerBefore.productQuality);
  });

  it('rejects a decision that does not total exactly 100 points', async () => {
    const session = await startPractice();
    await expect(
      service.submitQuarter(session.id, STUDENT.uid, 1, { ...validDecision, cxPoints: 11 }),
    ).rejects.toMatchObject({ key: 'pointsNotHundred' });
  });

  it('rejects a price index outside 80..120', async () => {
    const session = await startPractice();
    await expect(
      service.submitQuarter(session.id, STUDENT.uid, 1, { ...validDecision, priceIndex: 130 }),
    ).rejects.toMatchObject({ key: 'priceRange' });
  });

  it('rejects quarters submitted out of order', async () => {
    const session = await startPractice();
    await expect(
      service.submitQuarter(session.id, STUDENT.uid, 3, validDecision),
    ).rejects.toMatchObject({ key: 'quarterOutOfRange' });
  });

  it("refuses to touch another student's session", async () => {
    const session = await startPractice();
    await expect(
      service.submitQuarter(session.id, OTHER_STUDENT.uid, 1, validDecision),
    ).rejects.toMatchObject({ key: 'notYourSession' });
  });

  it('refuses an official submission after the deadline passes mid-game', async () => {
    const { assignment } = await seedAssignment();
    const session = await service.createSession({
      userId: STUDENT.uid,
      displayName: STUDENT.displayName,
      email: STUDENT.email,
      mode: 'OFFICIAL',
      assignmentId: assignment.id,
      companyName: 'NovaTime',
      productName: 'Nova Watch One',
      positioning: 'BALANCED',
    });
    await service.submitQuarter(session.id, STUDENT.uid, 1, validDecision);

    await repos.assignments.update(assignment.id, { deadline: Date.now() - 1 });
    await expect(
      service.submitQuarter(session.id, STUDENT.uid, 2, validDecision),
    ).rejects.toMatchObject({ key: 'deadlinePassed' });
  });
});

describe('official quarter idempotency (spec 13.2)', () => {
  it('returns the stored result instead of simulating again', async () => {
    const session = await startPractice();
    const first = await service.submitQuarter(session.id, STUDENT.uid, 1, validDecision);
    const second = await service.submitQuarter(session.id, STUDENT.uid, 1, validDecision);

    expect(first.replayed).toBe(false);
    expect(second.replayed).toBe(true);
    expect(second.quarter).toEqual(first.quarter);
    expect(await repos.sessions.listQuarters(session.id)).toHaveLength(1);
  });

  it('ignores a different decision sent for an already processed quarter', async () => {
    const session = await startPractice();
    const first = await service.submitQuarter(session.id, STUDENT.uid, 1, validDecision);

    const tampered: QuarterDecision = {
      productPoints: 100,
      technologyPoints: 0,
      marketingPoints: 0,
      distributionPoints: 0,
      cxPoints: 0,
      priceIndex: 80,
    };
    const second = await service.submitQuarter(session.id, STUDENT.uid, 1, tampered);

    expect(second.replayed).toBe(true);
    expect(second.quarter.decisions[PLAYER_COMPANY_KEY]).toEqual(validDecision);
  });

  it('survives concurrent submissions of the same quarter', async () => {
    const session = await startPractice();
    const results = await Promise.all([
      service.submitQuarter(session.id, STUDENT.uid, 1, validDecision),
      service.submitQuarter(session.id, STUDENT.uid, 1, validDecision),
      service.submitQuarter(session.id, STUDENT.uid, 1, validDecision),
    ]);

    expect(await repos.sessions.listQuarters(session.id)).toHaveLength(1);
    const stored = results[0]!.quarter;
    for (const result of results) {
      expect(result.quarter.results).toEqual(stored.results);
    }
  });
});

describe('reproducibility (spec 6.1, 13.3)', () => {
  it('produces identical results for two sessions with the same seed and decisions', async () => {
    const { assignment } = await seedAssignment({ maxAttempts: 2 });
    const makeSession = () =>
      service.createSession({
        userId: STUDENT.uid,
        displayName: STUDENT.displayName,
        email: STUDENT.email,
        mode: 'OFFICIAL',
        assignmentId: assignment.id,
        companyName: 'NovaTime',
        productName: 'Nova Watch One',
        positioning: 'BALANCED',
      });

    const a = await makeSession();
    const b = await makeSession();
    await playAllQuarters(a.id);
    await playAllQuarters(b.id);

    const quartersA = await repos.sessions.listQuarters(a.id);
    const quartersB = await repos.sessions.listQuarters(b.id);

    expect(quartersA).toHaveLength(6);
    for (let i = 0; i < quartersA.length; i += 1) {
      expect(quartersB[i]!.results).toEqual(quartersA[i]!.results);
      expect(quartersB[i]!.decisions).toEqual(quartersA[i]!.decisions);
    }
  });
});

describe('completion, scoring and the leaderboard row (spec 8)', () => {
  it('completes the session and writes a final result after the sixth quarter', async () => {
    const session = await startPractice();
    await playAllQuarters(session.id);

    const stored = await repos.sessions.get(session.id);
    expect(stored?.status).toBe('COMPLETED');
    expect(stored?.completedAt).toBeGreaterThan(0);

    const finalResult = await repos.finalResults.get(session.id);
    expect(finalResult).not.toBeNull();
    expect(finalResult!.finalScore).toBeGreaterThan(0);
    expect(finalResult!.gameRank).toBeGreaterThanOrEqual(1);
    expect(finalResult!.gameRank).toBeLessThanOrEqual(6);
    expect(finalResult!.scenarioVersion).toBe(SCENARIO_VERSION);
  });

  it('records the student code from the course roster on official results', async () => {
    const { assignment } = await seedAssignment();
    const session = await service.createSession({
      userId: STUDENT.uid,
      displayName: STUDENT.displayName,
      email: STUDENT.email,
      mode: 'OFFICIAL',
      assignmentId: assignment.id,
      companyName: 'NovaTime',
      productName: 'Nova Watch One',
      positioning: 'BALANCED',
    });
    await playAllQuarters(session.id);

    const finalResult = await repos.finalResults.get(session.id);
    expect(finalResult?.studentCode).toBe('SV001');
    expect(finalResult?.assignmentId).toBe(assignment.id);
  });

  it('is safe to finalize twice', async () => {
    const session = await startPractice();
    await playAllQuarters(session.id);

    const before = await repos.finalResults.get(session.id);
    await service.finalize(session.id, STUDENT.uid);
    const after = await repos.finalResults.get(session.id);

    expect(after).toEqual(before);
  });

  it('refuses to finalize a game that has not played six quarters', async () => {
    const session = await startPractice();
    await service.submitQuarter(session.id, STUDENT.uid, 1, validDecision);
    await expect(service.finalize(session.id, STUDENT.uid)).rejects.toMatchObject({
      key: 'quarterOutOfRange',
    });
  });

  it('refuses further submissions once the game is completed', async () => {
    const session = await startPractice();
    await playAllQuarters(session.id);
    const config = getGameConfig();
    await expect(
      service.submitQuarter(session.id, STUDENT.uid, config.quarters + 1, validDecision),
    ).rejects.toMatchObject({ key: 'quarterOutOfRange' });
  });

  it('scores all six companies and ranks them uniquely', async () => {
    const session = await startPractice();
    await playAllQuarters(session.id);

    const stored = (await repos.sessions.get(session.id))!;
    const quarters = await repos.sessions.listQuarters(session.id);
    const scores = service.scoreSession(stored, quarters);

    expect(scores).toHaveLength(6);
    expect(scores.map((s) => s.gameRank).sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('produces a three-lesson analysis from the real decisions', async () => {
    const session = await startPractice();
    await playAllQuarters(session.id);

    const stored = (await repos.sessions.get(session.id))!;
    const quarters = await repos.sessions.listQuarters(session.id);
    const analysis = service.analyse(stored, quarters);

    expect(analysis.lessons).toHaveLength(3);
    expect(analysis.labels.length).toBeGreaterThan(0);
    expect(analysis.averages.priceIndex).toBe(validDecision.priceIndex);
  });
});

describe('official attempts are claimed atomically (spec 9.2)', () => {
  /** Both requests start before either has written, as a double-click does. */
  function startOfficialTwiceConcurrently(assignmentId: string) {
    const start = () =>
      service.createSession({
        userId: STUDENT.uid,
        displayName: STUDENT.displayName,
        email: STUDENT.email,
        mode: 'OFFICIAL',
        assignmentId,
        companyName: 'NovaTime',
        productName: 'Nova Watch One',
        positioning: 'BALANCED',
      });
    return Promise.allSettled([start(), start()]);
  }

  it('creates one session when two starts race, even with attempts to spare', async () => {
    const { assignment } = await seedAssignment({ maxAttempts: 5 });

    const outcomes = await startOfficialTwiceConcurrently(assignment.id);

    expect(outcomes.filter((o) => o.status === 'fulfilled')).toHaveLength(1);
    expect(await repos.sessions.countAttempts(STUDENT.uid, assignment.id)).toBe(1);
  });

  it('tells the loser the attempt is already open, not that attempts ran out', async () => {
    const { assignment } = await seedAssignment({ maxAttempts: 5 });

    const outcomes = await startOfficialTwiceConcurrently(assignment.id);
    const rejected = outcomes.find((o) => o.status === 'rejected');

    expect(rejected).toBeDefined();
    expect((rejected as PromiseRejectedResult).reason).toBeInstanceOf(GameError);
    expect((rejected as PromiseRejectedResult).reason.key).toBe('attemptAlreadyStarted');
  });

  it('still lets the student use their remaining attempts one at a time', async () => {
    const { assignment } = await seedAssignment({ maxAttempts: 2 });

    const first = await startOfficial(assignment.id);
    await playAllQuarters(first.id);
    const second = await startOfficial(assignment.id);

    expect(second.id).not.toBe(first.id);
    expect(second.attemptNo).toBe(2);
    expect(await repos.sessions.countAttempts(STUDENT.uid, assignment.id)).toBe(2);
  });

  it('still refuses an attempt past the limit', async () => {
    const { assignment } = await seedAssignment({ maxAttempts: 1 });
    await startOfficial(assignment.id);

    await expect(startOfficial(assignment.id)).rejects.toMatchObject({
      key: 'maxAttemptsReached',
    });
  });
});

describe('recovering a session that played out but never finalized', () => {
  /**
   * Storing quarter six and finalizing are two operations. A failure between
   * them used to be permanent: re-submitting returned the stored quarter
   * without finalizing, and no other path called finalize, so the student kept
   * a played-out game with no score and never appeared on the leaderboard.
   *
   * Note the state this leaves behind: finalize marks the session COMPLETED
   * before it writes the result, so the session looks finished while no result
   * exists. That is why recovery keys on the missing result, not the status.
   */
  async function playSixWithFailingFinalize(sessionId: string) {
    const config = getGameConfig();
    for (let quarter = 1; quarter < config.quarters; quarter += 1) {
      await service.submitQuarter(sessionId, STUDENT.uid, quarter, validDecision);
    }

    const save = repos.finalResults.save.bind(repos.finalResults);
    repos.finalResults.save = () => Promise.reject(new Error('firestore unavailable'));
    await expect(
      service.submitQuarter(sessionId, STUDENT.uid, config.quarters, validDecision),
    ).rejects.toThrow('firestore unavailable');
    repos.finalResults.save = save;
  }

  it('leaves every quarter stored but no final result when finalize fails', async () => {
    const session = await startPractice();
    await playSixWithFailingFinalize(session.id);

    expect(await repos.sessions.listQuarters(session.id)).toHaveLength(getGameConfig().quarters);
    expect(await repos.finalResults.get(session.id)).toBeNull();
    // Marked complete before the write that failed — looks finished, is not.
    expect((await repos.sessions.get(session.id))?.status).toBe('COMPLETED');
  });

  it('finalizes when the student simply opens the session again', async () => {
    const session = await startPractice();
    await playSixWithFailingFinalize(session.id);

    const recovered = await service.getOwnedSession(session.id, STUDENT.uid);

    expect(recovered.status).toBe('COMPLETED');
    const result = await repos.finalResults.get(session.id);
    expect(result).not.toBeNull();
    expect(result!.finalScore).toBeGreaterThan(0);
  });

  it('finalizes when the student re-submits the last quarter', async () => {
    const session = await startPractice();
    await playSixWithFailingFinalize(session.id);

    const outcome = await service.submitQuarter(
      session.id,
      STUDENT.uid,
      getGameConfig().quarters,
      validDecision,
    );

    expect(outcome.replayed).toBe(true);
    expect(outcome.session.status).toBe('COMPLETED');
    expect(await repos.finalResults.get(session.id)).not.toBeNull();
  });

  it('does not re-score or re-date a session that finalized normally', async () => {
    const session = await startPractice();
    await playAllQuarters(session.id);

    const first = (await repos.finalResults.get(session.id))!;
    const completedAt = (await repos.sessions.get(session.id))!.completedAt;

    await service.getOwnedSession(session.id, STUDENT.uid);
    await service.getOwnedSession(session.id, STUDENT.uid);

    const after = (await repos.finalResults.get(session.id))!;
    expect(after.finalScore).toBe(first.finalScore);
    expect(after.completedAt).toBe(first.completedAt);
    expect((await repos.sessions.get(session.id))!.completedAt).toBe(completedAt);
  });

  it('leaves a game still in progress alone', async () => {
    const session = await startPractice();
    await service.submitQuarter(session.id, STUDENT.uid, 1, validDecision);

    const loaded = await service.getOwnedSession(session.id, STUDENT.uid);

    expect(loaded.status).toBe('IN_PROGRESS');
    expect(await repos.finalResults.get(session.id)).toBeNull();
  });
});

describe('class leaderboard (spec 8.3)', () => {
  it('lists only completed results of the same assignment, best first', async () => {
    const { course, assignment } = await seedAssignment({ maxAttempts: 5 });
    await repos.courses.addMember({
      uid: OTHER_STUDENT.uid,
      courseId: course.id,
      studentCode: 'SV002',
      displayName: OTHER_STUDENT.displayName,
      email: OTHER_STUDENT.email,
    });

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

    const strongSession = await service.createSession({
      userId: STUDENT.uid,
      displayName: STUDENT.displayName,
      email: STUDENT.email,
      mode: 'OFFICIAL',
      assignmentId: assignment.id,
      companyName: 'Strong',
      productName: 'S1',
      positioning: 'BALANCED',
    });
    const weakSession = await service.createSession({
      userId: OTHER_STUDENT.uid,
      displayName: OTHER_STUDENT.displayName,
      email: OTHER_STUDENT.email,
      mode: 'OFFICIAL',
      assignmentId: assignment.id,
      companyName: 'Weak',
      productName: 'W1',
      positioning: 'BALANCED',
    });

    const config = getGameConfig();
    for (let q = 1; q <= config.quarters; q += 1) {
      await service.submitQuarter(strongSession.id, STUDENT.uid, q, strong);
      await service.submitQuarter(weakSession.id, OTHER_STUDENT.uid, q, weak);
    }

    const board = await repos.finalResults.listByAssignment(assignment.id, 'finalScore');
    expect(board).toHaveLength(2);
    expect(board[0]!.companyName).toBe('Strong');
    expect(board[0]!.finalScore).toBeGreaterThan(board[1]!.finalScore);
    expect(board.every((r) => r.assignmentId === assignment.id)).toBe(true);
  });

  it('keeps practice results off the official leaderboard', async () => {
    const { assignment } = await seedAssignment();
    const practice = await startPractice();
    await playAllQuarters(practice.id);

    const board = await repos.finalResults.listByAssignment(assignment.id);
    expect(board).toHaveLength(0);

    const stored = await repos.finalResults.get(practice.id);
    expect(stored?.mode).toBe('PRACTICE');
    expect(stored?.assignmentId).toBeNull();
  });
});
