import type { ReactNode } from 'react';

/**
 * Shared presentational primitives. Deliberately plain: the game's value is in
 * the simulation and the explanations, so the UI aims for legibility and
 * consistent KPI formatting rather than decoration.
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
      className={`rounded-xl border border-ink-700/70 bg-ink-850/80 p-5 shadow-lg shadow-ink-950/30 ${className}`}
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
        <h2 className="text-sm font-semibold tracking-wide text-ink-200 uppercase">{children}</h2>
        {hint ? <p className="mt-1 max-w-prose text-xs text-ink-400">{hint}</p> : null}
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
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{title}</h1>
        {subtitle ? <p className="mt-1 max-w-prose text-sm text-ink-300">{subtitle}</p> : null}
      </div>
      {right}
    </div>
  );
}

type BadgeTone = 'neutral' | 'brand' | 'good' | 'bad' | 'warn' | 'info';

const badgeTones: Record<BadgeTone, string> = {
  neutral: 'bg-ink-700/60 text-ink-200 border-ink-600',
  brand: 'bg-brand-500/15 text-brand-400 border-brand-600/50',
  good: 'bg-good-500/15 text-good-400 border-good-500/40',
  bad: 'bg-bad-500/15 text-bad-400 border-bad-500/40',
  warn: 'bg-warn-500/15 text-warn-500 border-warn-500/40',
  info: 'bg-info-500/15 text-info-400 border-info-500/40',
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
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium ${badgeTones[tone]} ${className}`}
    >
      {children}
    </span>
  );
}

/**
 * A KPI tile. `delta` carries its own pre-formatted sign and unit so the caller
 * decides whether a change is expressed in %, pp or dollars.
 */
export function StatTile({
  label,
  value,
  delta,
  deltaTone = 'neutral',
  hint,
  emphasis = false,
}: {
  label: ReactNode;
  value: ReactNode;
  delta?: ReactNode;
  deltaTone?: 'neutral' | 'good' | 'bad';
  hint?: ReactNode;
  emphasis?: boolean;
}) {
  const deltaClass =
    deltaTone === 'good' ? 'text-good-400' : deltaTone === 'bad' ? 'text-bad-400' : 'text-ink-400';

  return (
    <div
      className={`rounded-lg border p-4 ${
        emphasis ? 'border-brand-600/50 bg-brand-500/5' : 'border-ink-700/60 bg-ink-900/50'
      }`}
    >
      <p className="text-xs leading-snug text-ink-400">{label}</p>
      <p className="tnum mt-1.5 text-xl font-semibold text-ink-100">{value}</p>
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
      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-ink-700">
        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: color }} />
      </div>
    </div>
  );
}

export function EmptyState({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-lg border border-dashed border-ink-700 bg-ink-900/40 p-6 text-center text-sm text-ink-400">
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
      className={`border-b border-ink-700 px-3 py-2 text-xs font-semibold whitespace-nowrap text-ink-300 ${alignClass} ${className}`}
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
      className={`border-b border-ink-800 px-3 py-2 text-sm whitespace-nowrap ${alignClass} ${
        numeric ? 'tnum' : ''
      } ${className}`}
    >
      {children}
    </td>
  );
}

