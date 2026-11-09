import Link from 'next/link';
import { Menu, UserRound, Watch } from 'lucide-react';
import type { Role } from '@/db/models';
import { getTranslations } from '@/i18n/server';
import { LocaleSwitcher } from './LocaleSwitcher';
import { NavLinks, type NavIcon } from './NavLinks';
import { SignOutButton } from './SignOutButton';
import { Badge } from '@/components/ui/primitives';

/** Application header: navigation is filtered by role, so a student never sees
 * a link they would be refused on. It stays at the top while the page scrolls;
 * on small screens the links fold into a menu. */
export async function AppHeader({
  role,
  displayName,
}: {
  role: Role;
  displayName: string;
}) {
  const { t } = await getTranslations();

  // The guide is for everyone: an instructor demonstrating the exercise needs
  // to reach the same page their students read.
  const links: { href: string; label: string; icon: NavIcon }[] = [
    { href: '/home', label: t.home.title, icon: 'home' },
    { href: '/guide', label: t.guide.title, icon: 'guide' },
  ];
  if (role === 'INSTRUCTOR' || role === 'ADMIN') {
    links.push({ href: '/instructor', label: t.instructor.title, icon: 'instructor' });
    links.push({ href: '/sim-test', label: t.simTest.title, icon: 'simtest' });
  }
  if (role === 'ADMIN') {
    links.push({ href: '/admin', label: t.admin.title, icon: 'admin' });
    links.push({ href: '/admin/users', label: t.admin.users, icon: 'users' });
  }

  return (
    <header className="sticky top-0 z-40 border-b border-ink-700 bg-ink-850/90 shadow-sm shadow-slate-200/50 backdrop-blur-md">
      <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-2.5 sm:px-6">
        <Link href="/home" className="flex shrink-0 items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-brand-500 to-violet-500 text-white shadow-md shadow-brand-500/30">
            <Watch className="h-5 w-5" aria-hidden />
          </span>
          <span className="hidden text-sm leading-tight font-extrabold tracking-tight text-ink-100 sm:block">
            {t.common.appName}
          </span>
        </Link>

        {/* Students have two links, which fit with labels from a laptop width up.
            Instructors and admins have more, so below very wide screens their
            tabs show icons only (each keeps its name as a tooltip). */}
        <div className="ml-2 hidden lg:block">
          <NavLinks links={links} compact={links.length > 2} />
        </div>

        <div className="ml-auto flex items-center gap-2">
          <span className="hidden items-center gap-2 rounded-xl border border-ink-700 bg-ink-900 py-1 pr-1 pl-2.5 md:flex">
            <UserRound className="h-4 w-4 text-ink-400" aria-hidden />
            <span className="max-w-[10rem] truncate text-xs font-semibold text-ink-200">
              {displayName}
            </span>
            <Badge tone={role === 'STUDENT' ? 'good' : 'brand'}>{t.roles[role]}</Badge>
          </span>
          <LocaleSwitcher />
          <SignOutButton label={t.common.signOut} />

          {/* Small screens: the same links in a menu, without client-side JS. */}
          <details className="relative lg:hidden">
            <summary
              className="flex cursor-pointer list-none items-center rounded-lg border border-ink-700 bg-ink-850 p-1.5 text-ink-300 [&::-webkit-details-marker]:hidden"
              aria-label="Menu"
            >
              <Menu className="h-5 w-5" aria-hidden />
            </summary>
            <div className="absolute right-0 mt-2 w-60 rounded-xl border border-ink-700 bg-ink-850 p-2 shadow-lg">
              <div className="mb-2 flex items-center gap-2 border-b border-ink-700 px-2 pb-2 md:hidden">
                <span className="truncate text-xs font-semibold text-ink-200">{displayName}</span>
                <Badge tone={role === 'STUDENT' ? 'good' : 'brand'}>{t.roles[role]}</Badge>
              </div>
              <NavLinks links={links} vertical />
            </div>
          </details>
        </div>
      </div>
    </header>
  );
}
