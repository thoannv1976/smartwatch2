import { beforeEach, describe, expect, it } from 'vitest';
import { SignJWT, createLocalJWKSet, exportJWK, generateKeyPair } from 'jose';
import { getGameConfig, type QuarterDecision } from '@/domain/simulation';
import { createMemoryRepositories } from '@/db/repositories/memory';
import { COLLECTIONS } from '@/db/repositories/firestore';
import type { Repositories } from '@/db/repositories/types';
import { GameService } from '@/server/game/service';
import { TICKET_TYP, verifyLaunchTicket, type LaunchContext } from '@/server/lti/hub-sdk';
import { LTI_COLLECTIONS, MemoryLtiStore } from '@/server/lti/store';
import { LtiError, createLtiService, type LtiHubClient, type LtiIdentity } from '@/server/lti/service';

/**
 * The LMS connection (UniGame Hub / LTI 1.3), end to end against in-memory
 * repositories, a fake Firebase Auth and a fake Hub. The ticket test signs real
 * RS256 tickets with a local key.
 */

class FakeIdentity implements LtiIdentity {
  readonly byEmail = new Map<string, string>();
  readonly uids = new Set<string>();
  created: { email: string; displayName: string }[] = [];
  private next = 1;
  seed(uid: string, email: string) {
    this.uids.add(uid);
    this.byEmail.set(email, uid);
  }
  async findUidByEmail(email: string) {
    return this.byEmail.get(email) ?? null;
  }
  async userExists(uid: string) {
    return this.uids.has(uid);
  }
  async createUser(input: { email: string; displayName: string }) {
    const uid = `fb-${this.next++}`;
    this.created.push(input);
    this.seed(uid, input.email);
    return uid;
  }
  async createCustomToken(uid: string) {
    return `custom-token-for-${uid}`;
  }
}

class FakeHub implements LtiHubClient {
  results: Parameters<LtiHubClient['submitResult']>[0][] = [];
  bulks: Parameters<LtiHubClient['submitBulkResult']>[0][] = [];
  fail = false;
  async submitResult(r: Parameters<LtiHubClient['submitResult']>[0]) {
    if (this.fail) throw new Error('hub down');
    this.results.push(r);
    return { status: 'queued' as const };
  }
  async submitBulkResult(b: Parameters<LtiHubClient['submitBulkResult']>[0]) {
    this.bulks.push(b);
    return { status: 'accepted' as const, matched: b.rows.length, queued: b.rows.length, duplicate: 0, stale_ignored: 0, not_better: 0, unmatched: [] };
  }
}

const decision: QuarterDecision = {
  productPoints: 20,
  technologyPoints: 20,
  marketingPoints: 20,
  distributionPoints: 20,
  cxPoints: 20,
  priceIndex: 100,
};

let repos: Repositories;
let store: MemoryLtiStore;
let identity: FakeIdentity;
let hub: FakeHub;
let lti: ReturnType<typeof createLtiService>;

function ctx(overrides: Partial<LaunchContext> = {}): LaunchContext {
  return {
    ticketId: `t-${Math.random()}`,
    hubUserId: 'hub-student-1',
    tenantId: 'aiedu2026',
    gameId: 'smartwatch9',
    platform: { issuer: 'https://aiedu2026.com', deploymentId: '1' },
    ltiSub: 'sub-1',
    name: 'Sinh Vien Mot',
    email: 'sv001@aiedu2026.com',
    username: 'sv001',
    role: 'learner',
    context: { id: 'course-59', title: 'GAMEHUB-TEST', label: 'GHT' },
    resourceLink: { id: 'activity-1', title: 'Smartwatch – lượt chính thức' },
    gradeTarget: 'gt-student-1',
    linkTarget: 'lt-activity-1',
    launchId: 'launch-1',
    ...overrides,
  };
}

const teacher = (o: Partial<LaunchContext> = {}) =>
  ctx({ hubUserId: 'hub-teacher', email: 'thoannv@aiedu2026.com', username: 'thoannv', name: 'Giang Vien', role: 'instructor', gradeTarget: undefined, ...o });

beforeEach(() => {
  repos = createMemoryRepositories();
  store = new MemoryLtiStore();
  identity = new FakeIdentity();
  hub = new FakeHub();
  lti = createLtiService({ repos, store, identity, hub, tenants: ['aiedu2026'] });
});

async function linkActivity() {
  const first = await lti.launch(teacher());
  const key = first.next.split('key=')[1]!;
  const instructor = (await repos.users.get(identity.byEmail.get('thoannv@aiedu2026.com')!))!;
  const assignmentId = await lti.linkNew(key, instructor);
  return { key, instructor, assignmentId };
}

describe('LTI collections', () => {
  it('never share an id with a game collection (collection groups)', () => {
    const game = new Set<string>(Object.values(COLLECTIONS));
    for (const id of Object.values(LTI_COLLECTIONS)) expect(game.has(id)).toBe(false);
  });
});

describe('instructor launch and linking', () => {
  it('a first instructor launch creates an INSTRUCTOR account and asks to link', async () => {
    const r = await lti.launch(teacher());
    expect(r.customToken).toMatch(/^custom-token-for-/);
    expect(r.next).toMatch(/^\/lti\/link\?key=[0-9a-f]{40}$/);
    const uid = identity.byEmail.get('thoannv@aiedu2026.com')!;
    expect((await repos.users.get(uid))?.role).toBe('INSTRUCTOR');
  });

  it('linkNew creates a course and an open official assignment, and clears the pending link', async () => {
    const { key, assignmentId, instructor } = await linkActivity();
    const assignment = (await repos.assignments.get(assignmentId))!;
    expect(assignment.isOpen).toBe(true);
    expect(assignment.maxAttempts).toBe(1);
    expect(assignment.title).toBe('Smartwatch – lượt chính thức');
    const course = (await repos.courses.get(assignment.courseId))!;
    expect(course.instructorId).toBe(instructor.uid);
    expect(course.courseName).toBe('GAMEHUB-TEST');
    expect(await store.getPending(key)).toBeNull();
    expect((await store.getLink(key))?.linkTarget).toBe('lt-activity-1');
  });

  it('a later instructor launch goes straight to the assignment', async () => {
    const { assignmentId } = await linkActivity();
    const again = await lti.launch(teacher());
    expect(again.next).toBe(`/instructor/assignments/${assignmentId}`);
  });

  it('only the instructor who launched (or an admin) can complete a pending link', async () => {
    const first = await lti.launch(teacher());
    const key = first.next.split('key=')[1]!;
    await repos.users.upsert({ uid: 'other', email: 'o@x.edu', displayName: 'Other', role: 'INSTRUCTOR' });
    const other = (await repos.users.get('other'))!;
    await expect(lti.linkNew(key, other)).rejects.toMatchObject({ code: 'forbidden' });
  });

  it('a pending link expires', async () => {
    let t = Date.now();
    lti = createLtiService({ repos, store, identity, hub, tenants: [], now: () => t });
    const first = await lti.launch(teacher());
    const key = first.next.split('key=')[1]!;
    const instructor = (await repos.users.get(identity.byEmail.get('thoannv@aiedu2026.com')!))!;
    t += 3 * 60 * 60 * 1000;
    await expect(lti.linkNew(key, instructor)).rejects.toMatchObject({ code: 'linkExpired' });
  });

  it('linkExisting refuses an assignment in someone else’s course', async () => {
    const first = await lti.launch(teacher());
    const key = first.next.split('key=')[1]!;
    const instructor = (await repos.users.get(identity.byEmail.get('thoannv@aiedu2026.com')!))!;
    const foreign = await repos.courses.create({ courseName: 'X', semester: 'Y', instructorId: 'someone-else' });
    const a = await repos.assignments.create({
      courseId: foreign.id, title: 'Theirs', startAt: 0, deadline: Date.now() + 1e9, maxAttempts: 1,
      scenarioVersion: 'smartwatch-v1', engineVersion: '1.0.0', officialSeed: 'seed-x', isOpen: true, createdBy: 'someone-else',
    });
    await expect(lti.linkExisting(key, instructor, a.id)).rejects.toMatchObject({ code: 'forbidden' });
  });
});

describe('student launch', () => {
  it('is refused before linking, without creating an account', async () => {
    await expect(lti.launch(ctx())).rejects.toMatchObject({ code: 'notLinked', status: 409 });
    expect(identity.created).toHaveLength(0);
  });

  it('is refused for a tenant that is not allowed', async () => {
    await expect(lti.launch(ctx({ tenantId: 'other-school' }))).rejects.toBeInstanceOf(LtiError);
  });

  it('creates the account, joins the course with the LMS username and opens a new official game', async () => {
    const { assignmentId } = await linkActivity();
    const r = await lti.launch(ctx());
    expect(r.next).toBe(`/new-game?mode=OFFICIAL&assignmentId=${assignmentId}`);
    const uid = identity.byEmail.get('sv001@aiedu2026.com')!;
    expect((await repos.users.get(uid))?.role).toBe('STUDENT');
    const assignment = (await repos.assignments.get(assignmentId))!;
    expect((await repos.courses.getMember(assignment.courseId, uid))?.studentCode).toBe('sv001');
    expect((await store.getGradeTarget(uid, assignmentId))?.gradeTarget).toBe('gt-student-1');
  });

  it('reuses an existing account with the same e-mail and keeps its role', async () => {
    await linkActivity();
    identity.seed('existing-admin', 'boss@aiedu2026.com');
    await repos.users.upsert({ uid: 'existing-admin', email: 'boss@aiedu2026.com', displayName: 'Boss', role: 'ADMIN' });
    await lti.launch(ctx({ hubUserId: 'hub-boss', email: 'boss@aiedu2026.com', username: 'boss' }));
    expect((await repos.users.get('existing-admin'))?.role).toBe('ADMIN');
    expect(identity.created.map((c) => c.email)).not.toContain('boss@aiedu2026.com');
  });

  it('promotes a student whom the LMS says teaches, but never demotes', async () => {
    identity.seed('s1', 'thoannv@aiedu2026.com');
    await repos.users.upsert({ uid: 's1', email: 'thoannv@aiedu2026.com', displayName: 'T', role: 'STUDENT' });
    await lti.launch(teacher());
    expect((await repos.users.get('s1'))?.role).toBe('INSTRUCTOR');

    const { assignmentId } = await (async () => {
      const key = (await lti.launch(teacher())).next.split('key=')[1]!;
      return { assignmentId: await lti.linkNew(key, (await repos.users.get('s1'))!) };
    })();
    expect(assignmentId).toBeTruthy();
    // The same person opening it as a learner keeps INSTRUCTOR.
    await lti.launch(ctx({ hubUserId: 'hub-teacher', email: 'thoannv@aiedu2026.com', role: 'learner' }));
    expect((await repos.users.get('s1'))?.role).toBe('INSTRUCTOR');
  });

  it('gives a student without an e-mail an undeliverable placeholder address', async () => {
    await linkActivity();
    await lti.launch(ctx({ hubUserId: 'hub-noemail', email: undefined, username: 'sv777' }));
    expect(identity.created.at(-1)?.email).toMatch(/^lti-[0-9a-f]{16}@lti\.invalid$/);
  });

  it('uses a different student code when the LMS username is taken in the course', async () => {
    const { assignmentId } = await linkActivity();
    const assignment = (await repos.assignments.get(assignmentId))!;
    await repos.courses.selfEnroll({ uid: 'someone', courseId: assignment.courseId, studentCode: 'sv001', displayName: 'X', email: 'x@x' });
    await lti.launch(ctx());
    const uid = identity.byEmail.get('sv001@aiedu2026.com')!;
    expect((await repos.courses.getMember(assignment.courseId, uid))?.studentCode).toBe('sv001-hub-');
  });
});

describe('grades', () => {
  async function playOfficial(uid: string, assignmentId: string) {
    const game = new GameService(repos);
    const user = (await repos.users.get(uid))!;
    const session = await game.createSession({
      userId: uid, displayName: user.displayName, email: user.email, mode: 'OFFICIAL', assignmentId,
      companyName: 'NovaTime', productName: 'Nova One', positioning: 'BALANCED',
    });
    for (let q = 1; q <= getGameConfig().quarters; q += 1) await game.submitQuarter(session.id, uid, q, decision);
    return session.id;
  }

  it('sends a finished official game once, to the student’s grade target', async () => {
    const { assignmentId } = await linkActivity();
    await lti.launch(ctx());
    const uid = identity.byEmail.get('sv001@aiedu2026.com')!;
    const sessionId = await playOfficial(uid, assignmentId);

    expect(await lti.sendGradeForSession(sessionId)).toMatchObject({ sent: true, status: 'queued' });
    expect(hub.results).toHaveLength(1);
    expect(hub.results[0]).toMatchObject({ gradeTarget: 'gt-student-1', attemptId: sessionId, maxScore: 100 });
    const final = (await repos.finalResults.get(sessionId))!;
    expect(hub.results[0]!.score).toBeCloseTo(final.finalScore, 2);

    expect(await lti.sendGradeForSession(sessionId)).toMatchObject({ sent: false });
    expect(hub.results).toHaveLength(1);
  });

  it('records a Hub failure so the next attempt retries', async () => {
    const { assignmentId } = await linkActivity();
    await lti.launch(ctx());
    const uid = identity.byEmail.get('sv001@aiedu2026.com')!;
    const sessionId = await playOfficial(uid, assignmentId);
    hub.fail = true;
    await expect(lti.sendGradeForSession(sessionId)).rejects.toThrow('hub down');
    expect((await store.getGradeLog(sessionId))?.status).toBe('error');
    hub.fail = false;
    expect(await lti.sendGradeForSession(sessionId)).toMatchObject({ sent: true });
  });

  it('does nothing for a student who never came from the LMS', async () => {
    const { assignmentId } = await linkActivity();
    await repos.users.upsert({ uid: 'direct', email: 'direct@x.edu', displayName: 'Direct', role: 'STUDENT' });
    const assignment = (await repos.assignments.get(assignmentId))!;
    await repos.courses.addMember({ uid: 'direct', courseId: assignment.courseId, studentCode: 'SV9', displayName: 'Direct', email: 'direct@x.edu' });
    const sessionId = await playOfficial('direct', assignmentId);
    expect(await lti.sendGradeForSession(sessionId)).toMatchObject({ sent: false });
    expect(hub.results).toHaveLength(0);
  });

  it('class grades: one row per student with Hub id, username and real e-mail only', async () => {
    const { assignmentId } = await linkActivity();
    await lti.launch(ctx());
    await lti.launch(ctx({ hubUserId: 'hub-2', email: undefined, username: 'sv002', gradeTarget: 'gt-2' }));
    const uid1 = identity.byEmail.get('sv001@aiedu2026.com')!;
    const uid2 = [...identity.uids].find((u) => u !== uid1 && identity.byEmail.get('thoannv@aiedu2026.com') !== u)!;
    await playOfficial(uid1, assignmentId);
    await playOfficial(uid2, assignmentId);

    const out = await lti.sendClassGrades(assignmentId);
    expect(out.rows).toBe(2);
    expect(hub.bulks).toHaveLength(1);
    const rows = hub.bulks[0]!.rows;
    expect(rows.find((r) => r.hubUserId === 'hub-student-1')).toMatchObject({ username: 'sv001', email: 'sv001@aiedu2026.com' });
    const second = rows.find((r) => r.hubUserId === 'hub-2')!;
    expect(second.username).toBe('sv002');
    expect(second.email).toBeUndefined();
    expect(hub.bulks[0]!.linkTarget).toBe('lt-activity-1');
  });
});

describe('launch ticket', () => {
  it('accepts a valid Hub ticket once and rejects a replay or another game', async () => {
    const { privateKey, publicKey } = await generateKeyPair('RS256');
    const jwk = { ...(await exportJWK(publicKey)), kid: 'k1', alg: 'RS256' };
    const jwks = createLocalJWKSet({ keys: [jwk] });
    const hubUrl = 'https://hub.example';
    const sign = (aud: string) =>
      new SignJWT({ ugh: { tenantId: 'aiedu2026', role: 'learner', platform: { issuer: 'x', deploymentId: '1' }, resourceLink: { id: 'r' }, launchId: 'l', ltiSub: 's' } })
        .setProtectedHeader({ alg: 'RS256', typ: TICKET_TYP, kid: 'k1' })
        .setIssuer(hubUrl)
        .setAudience(aud)
        .setSubject('hub-user')
        .setJti('jti-1')
        .setIssuedAt()
        .setExpirationTime('2m')
        .sign(privateKey);

    const used = new MemoryLtiStore();
    const opts = { hubUrl, gameId: 'smartwatch9', jwks, markUsed: (j: string) => used.markTicketUsed(j) };
    const ticket = await sign('smartwatch9');
    const c = await verifyLaunchTicket(ticket, opts);
    expect(c.hubUserId).toBe('hub-user');
    await expect(verifyLaunchTicket(ticket, opts)).rejects.toThrow(/already used/);
    await expect(verifyLaunchTicket(await sign('other-game'), { ...opts, markUsed: undefined })).rejects.toThrow();
  });
});
