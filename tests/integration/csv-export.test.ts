import { beforeEach, describe, expect, it } from 'vitest';
import { getGameConfig, PLAYER_COMPANY_KEY, type QuarterDecision } from '@/domain/simulation';
import { createMemoryRepositories } from '@/db/repositories/memory';
import type { Repositories } from '@/db/repositories/types';
import { GameService } from '@/server/game/service';
import { quartersToCsv, resultsToCsv, toCsv } from '@/server/instructor/csv';

/**
 * CSV export (spec 9.3, 17 item 14).
 *
 * The export is what an instructor grades from, so the tests check the shape a
 * spreadsheet will actually see: one row per entity, RFC 4180 quoting, and dot
 * decimal separators regardless of the reader's locale.
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

async function playOfficialGame(companyName = 'NovaTime') {
  const course = await repos.courses.create({
    courseName: 'Digital Business',
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
    deadline: Date.now() + 86_400_000,
    maxAttempts: 1,
    scenarioVersion: getGameConfig().scenarioVersion,
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
    companyName,
    productName: 'Nova Watch One',
    positioning: 'BALANCED',
  });

  for (let quarter = 1; quarter <= getGameConfig().quarters; quarter += 1) {
    await service.submitQuarter(session.id, STUDENT.uid, quarter, decision);
  }

  return { assignment, session };
}

describe('CSV quoting', () => {
  it('quotes cells containing a comma, a quote or a newline', () => {
    const csv = toCsv(['a', 'b', 'c'], [['plain', 'has,comma', 'has"quote'], ['line\nbreak', '', null]]);
    expect(csv).toContain('plain,"has,comma","has""quote"');
    expect(csv).toContain('"line\nbreak",,');
  });

  it('starts with a UTF-8 BOM so spreadsheets read Vietnamese names correctly', () => {
    expect(toCsv(['a'], [['Nguyễn Văn A']]).charCodeAt(0)).toBe(0xfeff);
  });

  it('uses CRLF line endings', () => {
    const csv = toCsv(['a'], [['1'], ['2']]);
    expect(csv.split('\r\n').filter(Boolean)).toEqual(['﻿a', '1', '2']);
  });
});

describe('results export', () => {
  it('writes one row per completed session with the identity and every score', async () => {
    const { assignment } = await playOfficialGame();
    const results = await repos.finalResults.listByAssignment(assignment.id, 'finalScore');
    const csv = resultsToCsv(results);
    const lines = csv.trim().split('\r\n');

    expect(lines).toHaveLength(2);
    expect(lines[0]).toContain('student_code');
    expect(lines[0]).toContain('final_score');
    expect(lines[1]).toContain('SV001');
    expect(lines[1]).toContain('NovaTime');
    expect(lines[1]).toContain('smartwatch-v1');
  });

  it('writes numbers with a dot decimal separator, not a locale-specific one', async () => {
    const { assignment } = await playOfficialGame();
    const results = await repos.finalResults.listByAssignment(assignment.id, 'finalScore');
    const csv = resultsToCsv(results);
    const row = csv.trim().split('\r\n')[1]!;
    const scoreCell = row.split(',')[8]!; // final_score

    expect(Number.isFinite(Number(scoreCell))).toBe(true);
    expect(scoreCell).not.toContain(' ');
  });
});

/** Plays a full official game, using the Golden Strategy in the given quarters. */
async function playOfficialGameWithCoach(coachedQuarters: number[]) {
  const course = await repos.courses.create({
    courseName: 'Digital Business',
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
    deadline: Date.now() + 86_400_000,
    maxAttempts: 1,
    scenarioVersion: getGameConfig().scenarioVersion,
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

  for (let quarter = 1; quarter <= getGameConfig().quarters; quarter += 1) {
    if (coachedQuarters.includes(quarter)) {
      // Claimed directly: the search itself is tested elsewhere and takes a
      // third of a second per call.
      await repos.sessions.claimGoldenUse(session.id, quarter, coachedQuarters.length);
    }
    await service.submitQuarter(session.id, STUDENT.uid, quarter, decision);
  }

  return { session, assignment };
}

describe('seat selection', () => {
  it('defaults to the player company, and exports another seat when asked', async () => {
    // Solo sessions are always the `player` seat. A group match gives each of
    // the six students a different seat, so the export has to be able to follow
    // one of them.
    const { session } = await playOfficialGame();
    const quarters = await repos.sessions.listQuarters(session.id);

    const base = {
      studentCode: 'SV001',
      displayName: STUDENT.displayName,
      companyName: 'NovaTime',
      quarters,
    };

    const defaulted = quartersToCsv([base]);
    const explicit = quartersToCsv([{ ...base, seatKey: PLAYER_COMPANY_KEY }]);
    expect(explicit).toBe(defaulted);

    // A different seat exports that company's numbers, not the player's.
    const rival = quartersToCsv([{ ...base, seatKey: 'apple' }]);
    expect(rival).not.toBe(defaulted);
    expect(rival.trim().split('\r\n')).toHaveLength(quarters.length + 1);

    const firstQuarter = quarters[0]!;
    const appleResult = firstQuarter.results.find((r) => r.companyKey === 'apple');
    expect(appleResult).toBeDefined();
    expect(rival).toContain(String(appleResult!.unitsSold));
  });
});

describe('Golden Strategy columns', () => {
  it('appends the coach columns at the END, so existing column positions do not move', async () => {
    const { assignment } = await playOfficialGame();
    const results = await repos.finalResults.listByAssignment(assignment.id, 'finalScore');
    const header = resultsToCsv(results).trim().split('\r\n')[0]!.split(',');

    expect(header.slice(-2)).toEqual(['golden_strategy_uses', 'golden_strategy_quarters']);
    // The columns every existing gradebook addresses are still where they were.
    // (`trim()` above has already eaten the leading UTF-8 BOM.)
    expect(header[0]).toBe('student_code');
    expect(header[8]).toBe('final_score');
    expect(header[23]).toBe('game_rank');
  });

  it('reports no uses for a game played without the coach', async () => {
    const { assignment } = await playOfficialGame();
    const results = await repos.finalResults.listByAssignment(assignment.id, 'finalScore');
    const cells = resultsToCsv(results).trim().split('\r\n')[1]!.split(',');

    expect(cells.slice(-2)).toEqual(['0', '']);
  });

  it('records which quarters were coached, on the graded row and per quarter', async () => {
    const { session, assignment } = await playOfficialGameWithCoach([2, 4]);

    const results = await repos.finalResults.listByAssignment(assignment.id, 'finalScore');
    const cells = resultsToCsv(results).trim().split('\r\n')[1]!.split(',');
    expect(cells.slice(-2)).toEqual(['2', '2;4']);

    const quarters = await repos.sessions.listQuarters(session.id);
    const quarterCsv = quartersToCsv([
      {
        studentCode: 'SV001',
        displayName: STUDENT.displayName,
        companyName: 'NovaTime',
        quarters,
        goldenUsedQuarters: [2, 4],
      },
    ]);
    const lines = quarterCsv.trim().split('\r\n');
    // Addressed BY HEADER NAME, not as "the last column". Every later feature
    // that appends a column would otherwise break this assertion while the
    // behaviour it checks was still correct — which is what happened when the
    // prediction columns arrived.
    const header = lines[0]!.split(',');
    const goldenAt = header.indexOf('golden_strategy');
    expect(goldenAt).toBeGreaterThan(-1);

    const rows = lines.slice(1);
    // One flag per quarter row, in quarter order: only Q2 and Q4 are marked.
    expect(rows.map((row) => row.split(',')[goldenAt])).toEqual(['0', '1', '0', '1', '0', '0']);
  });

  it('appends new per-quarter columns AFTER golden_strategy, never before it', async () => {
    // Pins the convention the sibling test documents for the graded export:
    // existing column positions do not move, so a gradebook built on this file
    // keeps working. New columns go on the end.
    const { session } = await playOfficialGame();
    const quarters = await repos.sessions.listQuarters(session.id);
    const header = quartersToCsv([
      { studentCode: 'SV001', displayName: STUDENT.displayName, companyName: 'NovaTime', quarters },
    ])
      .trim()
      .split('\r\n')[0]!
      .split(',');

    expect(header[0]).toBe('student_code');
    expect(header[3]).toBe('quarter');
    expect(header.indexOf('predicted_rank')).toBeGreaterThan(header.indexOf('golden_strategy'));
  });
});

describe('per-quarter export — the audit trail', () => {
  it('writes one row per quarter with the decision beside the result it produced', async () => {
    const { session } = await playOfficialGame();
    const quarters = await repos.sessions.listQuarters(session.id);

    const csv = quartersToCsv([
      {
        studentCode: 'SV001',
        displayName: STUDENT.displayName,
        companyName: 'NovaTime',
        quarters,
      },
    ]);
    const lines = csv.trim().split('\r\n');

    expect(lines).toHaveLength(1 + getGameConfig().quarters);
    expect(lines[0]).toContain('product_points');
    expect(lines[0]).toContain('units_sold');

    // Every row carries the player's own decision, never a competitor's.
    for (let quarter = 1; quarter <= getGameConfig().quarters; quarter += 1) {
      const row = lines[quarter]!.split(',');
      expect(row[3]).toBe(String(quarter));
      expect(row[5]).toBe(String(decision.productPoints));
      expect(row[10]).toBe(String(decision.priceIndex));
    }
  });

  it('exports only the player company, never the five AI competitors', async () => {
    const { session } = await playOfficialGame();
    const quarters = await repos.sessions.listQuarters(session.id);
    const csv = quartersToCsv([
      { studentCode: 'SV001', displayName: 'A', companyName: 'NovaTime', quarters },
    ]);

    // Six quarters, one row each: no competitor rows leaked in.
    expect(csv.trim().split('\r\n')).toHaveLength(7);
    for (const key of ['apple', 'garmin', 'samsung', 'huawei', 'pixel']) {
      expect(csv).not.toContain(key);
    }
    expect(quarters[0]!.decisions[PLAYER_COMPANY_KEY]).toEqual(decision);
  });

  it('handles several students in one file', async () => {
    const first = await playOfficialGame('NovaTime');
    const quarters = await repos.sessions.listQuarters(first.session.id);

    const csv = quartersToCsv([
      { studentCode: 'SV001', displayName: 'A', companyName: 'NovaTime', quarters },
      { studentCode: 'SV002', displayName: 'B', companyName: 'ChronoLab', quarters },
    ]);
    expect(csv.trim().split('\r\n')).toHaveLength(1 + 12);
    expect(csv).toContain('SV002');
    expect(csv).toContain('ChronoLab');
  });
});

describe('the export cannot smuggle formulas into the gradebook', () => {
  /**
   * Company and display names are student-supplied and only length-checked, so
   * anything a spreadsheet would execute has to be neutralised here. The export
   * is opened by the instructor, on the instructor's machine, to grade from.
   */
  const dangerous = ['=', '+', '-', '@', '\t', '\r'];

  it.each(dangerous)('quotes a cell beginning with %j as text', (lead) => {
    const csv = toCsv(['name'], [[`${lead}HYPERLINK("http://x","Grades")`]]);
    const cell = csv.split('\r\n')[1]!;

    expect(cell.startsWith("'") || cell.startsWith('"\'')).toBe(true);
  });

  it('leaves negative numbers usable as numbers', () => {
    // -1234.5 must stay -1234.5: prefixing it would turn every loss in the
    // export into text and break the instructor's totals.
    const csv = toCsv(['net_profit'], [[-1234.5], ['-1234.5']]);
    const [, fromNumber, fromString] = csv.split('\r\n');

    expect(fromNumber).toBe('-1234.5');
    expect(fromString).toBe('-1234.5');
  });

  it('still quotes commas, quotes and newlines as before', () => {
    const csv = toCsv(['name'], [['Nova, "Best" Watch\nLtd']]);

    expect(csv).toContain('"Nova, ""Best"" Watch\nLtd"');
  });

  it('neutralises a hostile company name end to end', async () => {
    const attack = '=cmd|calc';
    const session = await service.createSession({
      userId: STUDENT.uid,
      displayName: STUDENT.displayName,
      email: STUDENT.email,
      mode: 'PRACTICE',
      assignmentId: null,
      companyName: attack,
      productName: 'Nova Watch One',
      positioning: 'BALANCED',
    });
    const config = getGameConfig();
    for (let q = 1; q <= config.quarters; q += 1) {
      await service.submitQuarter(session.id, STUDENT.uid, q, decision);
    }

    const csv = quartersToCsv([
      {
        studentCode: 'SV001',
        displayName: STUDENT.displayName,
        companyName: attack,
        quarters: await repos.sessions.listQuarters(session.id),
      },
    ]);

    expect(csv).not.toContain(`,${attack},`);
    expect(csv).toContain("'=cmd|calc");
  });
});
