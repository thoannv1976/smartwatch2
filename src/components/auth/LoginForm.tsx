'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  GoogleAuthProvider,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  updateProfile,
} from 'firebase/auth';
import { getFirebaseAuth, isFirebaseClientConfigured } from '@/lib/firebase-client';
import { useI18n } from '@/i18n/client';
import { safeNextPath } from '@/lib/safe-next-path';
import { classifyResetFailure } from '@/lib/password-reset';
import { Card, ErrorNote, WarningNote } from '@/components/ui/primitives';

/**
 * Sign-in with Google or email/password (spec 11.1, 12 Login screen).
 *
 * The browser never holds a role. It signs in with Firebase, posts the resulting
 * ID token to /api/auth/session, and the server decides who this user is.
 */
export function LoginForm() {
  const { t } = useI18n();
  const router = useRouter();
  const params = useSearchParams();
  const nextPath = safeNextPath(params.get('next'));
  const forbidden = params.get('error') === 'forbidden';

  const [mode, setMode] = useState<'signIn' | 'signUp' | 'reset'>('signIn');
  const [resetSent, setResetSent] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const configured = isFirebaseClientConfigured();

  const exchangeToken = async (idToken: string) => {
    const response = await fetch('/api/auth/session', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ idToken }),
    });
    if (!response.ok) throw new Error('session_exchange_failed');
    router.replace(nextPath);
    router.refresh();
  };

  const handleGoogle = async () => {
    setBusy(true);
    setError(null);
    try {
      const credential = await signInWithPopup(getFirebaseAuth(), new GoogleAuthProvider());
      await exchangeToken(await credential.user.getIdToken());
    } catch (err) {
      setError(translateError(err));
      setBusy(false);
    }
  };

  /**
   * Asks Firebase to email a reset link.
   *
   * The message shown is the SAME whether or not the address has an account.
   * Firebase says which it is; passing that on would turn the login page into a
   * way to discover who studies or teaches here. `classifyResetFailure` holds
   * that rule, and is tested.
   */
  const handleReset = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await sendPasswordResetEmail(getFirebaseAuth(), email.trim());
      setResetSent(true);
    } catch (err) {
      const outcome = classifyResetFailure(err);
      if (outcome === 'SENT') setResetSent(true);
      else if (outcome === 'INVALID_EMAIL') setError(t.auth.resetInvalidEmail);
      else setError(t.auth.resetFailed);
    } finally {
      setBusy(false);
    }
  };

  const handleEmail = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const auth = getFirebaseAuth();
      const credential =
        mode === 'signUp'
          ? await createUserWithEmailAndPassword(auth, email, password)
          : await signInWithEmailAndPassword(auth, email, password);

      if (mode === 'signUp' && displayName.trim()) {
        await updateProfile(credential.user, { displayName: displayName.trim() });
      }
      // Force-refresh so a display name set a moment ago is inside the token.
      await exchangeToken(await credential.user.getIdToken(true));
    } catch (err) {
      setError(translateError(err));
      setBusy(false);
    }
  };

  function translateError(err: unknown): string {
    const code = typeof err === 'object' && err && 'code' in err ? String(err.code) : '';
    if (code.includes('wrong-password') || code.includes('user-not-found') || code.includes('invalid-credential')) {
      return t.auth.invalidCredentials;
    }
    if (code.includes('weak-password')) return t.auth.weakPassword;
    if (code.includes('email-already-in-use')) return t.auth.emailInUse;
    return t.auth.genericError;
  }

  return (
    <Card className="w-full max-w-md">
      <h1 className="text-xl font-bold">{t.auth.loginTitle}</h1>
      <p className="mt-1 text-sm text-ink-300">{t.auth.loginSubtitle}</p>

      {forbidden ? (
        <div className="mt-4">
          <WarningNote>{t.auth.forbidden}</WarningNote>
        </div>
      ) : null}

      {!configured ? (
        <div className="mt-4">
          <WarningNote>
            Firebase is not configured. Set the NEXT_PUBLIC_FIREBASE_* variables (see .env.example).
          </WarningNote>
        </div>
      ) : null}

      {mode === 'reset' ? (
        <div className="mt-5 flex flex-col gap-3">
          <h2 className="text-sm font-semibold text-ink-100">{t.auth.resetTitle}</h2>
          <p className="text-xs text-ink-400">{t.auth.resetHint}</p>

          {resetSent ? (
            <>
              {/* Deliberately the same message whether or not the address has an
                  account — see handleReset. */}
              <p className="rounded-lg border border-good-500/40 bg-good-500/10 px-4 py-3 text-sm text-good-400">
                {t.auth.resetSent}
              </p>
              <p className="text-xs text-ink-500">{t.auth.googleHint}</p>
            </>
          ) : (
            <form onSubmit={handleReset} className="flex flex-col gap-3">
              <Field
                label={t.auth.email}
                value={email}
                onChange={setEmail}
                type="email"
                autoComplete="email"
                required
              />
              {error ? <ErrorNote>{error}</ErrorNote> : null}
              <button
                type="submit"
                disabled={busy || !configured || !email.trim()}
                className="rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-semibold text-ink-950 transition hover:bg-brand-400 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {busy ? t.auth.resetSending : t.auth.resetSend}
              </button>
            </form>
          )}

          <button
            type="button"
            onClick={() => {
              setMode('signIn');
              setResetSent(false);
              setError(null);
            }}
            className="w-full text-center text-xs text-ink-400 underline-offset-2 hover:text-ink-200 hover:underline"
          >
            {t.auth.backToSignIn}
          </button>
        </div>
      ) : (
        <>
          <button
            type="button"
            onClick={handleGoogle}
            disabled={busy || !configured}
            className="mt-5 flex w-full items-center justify-center gap-2 rounded-lg border border-ink-600 bg-ink-100 px-4 py-2.5 text-sm font-semibold text-ink-950 transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            <GoogleMark />
            {t.auth.googleSignIn}
          </button>

          <div className="my-5 flex items-center gap-3 text-xs text-ink-500">
            <span className="h-px flex-1 bg-ink-700" />
            <span>·</span>
            <span className="h-px flex-1 bg-ink-700" />
          </div>

          <form onSubmit={handleEmail} className="flex flex-col gap-3">
            {mode === 'signUp' ? (
              <Field
                label={t.auth.displayName}
                value={displayName}
                onChange={setDisplayName}
                type="text"
                autoComplete="name"
              />
            ) : null}
            <Field
              label={t.auth.email}
              value={email}
              onChange={setEmail}
              type="email"
              autoComplete="email"
              required
            />
            <Field
              label={t.auth.password}
              value={password}
              onChange={setPassword}
              type="password"
              autoComplete={mode === 'signUp' ? 'new-password' : 'current-password'}
              required
            />

            {error ? <ErrorNote>{error}</ErrorNote> : null}

            <button
              type="submit"
              disabled={busy || !configured}
              className="mt-1 rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-semibold text-ink-950 transition hover:bg-brand-400 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {mode === 'signUp' ? t.auth.signUp : t.auth.signIn}
            </button>
          </form>

          <div className="mt-4 flex flex-col gap-2">
            <button
              type="button"
              onClick={() => {
                setMode(mode === 'signIn' ? 'signUp' : 'signIn');
                setError(null);
              }}
              className="w-full text-center text-xs text-ink-400 underline-offset-2 hover:text-ink-200 hover:underline"
            >
              {mode === 'signIn' ? t.auth.switchToSignUp : t.auth.switchToSignIn}
            </button>
            <button
              type="button"
              onClick={() => {
                setMode('reset');
                setResetSent(false);
                setError(null);
              }}
              className="w-full text-center text-xs text-ink-400 underline-offset-2 hover:text-ink-200 hover:underline"
            >
              {t.auth.forgotPassword}
            </button>
          </div>
        </>
      )}

    </Card>
  );
}

function Field({
  label,
  value,
  onChange,
  type,
  autoComplete,
  required,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type: string;
  autoComplete?: string;
  required?: boolean;
}) {
  return (
    <label className="flex flex-col gap-1 text-xs text-ink-300">
      {label}
      <input
        type={type}
        value={value}
        required={required}
        autoComplete={autoComplete}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-md border border-ink-600 bg-ink-950 px-3 py-2 text-sm text-ink-100 focus:border-brand-500 focus:outline-none"
      />
    </label>
  );
}

function GoogleMark() {
  return (
    <svg width="16" height="16" viewBox="0 0 48 48" aria-hidden>
      <path
        fill="#4285F4"
        d="M45.1 24.5c0-1.6-.1-3.2-.4-4.7H24v9h11.8c-.5 2.8-2 5.1-4.4 6.7v5.5h7.1c4.1-3.8 6.6-9.4 6.6-16.5z"
      />
      <path
        fill="#34A853"
        d="M24 46c6 0 11-2 14.5-5.4l-7.1-5.5c-2 1.3-4.5 2.1-7.4 2.1-5.7 0-10.5-3.8-12.2-9H4.5v5.7C8 41.1 15.4 46 24 46z"
      />
      <path
        fill="#FBBC05"
        d="M11.8 28.2c-.4-1.3-.7-2.7-.7-4.2s.3-2.9.7-4.2v-5.7H4.5A22 22 0 0 0 2 24c0 3.6.9 6.9 2.5 9.9l7.3-5.7z"
      />
      <path
        fill="#EA4335"
        d="M24 10.8c3.2 0 6.1 1.1 8.4 3.3l6.3-6.3C35 4.2 30 2 24 2 15.4 2 8 6.9 4.5 14.1l7.3 5.7c1.7-5.2 6.5-9 12.2-9z"
      />
    </svg>
  );
}
