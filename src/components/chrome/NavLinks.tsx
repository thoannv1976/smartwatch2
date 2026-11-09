'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  BookOpen,
  FlaskConical,
  GraduationCap,
  LayoutDashboard,
  ShieldCheck,
  Users,
  type LucideIcon,
} from 'lucide-react';

export type NavIcon = 'home' | 'guide' | 'instructor' | 'simtest' | 'admin' | 'users';

const ICONS: Record<NavIcon, LucideIcon> = {
  home: LayoutDashboard,
  guide: BookOpen,
  instructor: GraduationCap,
  simtest: FlaskConical,
  admin: ShieldCheck,
  users: Users,
};

/** Tab-style navigation; the current section is highlighted. */
export function NavLinks({
  links,
  vertical = false,
  compact = false,
}: {
  links: { href: string; label: string; icon: NavIcon }[];
  vertical?: boolean;
  /** Icons only below 2xl screens; the label stays available as a tooltip. */
  compact?: boolean;
}) {
  const pathname = usePathname() ?? '';
  // The longest matching prefix wins, so /admin/users does not also light up /admin.
  const active = links
    .filter((l) => pathname === l.href || pathname.startsWith(`${l.href}/`))
    .sort((a, b) => b.href.length - a.href.length)[0]?.href;

  return (
    <nav
      className={
        vertical
          ? 'flex flex-col gap-1'
          : 'flex items-center gap-1 rounded-xl border border-ink-700 bg-ink-900 p-1'
      }
    >
      {links.map((link) => {
        const Icon = ICONS[link.icon];
        const isActive = link.href === active;
        return (
          <Link
            key={link.href}
            href={link.href}
            aria-current={isActive ? 'page' : undefined}
            title={link.label}
            // The header survives client-side navigation, so close the phone menu ourselves.
            onClick={(e) => e.currentTarget.closest('details')?.removeAttribute('open')}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold whitespace-nowrap transition ${
              isActive
                ? 'bg-ink-850 text-brand-400 shadow-sm'
                : 'text-ink-400 hover:bg-ink-850/70 hover:text-ink-100'
            }`}
          >
            <Icon className="h-4 w-4 shrink-0" aria-hidden />
            {/* In compact mode the current section still shows its name. */}
            <span className={compact && !isActive ? 'sr-only 2xl:not-sr-only' : undefined}>
              {link.label}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
