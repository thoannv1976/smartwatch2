'use client';

import { useRouter } from 'next/navigation';
import { LogOut } from 'lucide-react';
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
      className="flex items-center gap-1.5 rounded-lg border border-ink-700 bg-ink-850 px-2.5 py-1.5 text-xs font-semibold text-ink-400 transition hover:border-bad-500/40 hover:text-bad-400"
      title={label}
    >
      <LogOut className="h-3.5 w-3.5" aria-hidden />
      <span className="hidden sm:inline">{label}</span>
    </button>
  );
}
