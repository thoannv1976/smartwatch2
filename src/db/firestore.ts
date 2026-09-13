import 'server-only';
import { cert, getApps, initializeApp, applicationDefault, type App } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { getAuth, type Auth } from 'firebase-admin/auth';

/**
 * Firebase Admin singleton.
 *
 * On Cloud Run the service account attached to the revision is picked up through
 * Application Default Credentials, so no key file is ever committed or mounted.
 * Locally, either point GOOGLE_APPLICATION_CREDENTIALS at a downloaded key or
 * set FIRESTORE_EMULATOR_HOST and run the emulator.
 *
 * The instance is cached on `globalThis`, not in a module-level variable.
 * Next.js evaluates server modules more than once (the RSC bundle and the
 * server-action bundle are separate instances), and `getFirestore()` returns the
 * same underlying object each time, so a per-module cache would call
 * `db.settings()` twice — which throws "Firestore has already been
 * initialized" and, because it surfaces during session verification, logs the
 * user out.
 */

const CACHE_KEY = Symbol.for('smartwatch.firebaseAdmin');

interface AdminCache {
  app: App;
  db: Firestore;
  auth: Auth;
}

type GlobalWithCache = typeof globalThis & { [CACHE_KEY]?: AdminCache };

function resolveProjectId(): string | undefined {
  return (
    process.env.GOOGLE_CLOUD_PROJECT ??
    process.env.GCLOUD_PROJECT ??
    process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID
  );
}

function createApp(): App {
  const existing = getApps()[0];
  if (existing) return existing;

  const projectId = resolveProjectId();

  // The emulator accepts any credential; a real deployment uses ADC.
  if (process.env.FIRESTORE_EMULATOR_HOST || process.env.FIREBASE_AUTH_EMULATOR_HOST) {
    return initializeApp({ projectId: projectId ?? 'demo-smartwatch' });
  }

  const inlineKey = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (inlineKey) {
    // Escape hatch for environments that can only pass secrets as env vars.
    return initializeApp({ credential: cert(JSON.parse(inlineKey) as object), projectId });
  }

  return initializeApp({ credential: applicationDefault(), projectId });
}

function init(): AdminCache {
  const globalCache = globalThis as GlobalWithCache;
  const cached = globalCache[CACHE_KEY];
  if (cached) return cached;

  const app = createApp();
  const db = getFirestore(app);
  // Undefined fields would otherwise throw; treating them as absent keeps
  // optional document fields simple to write. Only ever called once per process.
  db.settings({ ignoreUndefinedProperties: true });

  const value: AdminCache = { app, db, auth: getAuth(app) };
  globalCache[CACHE_KEY] = value;
  return value;
}

export function getDb(): Firestore {
  return init().db;
}

export function getAdminAuth(): Auth {
  return init().auth;
}

/** True when the server has enough configuration to reach Firestore at all. */
export function isFirebaseConfigured(): boolean {
  return Boolean(
    resolveProjectId() ??
      process.env.FIRESTORE_EMULATOR_HOST ??
      process.env.FIREBASE_SERVICE_ACCOUNT_JSON,
  );
}
