'use client';

import { useState } from 'react';
import { CHART_GRID, CHART_INK_MUTED } from './series';

/**
 * Horizontal bar chart for comparing one measure across the six companies.
 *
 * Horizontal because the category labels are long brand names; bars are anchored
 * to the baseline with 4px rounded data-ends, and each bar carries a direct value
 * label so the chart is readable without the hover layer.
 */

export interface BarDatum {
  key: string;
  label: string;
  value: number;
  color: string;
  emphasis?: boolean;
}

export function BarChart({
  data,
  format,
  ariaLabel,
}: {
  data: BarDatum[];
  format: (value: number) => string;
  ariaLabel?: string;
}) {
  const [hovered, setHovered] = useState<string | null>(null);
  const max = Math.max(1, ...data.map((d) => Math.abs(d.value)));

  return (
    <figure className="m-0" aria-label={ariaLabel}>
      <ul className="flex flex-col gap-2">
        {data.map((d) => {
          const widthPct = (Math.abs(d.value) / max) * 100;
          const isHovered = hovered === d.key;
          return (
            <li
              key={d.key}
              className="grid grid-cols-[minmax(6rem,11rem)_1fr] items-center gap-3"
              onMouseEnter={() => setHovered(d.key)}
              onMouseLeave={() => setHovered(null)}
            >
              <span
                className={`truncate text-xs ${
                  d.emphasis ? 'font-semibold text-ink-100' : 'text-ink-300'
                }`}
                title={d.label}
              >
                {d.label}
              </span>
              <span className="flex items-center gap-2">
                <span
                  className="relative h-4 flex-1 overflow-hidden rounded-sm"
                  style={{ background: CHART_GRID }}
                >
                  <span
                    className="absolute inset-y-0 left-0 rounded-r-[4px]"
                    style={{
                      width: `${widthPct}%`,
                      background: d.color,
                      // A 2px surface ring separates adjacent fills.
                      boxShadow: isHovered ? `0 0 0 2px var(--color-ink-850)` : undefined,
                    }}
                  />
                </span>
                <span
                  className={`tnum w-24 shrink-0 text-right text-xs ${
                    d.emphasis ? 'font-semibold text-ink-100' : 'text-ink-200'
                  }`}
                >
                  {format(d.value)}
                </span>
              </span>
            </li>
          );
        })}
      </ul>
      <figcaption className="mt-2 text-xs" style={{ color: CHART_INK_MUTED }}>
        {ariaLabel}
      </figcaption>
    </figure>
  );
}
