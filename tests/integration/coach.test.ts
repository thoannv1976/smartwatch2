import { beforeEach, describe, expect, it } from 'vitest';
import {
  GOLDEN_STRATEGY_MAX_QUARTERS,
  PLAYER_COMPANY_KEY,
  SCENARIO_VERSION,
  getGameConfig,
  type QuarterDecision,
} from '@/domain/simulation';
import { createMemoryRepositories } from '@/db/repositories/memory';
import { goldenUsedQuarters } from '@/db/models';
import type { Repositories } from '@/db/repositories/types';
import { GameService } from '@/server/game/service';
import { GameError } from '@/server/game/errors';

/**
 * The coach, end to end on the in-memory repositories.
 *
 * Two things here are grade-integrity boundaries rather than features, and are
 * tested as such: the Golden Strategy limit must be spent in the datastore, and
 * the post-game comparison must be unreachable while a game is in progress.
 */

const STUDENT = { uid: 'student-1', email: 'student@example.edu', displayName: 'Nguyen Van A' };
const OTHER = { uid: 'student-2', email: 'other@example.edu', displayName: 'Tran Thi B' };
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

async function startOfficial(overrides: { deadline?: number } = {}) {
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
    startAt: Date.now() - 1000,
    deadline: overrides.deadline ?? Date.now() + 86_400_000,
    maxAttempts: 1,
    scenarioVersion: SCENARIO_VERSION,
    engineVersion: getGameConfig().engineVersion,
    officialSeed: 'smartwatch-v1-2026',
    isOpen: true,
    createdBy: INSTRUCTOR.uid,
  });

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
  return { session, assignment };
}

async function playAllQuarters(sessionId: string, decision = validDecision) {
  const config = getGameConfig();
  for (let quarter = 1; quarter <= config.quarters; quarter += 1) {
    await service.submitQuarter(sessionId, STUDENT.uid, quarter, decision);
  }
}

beforeEach(async () => {
  repos = createMemoryRepositories();
  service = new GameService(repos);
  await repos.users.upsert({ ...STUDENT, role: 'STUDENT' });
  await repos.users.upsert({ ...OTHER, role: 'STUDENT' });
  await repos.users.upsert({ ...INSTRUCTOR, role: 'INSTRUCTOR' });
});

describe('Golden Strategy', () => {
  it('coaches the quarter the session is actually on', async () => {
    const session = await startPractice();
    await service.submitQuarter(session.id, STUDENT.uid, 1, validDecision);

    const { golden } = await service.goldenStrategy(session.id, STUDENT.uid);
    expect(golden.quarter).toBe(2);
  });

  it('spends nothing when the same quarter is asked for twice', async () => {
    const session = await startPractice();

    const first = await service.goldenStrategy(session.id, STUDENT.uid);
    const second = await service.goldenStrategy(session.id, STUDENT.uid);
    const third = await service.goldenStrategy(session.id, STUDENT.uid);

    // A double-click or a refresh must not burn one of two uses.
    expect(first.usedQuarters).toEqual([1]);
    expect(second.usedQuarters).toEqual([1]);
    expect(third.usedQuarters).toEqual([1]);
    // And the answer is identical, because the search is deterministic.
    expect(second.golden).toEqual(first.golden);
  });

  it('stops after the configured number of distinct quarters', async () => {
    const session = await startPractice();

    for (let quarter = 1; quarter <= GOLDEN_STRATEGY_MAX_QUARTERS; quarter += 1) {
      await service.goldenStrategy(session.id, STUDENT.uid);
      await service.submitQuarter(session.id, STUDENT.uid, quarter, validDecision);
    }

    await expect(service.goldenStrategy(session.id, STUDENT.uid)).rejects.toThrow(GameError);
    await expect(service.goldenStrategy(session.id, STUDENT.uid)).rejects.toMatchObject({
      key: 'goldenLimitReached',
    });
  });

  it('records the coached quarters on the session for the instructor to see', async () => {
    const session = await startPractice();
    await service.goldenStrategy(session.id, STUDENT.uid);
    await service.submitQuarter(session.id, STUDENT.uid, 1, validDecision);
    await service.goldenStrategy(session.id, STUDENT.uid);

    const stored = await repos.sessions.get(session.id);
    expect(stored).not.toBeNull();
    expect(goldenUsedQuarters(stored!)).toEqual([1, 2]);
  });

  it('enforces the limit in the datastore, not in the service', async () => {
    // Two requests for two DIFFERENT quarters arriving together must not both
    // be granted beyond the cap. The claim is the only thing standing between a
    // graded attempt and unlimited coaching.
    const session = await startPractice();
    const outcomes = await Promise.all([
      repos.sessions.claimGoldenUse(session.id, 1, GOLDEN_STRATEGY_MAX_QUARTERS),
      repos.sessions.claimGoldenUse(session.id, 2, GOLDEN_STRATEGY_MAX_QUARTERS),
      repos.sessions.claimGoldenUse(session.id, 3, GOLDEN_STRATEGY_MAX_QUARTERS),
      repos.sessions.claimGoldenUse(session.id, 4, GOLDEN_STRATEGY_MAX_QUARTERS),
    ]);

    const claimed = outcomes.filter((o) => o.status === 'CLAIMED');
    expect(claimed).toHaveLength(GOLDEN_STRATEGY_MAX_QUARTERS);

    const stored = await repos.sessions.get(session.id);
    expect(goldenUsedQuarters(stored!)).toHaveLength(GOLDEN_STRATEGY_MAX_QUARTERS);
  });

  it('refuses after the assignment deadline has passed', async () => {
    const { session } = await startOfficial();
    // Move the deadline into the past after the session started.
    const stored = await repos.sessions.get(session.id);
    await repos.assignments.update(stored!.assignmentId!, { deadline: Date.now() - 1000 });

    await expect(service.goldenStrategy(session.id, STUDENT.uid)).rejects.toMatchObject({
      key: 'deadlinePassed',
    });
  });

  it('refuses once the game is over', async () => {
    const session = await startPractice();
    await playAllQuarters(session.id);

    await expect(service.goldenStrategy(session.id, STUDENT.uid)).rejects.toMatchObject({
      key: 'gameAlreadyCompleted',
    });
  });

  it('belongs to its owner', async () => {
    const session = await startPractice();
    await expect(service.goldenStrategy(session.id, OTHER.uid)).rejects.toMatchObject({
      key: 'notYourSession',
    });
  });
});

describe('hindsight', () => {
  it('is refused while the game is still being played', async () => {
    // Otherwise this is a way to read the answer to the quarter you are about
    // to submit, with no limit at all.
    const session = await startPractice();
    await service.submitQuarter(session.id, STUDENT.uid, 1, validDecision);

    await expect(service.hindsight(session.id, STUDENT.uid)).rejects.toMatchObject({
      key: 'gameNotCompleted',
    });
  });

  it('returns one row per quarter once the game is finished', async () => {
    const session = await startPractice();
    await playAllQuarters(session.id);

    const rows = await service.hindsight(session.id, STUDENT.uid);
    expect(rows.map((r) => r.quarter)).toEqual([1, 2, 3, 4, 5, 6]);
    for (const row of rows) {
      expect(row.played.decision).toEqual(validDecision);
      expect(row.profitGap).toBeGreaterThanOrEqual(0);
    }
  });

  it('scores each played quarter exactly as the graded game scored it', async () => {
    const session = await startPractice();
    await playAllQuarters(session.id);

    const rows = await service.hindsight(session.id, STUDENT.uid);
    const quarters = await service.listQuarters(session.id);

    quarters.forEach((quarter, index) => {
      const graded = quarter.results.find((r) => r.companyKey === PLAYER_COMPANY_KEY);
      expect(graded).toBeDefined();
      expect(rows[index]?.played.netProfit).toBe(graded!.netProfit);
      expect(rows[index]?.played.marketShare).toBe(graded!.marketShare);
    });
  });

  it('belongs to its owner', async () => {
    const session = await startPractice();
    await playAllQuarters(session.id);
    await expect(service.hindsight(session.id, OTHER.uid)).rejects.toMatchObject({
      key: 'notYourSession',
    });
  });
});

describe('suggestions and tenure review', () => {
  it('suggests three submittable decisions for the coming quarter', async () => {
    const session = await startPractice();
    const suggestions = service.suggestionsFor(session, []);

    expect(suggestions).toHaveLength(3);
    for (const suggestion of suggestions) {
      const total =
        suggestion.decision.productPoints +
        suggestion.decision.technologyPoints +
        suggestion.decision.marketingPoints +
        suggestion.decision.distributionPoints +
        suggestion.decision.cxPoints;
      expect(total).toBe(getGameConfig().strategyPoints);
    }
  });

  it('suggests nothing once every quarter has been played', async () => {
    const session = await startPractice();
    await playAllQuarters(session.id);

    const finished = await service.getOwnedSession(session.id, STUDENT.uid);
    const quarters = await service.listQuarters(session.id);
    expect(service.suggestionsFor(finished, quarters)).toEqual([]);
  });

  it('reviews all six quarters against the weights those quarters really used', async () => {
    const session = await startPractice();
    await playAllQuarters(session.id);

    const finished = await service.getOwnedSession(session.id, STUDENT.uid);
    const quarters = await service.listQuarters(session.id);
    const review = service.tenure(finished, quarters, 62);

    expect(review.verdict).toBe('solidTenure');
    expect(review.quarterNotes).toHaveLength(6);
    // The same decision every quarter is by definition steady.
    expect(review.consistency).toBe('STEADY');
  });
});
