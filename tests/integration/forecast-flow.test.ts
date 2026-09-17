import { beforeEach, describe, expect, it } from 'vitest';
import {
  ARENA_SCENARIO_VERSION,
  getGameConfig,
  playQuarter,
  type QuarterDecision,
  type QuarterForecast,
} from '@/domain/simulation';
import { createMemoryRepositories } from '@/db/repositories/memory';
import { quarterForecast } from '@/db/models';
import type { AssignmentDoc, GroupDoc } from '@/db/models';
import type { Repositories } from '@/db/repositories/types';
import { GameService } from '@/server/game/service';
import { GroupService } from '@/server/group/service';
import { getGroupReportView, getQuarterView } from '@/server/group/queries';
import { quartersToCsv } from '@/server/instructor/csv';

/**
 * The prediction, from the browser to storage to the screens that read it back.
 *
 * Two properties carry the whole feature:
 *
 *  1. a prediction is stored ON THE SAME REQUEST that runs the market, so there
 *     is no moment at which one could be written with the answer in hand;
 *  2. in a group match a student's prediction — and the sentence of reasoning
 *     beside it — never reaches the other five, who are being marked against
 *     them.
 *
 * Both are asserted here, and both were checked against deliberately broken
 * code before being trusted.
 */

const STUDENT = { uid: 'student-1', email: 'student@example.edu', displayName: 'Nguyen Van A' };
const INSTRUCTOR = { uid: 'teacher-1', email: 'teacher@example.edu', displayName: 'Le Giang Vien' };

const decision: QuarterDecision = {
  productPoints: 25,
  technologyPoints: 25,
  marketingPoints: 20,
  distributionPoints: 20,
  cxPoints: 10,
  priceIndex: 105,
};

let repos: Repositories;
let service: GameService;

beforeEach(async () => {
  repos = createMemoryRepositories();
  service = new GameService(repos);
  await repos.users.upsert({ ...STUDENT, role: 'STUDENT' });
  await repos.users.upsert({ ...INSTRUCTOR, role: 'INSTRUCTOR' });
});

async function soloSession() {
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

describe('solo: the prediction rides with the decision', () => {
  it('stores it on the quarter it was made for', async () => {
    const session = await soloSession();
    const forecast: QuarterForecast = {
      predictedRank: 4,
      predictedShare: 0.14,
      note: 'Dồn phân phối vì quý trước mất hàng.',
    };

    await service.submitQuarter(session.id, STUDENT.uid, 1, decision, forecast);

    const stored = await repos.sessions.getQuarter(session.id, 1);
    expect(quarterForecast(stored!)).toEqual(forecast);
  });

  it('is absent, not zero, when the student sent none', async () => {
    // Every quarter played before this feature existed is in exactly this
    // state, and must read as "no prediction" rather than a wrong one.
    const session = await soloSession();
    await service.submitQuarter(session.id, STUDENT.uid, 1, decision);

    expect(quarterForecast((await repos.sessions.getQuarter(session.id, 1))!)).toBeNull();
  });

  it('CANNOT CHANGE A SINGLE NUMBER IN THE RESULT', async () => {
    // Checked against the PURE ENGINE rather than against a second session:
    // two practice sessions get different random seeds, so comparing them would
    // have compared two different markets and proved nothing.
    //
    // Here the same decision is replayed through `playQuarter` with the
    // session's own seed and starting companies, and no forecast anywhere in
    // sight. If the stored quarter is byte-identical to that, the prediction
    // provably never reached the simulation.
    const session = await soloSession();
    const startingCompanies = session.companies;

    await service.submitQuarter(session.id, STUDENT.uid, 1, decision, {
      predictedRank: 1,
      predictedShare: 0.9,
      note: 'I will win',
    });

    const stored = await repos.sessions.getQuarter(session.id, 1);
    const replayed = playQuarter(
      1,
      startingCompanies,
      decision,
      [],
      session.randomSeed,
      getGameConfig(session.scenarioVersion),
      null,
    );

    expect(JSON.stringify(stored!.results)).toBe(JSON.stringify(replayed.simulation.companyResults));
    expect(stored!.ranking).toEqual(replayed.simulation.ranking);
    expect(stored!.weights).toEqual(replayed.simulation.weights);
    expect(stored!.eventKey).toBe(replayed.simulation.eventKey);
  });

  it('drops a malformed prediction rather than losing the student their quarter', async () => {
    // The decision is the thing being graded. A prediction that fails
    // validation must never be able to reject the submission around it.
    const session = await soloSession();
    const result = await service.submitQuarter(session.id, STUDENT.uid, 1, decision, {
      predictedRank: 99,
    });

    expect(result.replayed).toBe(false);
    expect(quarterForecast((await repos.sessions.getQuarter(session.id, 1))!)).toBeNull();
  });
});

describe('the instructor export', () => {
  it('carries the prediction, and neutralises a reason that would execute', async () => {
    // The one free-text column a student controls. A spreadsheet treats a
    // leading `=` as a formula, so an unescaped export turns the gradebook into
    // an execution surface.
    const session = await soloSession();
    await service.submitQuarter(session.id, STUDENT.uid, 1, decision, {
      predictedRank: 3,
      note: '=HYPERLINK("http://evil.example","Grades")',
    });

    const quarters = await repos.sessions.listQuarters(session.id);
    const csv = quartersToCsv([
      {
        studentCode: 'SV001',
        displayName: STUDENT.displayName,
        companyName: 'NovaTime',
        quarters,
      },
    ]);

    const header = csv.trim().split('\r\n')[0]!.split(',');
    expect(header).toContain('predicted_rank');
    expect(header).toContain('student_reason');

    // Prefixed with an apostrophe, so the cell is text and not a call.
    expect(csv).toContain("'=HYPERLINK");
    expect(csv).not.toContain(',=HYPERLINK');
  });
});

// --- group mode -------------------------------------------------------------

const arena = getGameConfig(ARENA_SCENARIO_VERSION);

let groupService: GroupService;
let assignment: AssignmentDoc;
let group: GroupDoc;

function students(count = 6) {
  return Array.from({ length: count }, (_, i) => ({
    uid: `g-student-${i + 1}`,
    email: `g${i + 1}@example.edu`,
    displayName: `Group Student ${i + 1}`,
    studentCode: `SV10${i + 1}`,
  }));
}

/** Six students in one match, each with a distinctive prediction and note. */
async function setupGroup() {
  repos = createMemoryRepositories();
  groupService = new GroupService(repos);

  await repos.users.upsert({ ...INSTRUCTOR, role: 'INSTRUCTOR' });
  const course = await repos.courses.create({
    courseName: 'Digital Business',
    semester: '2026A',
    instructorId: INSTRUCTOR.uid,
  });
  for (const student of students()) {
    await repos.users.upsert({ ...student, role: 'STUDENT' });
    await repos.courses.addMember({ ...student, courseId: course.id });
  }

  assignment = await repos.assignments.create({
    courseId: course.id,
    title: 'Group round 1',
    startAt: Date.now() - 1000,
    deadline: Date.now() + 86_400_000,
    maxAttempts: 1,
    scenarioVersion: ARENA_SCENARIO_VERSION,
    engineVersion: arena.engineVersion,
    officialSeed: 'smartwatch-v1-2026',
    isOpen: true,
    createdBy: INSTRUCTOR.uid,
    mode: 'GROUP',
  });

  const [created] = await groupService.createGroups({
    assignmentId: assignment.id,
    count: 1,
    createdBy: INSTRUCTOR.uid,
    namePrefix: 'Group',
  });
  group = created!;

  const seatByUid = new Map<string, string>();
  for (const student of students()) {
    const { member } = await groupService.join({
      joinCode: group.joinCode,
      uid: student.uid,
      displayName: student.displayName,
      email: student.email,
      companyName: `Company ${student.uid}`,
      productName: 'Watch One',
      positioning: 'BALANCED',
    });
    seatByUid.set(student.uid, member.seatKey);
  }
  return seatByUid;
}

/** A note nobody else may ever see, unique per student. */
function secretNote(index: number) {
  return `SECRET-REASONING-OF-STUDENT-${index + 1}`;
}

async function playGroupQuarter(quarter: number) {
  for (const [index, student] of students().entries()) {
    await groupService.submitDecision({
      groupId: group.id,
      uid: student.uid,
      quarter,
      decision,
      forecast: { predictedRank: index + 1, predictedShare: 0.1, note: secretNote(index) },
    });
  }
}

describe('group: a prediction is private to the student who made it', () => {
  let seatByUid: Map<string, string>;

  beforeEach(async () => {
    seatByUid = await setupGroup();
  });

  it('shows each student their OWN prediction on the quarter result', async () => {
    await playGroupQuarter(1);

    for (const [index, student] of students().entries()) {
      const seat = seatByUid.get(student.uid)!;
      const view = await getQuarterView(repos, group.id, seat as never, 1);

      expect(view).not.toBeNull();
      expect(view!.yourForecast).not.toBeNull();
      expect(view!.yourForecast!.predictedRank).toBe(index + 1);
      expect(view!.yourForecast!.note).toBe(secretNote(index));
    }
  });

  it('LEAKS NO CLASSMATE REASONING ANYWHERE IN THE VIEW', async () => {
    await playGroupQuarter(1);

    for (const [index, student] of students().entries()) {
      const seat = seatByUid.get(student.uid)!;
      const serialised = JSON.stringify(await getQuarterView(repos, group.id, seat as never, 1));

      // The viewer's own note is expected. All five others must be absent.
      expect(serialised).toContain(secretNote(index));
      for (const [otherIndex] of students().entries()) {
        if (otherIndex === index) continue;
        expect(serialised).not.toContain(secretNote(otherIndex));
      }
    }
  });

  it('leaks nothing through the final report either', async () => {
    for (let quarter = 1; quarter <= arena.quarters; quarter += 1) {
      await playGroupQuarter(quarter);
    }

    for (const [index, student] of students().entries()) {
      const report = await getGroupReportView(repos, group.id, student.uid);
      expect(report).not.toBeNull();

      const serialised = JSON.stringify(report);
      expect(serialised).toContain(secretNote(index));
      for (const [otherIndex] of students().entries()) {
        if (otherIndex === index) continue;
        expect(serialised).not.toContain(secretNote(otherIndex));
      }

      // And the calibration index is their own, over all six quarters.
      expect(report!.forecast).not.toBeNull();
      expect(report!.forecast!.predicted).toBe(arena.quarters);
    }
  });

  it('records no prediction for a seat the instructor filled in', async () => {
    // A forced quarter submits on a student's behalf. The system has no belief
    // about the market, so it must not appear to have predicted one.
    for (const student of students(4)) {
      await groupService.submitDecision({
        groupId: group.id,
        uid: student.uid,
        quarter: 1,
        decision,
        forecast: { predictedRank: 2 },
      });
    }

    const forced = await groupService.forceQuarter(group.id);
    expect(forced.filledSeats).toHaveLength(2);

    for (const seat of forced.filledSeats) {
      const view = await getQuarterView(repos, group.id, seat, 1);
      expect(view!.yourForecast).toBeNull();
    }
  });
});
