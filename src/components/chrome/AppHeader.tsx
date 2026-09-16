import Link from 'next/link';
import type { Role } from '@/db/models';
import { getTranslations } from '@/i18n/server';
import { LocaleSwitcher } from './LocaleSwitcher';
import { SignOutButton } from './SignOutButton';
import { Badge } from '@/components/ui/primitives';

/** Application header: navigation is filtered by role, so a student never sees
 * a link they would be refused on. */
export async function AppHeader({
  role,
  displayName,
}: {
  role: Role;
  displayName: string;
}) {
  const { t } = await getTranslations();

  const links: { href: string; label: string }[] = [{ href: '/home', label: t.home.title }];
  if (role === 'INSTRUCTOR' || role === 'ADMIN') {
    links.push({ href: '/instructor', label: t.instructor.title });
    links.push({ href: '/sim-test', label: t.simTest.title });
  }
  if (role === 'ADMIN') {
    links.push({ href: '/admin', label: t.admin.title });
    links.push({ href: '/admin/users', label: t.admin.users });
  }

  return (
    <header className="border-b border-ink-800 bg-ink-950/70 backdrop-blur">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3 sm:px-6">
        <Link href="/home" className="text-sm font-bold tracking-tight text-ink-100">
          <span className="text-brand-500">◷</span> {t.common.appName}
        </Link>

        <nav className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="text-ink-300 transition hover:text-ink-100"
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-3">
          <span className="hidden text-xs text-ink-400 sm:inline">{displayName}</span>
          <Badge tone={role === 'STUDENT' ? 'neutral' : 'brand'}>{t.roles[role]}</Badge>
          <LocaleSwitcher />
          <SignOutButton label={t.common.signOut} />
        </div>
      </div>
    </header>
  );
}
