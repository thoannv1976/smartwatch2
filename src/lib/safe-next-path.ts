/**
 * Keeps a post-sign-in `?next=` destination inside this app.
 *
 * The app only ever generates internal paths, but anyone can hand a student a
 * link carrying their own value. Without this check a genuine sign-in would end
 * on somebody else's page — and it would be convincing precisely because the
 * student did just log in successfully.
 *
 * Only a single-slash absolute path is accepted. `//evil.example` is
 * protocol-relative, and some browsers normalise a backslash to a slash, so
 * `/\evil.example` navigates off-site too; both are refused, along with
 * anything carrying a scheme or no leading slash at all.
 */
export const DEFAULT_NEXT_PATH = '/home';

export function safeNextPath(raw: string | null | undefined): string {
  if (!raw || !raw.startsWith('/')) return DEFAULT_NEXT_PATH;
  if (raw.startsWith('//') || raw.startsWith('/\\')) return DEFAULT_NEXT_PATH;
  return raw;
}
