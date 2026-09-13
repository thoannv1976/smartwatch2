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
 */

let cached: { app: App; db: Firestore; auth: Auth } | null = null;

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

function init() {
  if (cached) return cached;
  const app = createApp();
  const db = getFirestore(app);
  // Undefined fields would otherwise throw; treating them as absent keeps
  // optional document fields simple to write.
  db.settings({ ignoreUndefinedProperties: true });
  cached = { app, db, auth: getAuth(app) };
  return cached;
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
