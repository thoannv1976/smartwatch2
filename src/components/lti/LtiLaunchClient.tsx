'use client';

import { useEffect, useRef, useState } from 'react';
import { Loader2, TriangleAlert, Watch } from 'lucide-react';
import { signInWithCustomToken, signOut } from 'firebase/auth';
import { getFirebaseAuth } from '@/lib/firebase-client';
import { useI18n } from '@/i18n/client';
import { safeNextPath } from '@/lib/safe-next-path';

type ErrorKey =
  | 'noTicket'
  | 'notConfigured'
  | 'ticketInvalid'
  | 'tenantNotAllowed'
  | 'noContext'
  | 'notLinked'
  | 'linkExpired'
  | 'forbidden'
  | 'assignmentNotFound'
  | 'generic';

/**
 * Landing page for a launch from the LMS (via UniGame Hub).
 *
 * The Hub opens /lti-launch#ticket=…; the ticket is in the fragment, so it never
 * reaches a server log. It is posted once, the returned custom token signs in
 * with Firebase, and the resulting ID token goes through the normal session
 * route — exactly like a password or Google sign-in.
 */
export function LtiLaunchClient() {
  const { t } = useI18n();
  const [error, setError] = useState<ErrorKey | null>(null);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    const match = /(?:^#|&)ticket=([^&]+)/.exec(window.location.hash);
    const ticket = match ? decodeURIComponent(match[1]!) : null;
    // Remove the ticket from the address bar and history straight away.
    window.history.replaceState(null, '', window.location.pathname);
    if (!ticket) {
      setError('noTicket');
      return;
    }

    (async () => {
      try {
        const launch = await fetch('/api/lti/launch', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ticket }),
        });
        const data = (await launch.json().catch(() => ({}))) as {
          customToken?: string;
          next?: string;
          error?: ErrorKey;
        };
        if (!launch.ok || !data.customToken) {
          setError(data.error && data.error in t.lti.errors ? data.error : 'generic');
          return;
        }

        const auth = getFirebaseAuth();
        const credential = await signInWithCustomToken(auth, data.customToken);
        const session = await fetch('/api/auth/session', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ idToken: await credential.user.getIdToken() }),
        });
        // The server session cookie is what the app uses; the browser-side
        // Firebase sign-in is not needed after this point.
        await signOut(auth).catch(() => undefined);
        if (!session.ok) {
          setError('generic');
          return;
        }
        window.location.replace(safeNextPath(data.next ?? '/home'));
      } catch {
        setError('generic');
      }
    })();
  }, [t]);

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-12">
      <div className="w-full max-w-md rounded-2xl border border-ink-700 bg-ink-850 p-8 text-center shadow-lg shadow-slate-200/70">
        <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-500 to-violet-500 text-white shadow-lg shadow-brand-500/30">
          <Watch className="h-6 w-6" aria-hidden />
        </span>
        {error ? (
          <>
            <h1 className="mt-4 flex items-center justify-center gap-2 text-lg font-extrabold text-ink-100">
              <TriangleAlert className="h-5 w-5 text-warn-500" aria-hidden />
              {t.lti.launchFailedTitle}
            </h1>
            <p className="mt-2 text-sm text-ink-300">{t.lti.errors[error]}</p>
            <div className="mt-6 flex justify-center gap-2">
              <button
                type="button"
                onClick={() => window.history.back()}
                className="rounded-lg border border-ink-700 bg-ink-850 px-4 py-2 text-sm font-semibold text-ink-100 shadow-sm transition hover:bg-ink-900"
              >
                {t.lti.backToLms}
              </button>
              <a
                href="/home"
                className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-semibold text-white shadow-sm shadow-brand-500/25 transition hover:bg-brand-400"
              >
                {t.lti.goHome}
              </a>
            </div>
          </>
        ) : (
          <>
            <h1 className="mt-4 text-lg font-extrabold text-ink-100">{t.lti.launchTitle}</h1>
            <p className="mt-2 flex items-center justify-center gap-2 text-sm text-ink-400">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              {t.lti.launchSigningIn}
            </p>
          </>
        )}
      </div>
    </main>
  );
}
