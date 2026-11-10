import { beforeEach, describe, expect, it } from 'vitest';
import { ARENA_SCENARIO_VERSION, ARENA_SEATS, getGameConfig, type QuarterDecision } from '@/domain/simulation';
import { createMemoryRepositories } from '@/db/repositories/memory';
import type { AssignmentDoc } from '@/db/models';
import type { Repositories } from '@/db/repositories/types';
import { GroupService, defaultCompanyProfile } from '@/server/group/service';
import type { LaunchContext } from '@/server/lti/hub-sdk';
import { MemoryLtiStore } from '@/server/lti/store';
import { createLtiService, type LtiHubClient, type LtiIdentity } from '@/server/lti/service';

/**
 * Industry mode: one student runs one company, six companies compete in one
 * industry, and a class is split into as many industries as it needs — by the
 * instructor in one click, or one student at a time as they open the game from
 * Moodle.
 */

const arena = getGameConfig(ARENA_SCENARIO_VERSION);
const INSTRUCTOR = { uid: 'instructor-1', email: 'teacher@example.edu', displayName: 'Giang Vien' };
const decision: QuarterDecision = {
  productPoints: 20,
  technologyPoints: 20,
  marketingPoints: 20,
  distributionPoints: 20,
  cxPoints: 20,
  priceIndex: 100,
};

let repos: Repositories;
let service: GroupService;
let assignment: AssignmentDoc;
let courseId: string;

async function enrol(n: number, from = 1) {
  for (let i = from; i < from + n; i += 1) {
    const student = {
      uid: `student-${i}`,
      email: `sv${i}@example.edu`,
      displayName: `Nguyen Van ${i}`,
      studentCode: `26190${String(i).padStart(5, '0')}`,
    };
    await repos.users.upsert({ ...student, role: 'STUDENT' });
    await repos.courses.addMember({ ...student, courseId });
  }
}

async function setup(seating: 'AUTO' | 'CODE' = 'AUTO', isOpen = true) {
  repos = createMemoryRepositories();
  service = new GroupService(repos);
  await repos.users.upsert({ ...INSTRUCTOR, role: 'INSTRUCTOR' });
  const course = await repos.courses.create({ courseName: 'ECOM', semester: 'OCT', instructorId: INSTRUCTOR.uid });
  courseId = course.id;
  assignment = await repos.assignments.create({
    courseId,
    title: 'Industry round',
    startAt: Date.now() - 1000,
    deadline: Date.now() + 86_400_000,
    maxAttempts: 1,
    scenarioVersion: ARENA_SCENARIO_VERSION,
    engineVersion: arena.engineVersion,
    officialSeed: 'smartwatch-v1-2026',
    isOpen,
    createdBy: INSTRUCTOR.uid,
    mode: 'GROUP',
    seating,
  });
}

async function humansPerIndustry(): Promise<number[]> {
  const groups = await repos.groups.listByAssignment(assignment.id);
  return groups.map((g) => ARENA_SEATS.filter((s) => g.seats[s] != null).length);
}

const keepOrder = <T,>(xs: T[]) => xs;

describe('assigning a whole class to industries', () => {
  beforeEach(() => setup());

  it('90 students make 15 industries of six, each student with their own company', async () => {
    await enrol(90);
    const summary = await service.autoAssign({ assignmentId: assignment.id, createdBy: INSTRUCTOR.uid });
    expect(summary).toEqual({ seated: 90, createdGroups: 15, alreadySeated: 0, unplaced: 0 });

    const sizes = await humansPerIndustry();
    expect(sizes).toHaveLength(15);
    expect(sizes.every((n) => n === 6)).toBe(true);

    const groups = await repos.groups.listByAssignment(assignment.id);
    expect(groups.map((g) => g.name)).toContain('Industry 15');

    // Every student holds exactly one seat, under a company named after them.
    for (let i = 1; i <= 90; i += 1) {
      const m = await service.findMembership(assignment.id, `student-${i}`);
      expect(m?.companyName).toBe(defaultCompanyProfile(`Nguyen Van ${i}`, m!.studentCode).companyName);
    }
  });

  it('a class that does not divide by six is spread evenly (92 → 12 industries of 6 and 4 of 5)', async () => {
    await enrol(92);
    await service.autoAssign({ assignmentId: assignment.id, createdBy: INSTRUCTOR.uid, order: keepOrder });
    const sizes = (await humansPerIndustry()).sort();
    expect(sizes).toHaveLength(16);
    expect(sizes.filter((n) => n === 6)).toHaveLength(12);
    expect(sizes.filter((n) => n === 5)).toHaveLength(4);
  });

  it('running it again only places newcomers, and never touches an industry that has started', async () => {
    await enrol(12);
    await service.autoAssign({ assignmentId: assignment.id, createdBy: INSTRUCTOR.uid, order: keepOrder });
    const first = await repos.groups.listByAssignment(assignment.id);
    const before = await service.findMembership(assignment.id, 'student-1');

    // Industry 1 starts playing: its match now exists.
    const starter = first[0]!.seats[ARENA_SEATS[0]!]!;
    await service.submitDecision({ groupId: first[0]!.id, uid: starter, quarter: 1, decision });

    await enrol(4, 13);
    const again = await service.autoAssign({ assignmentId: assignment.id, createdBy: INSTRUCTOR.uid });
    expect(again.seated).toBe(4);
    expect(again.alreadySeated).toBe(12);
    expect((await service.findMembership(assignment.id, 'student-1'))?.groupId).toBe(before?.groupId);

    const started = (await repos.groups.get(first[0]!.id))!;
    expect(ARENA_SEATS.filter((s) => started.seats[s] != null)).toHaveLength(6);
    for (let i = 13; i <= 16; i += 1) {
      const m = await service.findMembership(assignment.id, `student-${i}`);
      expect(m?.groupId).not.toBe(first[0]!.id);
    }
  });

  it('students removed from the course are not seated', async () => {
    await enrol(7);
    await repos.courses.setMemberRemoved(courseId, 'student-7', Date.now());
    const summary = await service.autoAssign({ assignmentId: assignment.id, createdBy: INSTRUCTOR.uid });
    expect(summary.seated).toBe(6);
    expect(await service.findMembership(assignment.id, 'student-7')).toBeNull();
  });
});

describe('seating one student at a time', () => {
  beforeEach(() => setup());

  it('fills an industry to six before opening the next, and is idempotent', async () => {
    await enrol(7);
    const seats = [];
    for (let i = 1; i <= 7; i += 1) {
      seats.push(
        await service.autoSeat({ assignmentId: assignment.id, uid: `student-${i}`, displayName: `Nguyen Van ${i}`, email: `sv${i}@example.edu` }),
      );
    }
    const firstSix = new Set(seats.slice(0, 6).map((s) => s.groupId));
    expect(firstSix.size).toBe(1);
    expect(seats[6]!.groupId).not.toBe(seats[0]!.groupId);
    expect(new Set(seats.slice(0, 6).map((s) => s.seatKey)).size).toBe(6);

    const again = await service.autoSeat({ assignmentId: assignment.id, uid: 'student-1', displayName: 'x', email: 'x' });
    expect(again.groupId).toBe(seats[0]!.groupId);
    expect(await humansPerIndustry()).toEqual([6, 1]);
  });

  it('six students arriving at once share ONE new industry, each in their own seat', async () => {
    await enrol(6);
    const seats = await Promise.all(
      Array.from({ length: 6 }, (_, i) =>
        service.autoSeat({ assignmentId: assignment.id, uid: `student-${i + 1}`, displayName: 'S', email: 's@x' }),
      ),
    );
    expect(new Set(seats.map((s) => s.groupId)).size).toBe(1);
    expect(new Set(seats.map((s) => s.seatKey)).size).toBe(6);
    expect(await humansPerIndustry()).toEqual([6]);
  });

  it('twelve students arriving at once make two full industries', async () => {
    await enrol(12);
    await Promise.all(
      Array.from({ length: 12 }, (_, i) =>
        service.autoSeat({ assignmentId: assignment.id, uid: `student-${i + 1}`, displayName: 'S', email: 's@x' }),
      ),
    );
    expect((await humansPerIndustry()).sort()).toEqual([6, 6]);
  });

  it('refuses a student who is not on the course roster', async () => {
    await expect(
      service.autoSeat({ assignmentId: assignment.id, uid: 'stranger', displayName: 'S', email: 's@x' }),
    ).rejects.toMatchObject({ key: 'notEnrolled' });
  });

  it('refuses when the assignment is closed', async () => {
    await setup('AUTO', false);
    await enrol(1);
    await expect(
      service.autoSeat({ assignmentId: assignment.id, uid: 'student-1', displayName: 'S', email: 's@x' }),
    ).rejects.toMatchObject({ key: 'notOpenYet' });
  });
});

describe('naming your own company', () => {
  beforeEach(() => setup());

  it('can be changed until the first decision, and the market uses the chosen name', async () => {
    await enrol(2);
    const a = await service.autoSeat({ assignmentId: assignment.id, uid: 'student-1', displayName: 'Lan', email: 'l@x' });
    await service.autoSeat({ assignmentId: assignment.id, uid: 'student-2', displayName: 'Minh', email: 'm@x' });

    const renamed = await service.updateCompanyProfile({
      groupId: a.groupId,
      uid: 'student-1',
      companyName: 'Lotus Wearables',
      productName: 'Lotus Fit',
      positioning: 'FITNESS',
    });
    expect(renamed).toMatchObject({ companyName: 'Lotus Wearables', positioning: 'FITNESS' });
    expect(await service.canEditCompany(a.groupId)).toBe(true);

    await service.submitDecision({ groupId: a.groupId, uid: 'student-1', quarter: 1, decision });
    const game = (await repos.groupGames.get(a.groupId))!;
    expect(game.companies.find((c) => c.companyKey === a.seatKey)?.companyName).toBe('Lotus Wearables');

    expect(await service.canEditCompany(a.groupId)).toBe(false);
    await expect(
      service.updateCompanyProfile({ groupId: a.groupId, uid: 'student-1', companyName: 'Too late', productName: 'X', positioning: 'BALANCED' }),
    ).rejects.toMatchObject({ key: 'companyLocked' });
  });

  it('only a member of the industry can rename, and names must be 1–60 characters', async () => {
    await enrol(1);
    const a = await service.autoSeat({ assignmentId: assignment.id, uid: 'student-1', displayName: 'Lan', email: 'l@x' });
    await expect(
      service.updateCompanyProfile({ groupId: a.groupId, uid: 'someone-else', companyName: 'X', productName: 'Y', positioning: 'BALANCED' }),
    ).rejects.toMatchObject({ key: 'notInThisGroup' });
    await expect(
      service.updateCompanyProfile({ groupId: a.groupId, uid: 'student-1', companyName: ' ', productName: 'Y', positioning: 'BALANCED' }),
    ).rejects.toMatchObject({ key: 'invalidCompanyName' });
  });
});

// ---------------------------------------------------------------------------
// From Moodle (UniGame Hub / LTI 1.3)
// ---------------------------------------------------------------------------

class FakeIdentity implements LtiIdentity {
  readonly byEmail = new Map<string, string>();
  private next = 1;
  async findUidByEmail(email: string) {
    return this.byEmail.get(email) ?? null;
  }
  async userExists() {
    return true;
  }
  async createUser(input: { email: string; displayName: string }) {
    const uid = `fb-${this.next++}`;
    this.byEmail.set(input.email, uid);
    return uid;
  }
  async createCustomToken(uid: string) {
    return `token-${uid}`;
  }
}

class FakeHub implements LtiHubClient {
  results: Parameters<LtiHubClient['submitResult']>[0][] = [];
  async submitResult(r: Parameters<LtiHubClient['submitResult']>[0]) {
    this.results.push(r);
    return { status: 'queued' as const };
  }
  async submitBulkResult(b: Parameters<LtiHubClient['submitBulkResult']>[0]) {
    return { status: 'accepted' as const, matched: b.rows.length, queued: b.rows.length, duplicate: 0, stale_ignored: 0, not_better: 0, unmatched: [] };
  }
}

function launchCtx(o: Partial<LaunchContext> = {}): LaunchContext {
  return {
    ticketId: `t-${Math.random()}`,
    hubUserId: 'hub-student-1',
    tenantId: 'aiedu2026',
    gameId: 'smartwatch9',
    platform: { issuer: 'https://aiedu2026.com', deploymentId: '1' },
    ltiSub: 'sub-1',
    name: 'Sinh Vien',
    email: 'sv1@aiedu2026.com',
    username: 'sv1',
    role: 'learner',
    context: { id: 'course-33', title: 'ECOM OCT', label: 'ECOM-OCT' },
    resourceLink: { id: 'activity-industry', title: 'Smartwatch – thi đấu ngành' },
    gradeTarget: 'gt-1',
    linkTarget: 'lt-industry',
    launchId: 'launch-1',
    ...o,
  };
}

describe('industry competition from Moodle', () => {
  let store: MemoryLtiStore;
  let identity: FakeIdentity;
  let hub: FakeHub;
  let lti: ReturnType<typeof createLtiService>;

  const teacher = () =>
    launchCtx({ hubUserId: 'hub-teacher', email: 'thoannv@aiedu2026.com', username: 'thoannv', name: 'Giang Vien', role: 'instructor', gradeTarget: undefined });
  const student = (i: number) =>
    launchCtx({ hubUserId: `hub-s${i}`, email: `sv${i}@aiedu2026.com`, username: `26190${i}`, name: `Sinh Vien ${i}`, gradeTarget: `gt-${i}` });

  async function linkIndustry() {
    const first = await lti.launch(teacher());
    const key = first.next.split('key=')[1]!;
    const instructor = (await repos.users.get(identity.byEmail.get('thoannv@aiedu2026.com')!))!;
    return lti.linkNew(key, instructor, 'GROUP');
  }

  beforeEach(() => {
    repos = createMemoryRepositories();
    service = new GroupService(repos);
    store = new MemoryLtiStore();
    identity = new FakeIdentity();
    hub = new FakeHub();
    lti = createLtiService({ repos, store, identity, hub, tenants: ['aiedu2026'] });
  });

  it('creates an arena assignment that seats students automatically', async () => {
    const id = await linkIndustry();
    const a = (await repos.assignments.get(id))!;
    expect(a).toMatchObject({ mode: 'GROUP', seating: 'AUTO', scenarioVersion: ARENA_SCENARIO_VERSION });
  });

  it('each student opening it lands in their own seat; the 7th opens a second industry', async () => {
    const id = await linkIndustry();
    const groupIds: string[] = [];
    for (let i = 1; i <= 7; i += 1) {
      const r = await lti.launch(student(i));
      expect(r.next).toMatch(/^\/group\//);
      groupIds.push(r.next.split('/')[2]!);
    }
    expect(new Set(groupIds.slice(0, 6)).size).toBe(1);
    expect(groupIds[6]).not.toBe(groupIds[0]);
    // Opening it again goes back to the same industry.
    expect((await lti.launch(student(1))).next).toBe(`/group/${groupIds[0]}`);
    expect((await repos.groups.listByAssignment(id)).map((g) => g.name)).toEqual(['Industry 1', 'Industry 2']);
  });

  it('with join codes, a student without a seat is sent to the code form', async () => {
    const id = await linkIndustry();
    await repos.assignments.update(id, { seating: 'CODE' });
    expect((await lti.launch(student(1))).next).toBe('/group/join');
  });

  it('group assignments can be linked to an activity', async () => {
    const id = await linkIndustry();
    const instructor = (await repos.users.get(identity.byEmail.get('thoannv@aiedu2026.com')!))!;
    const linkable = await lti.linkableAssignments(instructor);
    expect(linkable.map((x) => x.assignment.id)).toContain(id);
  });

  it('a finished industry sends each student’s score to the Moodle gradebook', async () => {
    const id = await linkIndustry();
    const r1 = await lti.launch(student(1));
    await lti.launch(student(2));
    const groupId = r1.next.split('/')[2]!;
    const members = await repos.groups.listMembers(groupId);

    for (let q = 1; q <= arena.quarters; q += 1) {
      for (const m of members) await service.submitDecision({ groupId, uid: m.uid, quarter: q, decision });
    }
    expect((await service.getState(groupId)).completed).toBe(true);

    for (const m of members) {
      const sent = await lti.sendGradeForSession(`${groupId}__${m.seatKey}`);
      expect(sent.sent).toBe(true);
    }
    expect(hub.results.map((r) => r.gradeTarget).sort()).toEqual(['gt-1', 'gt-2']);
    expect(hub.results.every((r) => r.score >= 0 && r.score <= 100)).toBe(true);
    expect((await repos.assignments.get(id))?.mode).toBe('GROUP');
  });
});
