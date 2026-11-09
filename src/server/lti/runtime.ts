import 'server-only';
import { getAdminAuth, getDb } from '@/db/firestore';
import { getRepositories } from '@/db/repositories/firestore';
import { submitBulkResult, submitResult, verifyLaunchTicket, type LaunchContext } from './hub-sdk';
import { FirestoreLtiStore } from './store';
import { createLtiService, type LtiIdentity, type LtiService } from './service';

/**
 * Runtime wiring for the LMS connection. Off unless LTI_ENABLED=true.
 *
 *   LTI_ENABLED      true to turn it on
 *   LTI_HUB_URL      UniGame Hub base URL (the ticket issuer)
 *   LTI_GAME_ID      this app's id in the Hub catalog, e.g. smartwatch9
 *   LTI_GAME_SECRET  shared secret for signing results (from Secret Manager)
 *   LTI_TENANTS      optional comma list of allowed Hub tenants, e.g. aiedu2026
 */
export function ltiConfig() {
  return {
    enabled: process.env.LTI_ENABLED === 'true',
    hubUrl: (process.env.LTI_HUB_URL ?? '').replace(/\/+$/, ''),
    gameId: process.env.LTI_GAME_ID ?? '',
    secret: process.env.LTI_GAME_SECRET ?? '',
    tenants: (process.env.LTI_TENANTS ?? '')
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean),
  };
}

export function isLtiEnabled(): boolean {
  const cfg = ltiConfig();
  return cfg.enabled && Boolean(cfg.hubUrl && cfg.gameId);
}

function codeOf(error: unknown): string {
  const code = (error as { code?: unknown } | null)?.code;
  return typeof code === 'string' ? code : '';
}

const firebaseIdentity: LtiIdentity = {
  async findUidByEmail(email) {
    try {
      return (await getAdminAuth().getUserByEmail(email)).uid;
    } catch (error) {
      if (codeOf(error) === 'auth/user-not-found') return null;
      throw error;
    }
  },
  async userExists(uid) {
    try {
      await getAdminAuth().getUser(uid);
      return true;
    } catch (error) {
      if (codeOf(error) === 'auth/user-not-found') return false;
      throw error;
    }
  },
  async createUser({ email, displayName }) {
    try {
      return (await getAdminAuth().createUser({ email, displayName })).uid;
    } catch (error) {
      // Lost a race with another launch for the same person: adopt that account.
      if (codeOf(error) === 'auth/email-already-exists') {
        return (await getAdminAuth().getUserByEmail(email)).uid;
      }
      throw error;
    }
  },
  async createCustomToken(uid) {
    return getAdminAuth().createCustomToken(uid);
  },
};

let cached: LtiService | null = null;

export function getLtiService(): LtiService {
  if (cached) return cached;
  const cfg = ltiConfig();
  const store = new FirestoreLtiStore(getDb());
  const hub =
    cfg.secret && cfg.hubUrl && cfg.gameId
      ? {
          submitResult: (r: Parameters<typeof submitResult>[1]) =>
            submitResult({ hubUrl: cfg.hubUrl, gameId: cfg.gameId, secret: cfg.secret }, r),
          submitBulkResult: (b: Parameters<typeof submitBulkResult>[1]) =>
            submitBulkResult({ hubUrl: cfg.hubUrl, gameId: cfg.gameId, secret: cfg.secret }, b),
        }
      : null;
  cached = createLtiService({
    repos: getRepositories(),
    store,
    identity: firebaseIdentity,
    hub,
    tenants: cfg.tenants,
  });
  return cached;
}

/** Verifies a launch ticket against the Hub and marks it used. */
export async function verifyTicket(ticket: string): Promise<LaunchContext> {
  const cfg = ltiConfig();
  const store = new FirestoreLtiStore(getDb());
  return verifyLaunchTicket(ticket, {
    hubUrl: cfg.hubUrl,
    gameId: cfg.gameId,
    markUsed: (jti, expiresAt) => store.markTicketUsed(jti, expiresAt.getTime()),
  });
}

/**
 * Best-effort: sends a finished official game to the LMS. Never throws — a Hub
 * outage must not turn a finished game into an error for the student.
 */
export async function sendGradeQuietly(sessionId: string): Promise<void> {
  if (!isLtiEnabled()) return;
  try {
    const r = await getLtiService().sendGradeForSession(sessionId);
    if (r.sent) {
      console.log(JSON.stringify({ severity: 'INFO', message: 'lti grade sent', sessionId, status: r.status }));
    }
  } catch (error) {
    console.error(
      JSON.stringify({ severity: 'WARNING', message: 'lti grade send failed', sessionId, error: String(error) }),
    );
  }
}
