'use client';

import { useState } from 'react';
import { CHART_GRID, CHART_INK_MUTED } from './series';

/**
 * Horizontal bar chart comparing one measure across the six companies.
 *
 * Horizontal because the category labels are long brand names; bars are anchored
 * to the baseline with 4px rounded data-ends, and each bar carries a direct value
 * label so the chart is readable without the hover layer.
 *
 * Each datum brings its value ALREADY FORMATTED rather than the chart taking a
 * formatter function, so a React Server Component can render this chart
 * directly — functions cannot cross the server/client boundary.
 */

export interface BarDatum {
  key: string;
  label: string;
  value: number;
  /** The value as it should be displayed, e.g. "64,94" or "$23.9M". */
  formattedValue: string;
  color: string;
  emphasis?: boolean;
}

export function BarChart({ data, caption }: { data: BarDatum[]; caption?: string }) {
  const [hovered, setHovered] = useState<string | null>(null);
  const max = Math.max(1, ...data.map((d) => Math.abs(d.value)));

  return (
    <figure className="m-0" aria-label={caption}>
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
                      // A 2px surface ring separates the bar from its track on hover.
                      boxShadow: isHovered ? '0 0 0 2px var(--color-ink-850)' : undefined,
                    }}
                  />
                </span>
                <span
                  className={`tnum w-24 shrink-0 text-right text-xs ${
                    d.emphasis ? 'font-semibold text-ink-100' : 'text-ink-200'
                  }`}
                >
                  {d.formattedValue}
                </span>
              </span>
            </li>
          );
        })}
      </ul>
      {caption ? (
        <figcaption className="mt-2 text-xs" style={{ color: CHART_INK_MUTED }}>
          {caption}
        </figcaption>
      ) : null}
    </figure>
  );
}
