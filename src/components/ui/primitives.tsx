import type { ReactNode } from 'react';
import { EmptyArt } from '@/components/illustrations/Illustrations';

/**
 * Shared presentational primitives: white cards on a light page, clear headings
 * and consistent KPI formatting, so every screen reads the same way.
 */

export function Card({
  children,
  className = '',
  as: Tag = 'section',
}: {
  children: ReactNode;
  className?: string;
  as?: 'section' | 'div' | 'article';
}) {
  return (
    <Tag
      className={`rounded-2xl border border-ink-700 bg-ink-850 p-5 shadow-sm shadow-slate-200/70 sm:p-6 ${className}`}
    >
      {children}
    </Tag>
  );
}

export function CardTitle({
  children,
  hint,
  right,
}: {
  children: ReactNode;
  hint?: ReactNode;
  right?: ReactNode;
}) {
  return (
    <div className="mb-4 flex items-start justify-between gap-4">
      <div>
        <h2 className="flex items-center gap-2 text-base font-bold text-ink-100">
          <span
            aria-hidden
            className="h-4 w-1 rounded-full bg-brand-500 shadow-sm shadow-brand-500/25"
          />
          {children}
        </h2>
        {hint ? <p className="mt-1 max-w-prose text-sm text-ink-400">{hint}</p> : null}
      </div>
      {right}
    </div>
  );
}

export function PageHeader({
  title,
  subtitle,
  right,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  right?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight text-ink-100 sm:text-3xl">{title}</h1>
        {subtitle ? <p className="mt-1 max-w-prose text-sm text-ink-400">{subtitle}</p> : null}
      </div>
      {right}
    </div>
  );
}

type BadgeTone = 'neutral' | 'brand' | 'good' | 'bad' | 'warn' | 'info';

const badgeTones: Record<BadgeTone, string> = {
  neutral: 'bg-ink-800 text-ink-300 border-ink-700',
  brand: 'bg-brand-50 text-brand-400 border-brand-100',
  good: 'bg-good-500/10 text-good-400 border-good-500/30',
  bad: 'bg-bad-500/10 text-bad-400 border-bad-500/30',
  warn: 'bg-warn-500/10 text-warn-500 border-warn-500/30',
  info: 'bg-info-500/10 text-info-400 border-info-500/30',
};

export function Badge({
  children,
  tone = 'neutral',
  className = '',
}: {
  children: ReactNode;
  tone?: BadgeTone;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-semibold ${badgeTones[tone]} ${className}`}
    >
      {children}
    </span>
  );
}

/**
 * A KPI tile. `delta` carries its own pre-formatted sign and unit so the caller
 * decides whether a change is expressed in %, pp or dollars.
 */
export type TileAccent = 'indigo' | 'emerald' | 'sky' | 'amber' | 'rose' | 'violet';

const tileAccents: Record<TileAccent, { box: string; icon: string }> = {
  indigo: { box: 'border-indigo-100 bg-indigo-50/70', icon: 'bg-indigo-100 text-indigo-600' },
  emerald: { box: 'border-emerald-100 bg-emerald-50/70', icon: 'bg-emerald-100 text-emerald-600' },
  sky: { box: 'border-sky-100 bg-sky-50/70', icon: 'bg-sky-100 text-sky-600' },
  amber: { box: 'border-amber-100 bg-amber-50/70', icon: 'bg-amber-100 text-amber-600' },
  rose: { box: 'border-rose-100 bg-rose-50/70', icon: 'bg-rose-100 text-rose-600' },
  violet: { box: 'border-violet-100 bg-violet-50/70', icon: 'bg-violet-100 text-violet-600' },
};

export function StatTile({
  label,
  value,
  delta,
  deltaTone = 'neutral',
  hint,
  emphasis = false,
  accent,
  icon,
}: {
  label: ReactNode;
  value: ReactNode;
  delta?: ReactNode;
  deltaTone?: 'neutral' | 'good' | 'bad';
  hint?: ReactNode;
  emphasis?: boolean;
  /** Pastel colour for the tile; overrides `emphasis`. */
  accent?: TileAccent;
  icon?: ReactNode;
}) {
  const deltaClass =
    deltaTone === 'good' ? 'text-good-400' : deltaTone === 'bad' ? 'text-bad-400' : 'text-ink-400';
  const box = accent
    ? tileAccents[accent].box
    : emphasis
      ? 'border-brand-100 bg-brand-50'
      : 'border-ink-700 bg-ink-850 shadow-sm shadow-slate-200/60';

  return (
    <div className={`rounded-xl border p-4 ${box}`}>
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs leading-snug font-semibold text-ink-400">{label}</p>
        {icon ? (
          <span
            className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${
              accent ? tileAccents[accent].icon : 'bg-ink-800 text-ink-400'
            }`}
          >
            {icon}
          </span>
        ) : null}
      </div>
      <p className="tnum mt-1.5 text-2xl font-extrabold text-ink-100">{value}</p>
      {delta !== undefined ? <p className={`tnum mt-1 text-xs ${deltaClass}`}>{delta}</p> : null}
      {hint ? <p className="mt-1 text-xs text-ink-500">{hint}</p> : null}
    </div>
  );
}

/** A 0-100 capability meter. The numeric value is always shown, never colour-alone. */
export function CapabilityBar({
  label,
  value,
  previous,
  color = 'var(--color-brand-500)',
}: {
  label: ReactNode;
  value: number;
  previous?: number;
  color?: string;
}) {
  const pct = Math.max(0, Math.min(100, value));
  const delta = previous === undefined ? null : value - previous;

  return (
    <div>
      <div className="flex items-baseline justify-between gap-2 text-xs">
        <span className="text-ink-300">{label}</span>
        <span className="tnum text-ink-200">
          {value.toFixed(1)}
          {delta !== null && Math.abs(delta) >= 0.05 ? (
            <span className={delta > 0 ? 'ml-1 text-good-400' : 'ml-1 text-bad-400'}>
              {delta > 0 ? '+' : ''}
              {delta.toFixed(1)}
            </span>
          ) : null}
        </span>
      </div>
      <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-ink-800">
        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: color }} />
      </div>
    </div>
  );
}

export function EmptyState({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-xl border border-dashed border-ink-600 bg-ink-900 p-6 text-center text-sm text-ink-400">
      <EmptyArt className="mx-auto mb-2 block h-auto w-28" />
      {children}
    </p>
  );
}

export function ErrorNote({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-lg border border-bad-500/40 bg-bad-500/10 px-4 py-3 text-sm text-bad-400">
      {children}
    </p>
  );
}

export function WarningNote({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-lg border border-warn-500/40 bg-warn-500/10 px-4 py-3 text-sm text-warn-500">
      {children}
    </p>
  );
}

export function InfoNote({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-lg border border-info-500/30 bg-info-500/10 px-4 py-3 text-sm text-info-400">
      {children}
    </p>
  );
}

/** Horizontally scrollable wrapper: tables may be wider than the page, the page may not. */
export function TableScroll({ children }: { children: ReactNode }) {
  return <div className="-mx-2 overflow-x-auto px-2">{children}</div>;
}

export function Th({
  children,
  align = 'left',
  className = '',
}: {
  children?: ReactNode;
  align?: 'left' | 'right' | 'center';
  className?: string;
}) {
  const alignClass =
    align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : 'text-left';
  return (
    <th
      className={`border-b border-ink-700 bg-ink-800 px-3 py-2.5 text-xs font-bold tracking-wide whitespace-nowrap text-ink-400 uppercase first:rounded-tl-lg last:rounded-tr-lg ${alignClass} ${className}`}
    >
      {children}
    </th>
  );
}

export function Td({
  children,
  align = 'left',
  className = '',
  numeric = false,
}: {
  children?: ReactNode;
  align?: 'left' | 'right' | 'center';
  className?: string;
  numeric?: boolean;
}) {
  const alignClass =
    align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : 'text-left';
  return (
    <td
      className={`border-b border-ink-700 px-3 py-2.5 text-sm whitespace-nowrap ${alignClass} ${
        numeric ? 'tnum' : ''
      } ${className}`}
    >
      {children}
    </td>
  );
}
