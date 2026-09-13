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
