'use client';

import { useRouter } from 'next/navigation';
import { signOut } from 'firebase/auth';
import { getFirebaseAuth, isFirebaseClientConfigured } from '@/lib/firebase-client';

/** Clears both the Firebase client session and the server session cookie. */
export function SignOutButton({ label }: { label: string }) {
  const router = useRouter();

  const handleSignOut = async () => {
    try {
      if (isFirebaseClientConfigured()) await signOut(getFirebaseAuth());
    } catch {
      // Even if the client sign-out fails, clearing the server cookie is what
      // actually ends the session.
    }
    await fetch('/api/auth/session', { method: 'DELETE' });
    router.replace('/login');
    router.refresh();
  };

  return (
    <button
      type="button"
      onClick={handleSignOut}
      className="rounded-md border border-ink-700 px-2.5 py-1 text-xs text-ink-300 transition hover:border-ink-600 hover:text-ink-100"
    >
      {label}
    </button>
  );
}
