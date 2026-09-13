'use client';

import { useId, useMemo, useState } from 'react';
import { CHART_GRID, CHART_INK_MUTED } from './series';

/**
 * Multi-series line chart for a six-quarter trend.
 *
 * Hand-written SVG rather than a charting library: the whole app needs exactly
 * two chart forms over at most six points and six series, and this keeps the
 * bundle free of a dependency that breaks on every React major.
 *
 * Follows the house data-viz rules: 2px lines, >=8px markers, a recessive grid, a
 * single y axis (never two scales), a legend whenever there are two or more
 * series, direct labels when there are at most four, and a crosshair + tooltip
 * hover layer. The `emphasis` flag adds secondary encoding (a thicker stroke and
 * a filled marker) so a series is never identified by colour alone.
 */

export interface LineSeries {
  key: string;
  label: string;
  color: string;
  values: (number | null)[];
  /** Player company: drawn thicker with filled markers. */
  emphasis?: boolean;
}

interface Props {
  series: LineSeries[];
  /** X axis tick labels, one per index of `values`. */
  labels: string[];
  /** Formats a value for the tooltip and the y axis. */
  format: (value: number) => string;
  height?: number;
  /** Draw a zero baseline when the data crosses zero (profit charts). */
  showZeroLine?: boolean;
  ariaLabel?: string;
}

const PADDING = { top: 16, right: 68, bottom: 28, left: 56 };
const WIDTH = 720;

export function LineChart({
  series,
  labels,
  format,
  height = 240,
  showZeroLine = false,
  ariaLabel,
}: Props) {
  const clipId = useId();
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  const { min, max } = useMemo(() => {
    const all = series.flatMap((s) => s.values.filter((v): v is number => v !== null));
    if (all.length === 0) return { min: 0, max: 1 };
    let lo = Math.min(...all);
    let hi = Math.max(...all);
    if (showZeroLine || lo > 0) lo = Math.min(lo, 0);
    if (hi === lo) hi = lo + 1;
    const pad = (hi - lo) * 0.08;
    return { min: lo - pad, max: hi + pad };
  }, [series, showZeroLine]);

  const plotWidth = WIDTH - PADDING.left - PADDING.right;
  const plotHeight = height - PADDING.top - PADDING.bottom;

  const xFor = (index: number) =>
    PADDING.left + (labels.length <= 1 ? plotWidth / 2 : (index / (labels.length - 1)) * plotWidth);
  const yFor = (value: number) =>
    PADDING.top + plotHeight - ((value - min) / (max - min)) * plotHeight;

  // Four gridlines is enough context without competing with the data.
  const ticks = useMemo(() => {
    const count = 4;
    return Array.from({ length: count + 1 }, (_, i) => min + ((max - min) * i) / count);
  }, [min, max]);

  const showDirectLabels = series.length <= 4;

  return (
    <figure className="m-0">
      <div className="overflow-x-auto">
        <svg
          viewBox={`0 0 ${WIDTH} ${height}`}
          className="h-auto w-full min-w-[520px]"
          role="img"
          aria-label={ariaLabel}
          onMouseLeave={() => setHoverIndex(null)}
        >
          <defs>
            <clipPath id={clipId}>
              <rect
                x={PADDING.left}
                y={PADDING.top}
                width={plotWidth}
                height={plotHeight}
              />
            </clipPath>
          </defs>

          {/* Recessive grid and y axis labels */}
          {ticks.map((tick) => (
            <g key={tick}>
              <line
                x1={PADDING.left}
                x2={PADDING.left + plotWidth}
                y1={yFor(tick)}
                y2={yFor(tick)}
                stroke={CHART_GRID}
                strokeWidth={1}
              />
              <text
                x={PADDING.left - 8}
                y={yFor(tick) + 4}
                textAnchor="end"
                fontSize={10}
                fill={CHART_INK_MUTED}
              >
                {format(tick)}
              </text>
            </g>
          ))}

          {showZeroLine && min < 0 && max > 0 ? (
            <line
              x1={PADDING.left}
              x2={PADDING.left + plotWidth}
              y1={yFor(0)}
              y2={yFor(0)}
              stroke={CHART_INK_MUTED}
              strokeWidth={1}
              strokeDasharray="3 3"
            />
          ) : null}

          {/* X axis labels */}
          {labels.map((label, index) => (
            <text
              key={label}
              x={xFor(index)}
              y={height - 8}
              textAnchor="middle"
              fontSize={11}
              fill={CHART_INK_MUTED}
            >
              {label}
            </text>
          ))}

          {/* Crosshair */}
          {hoverIndex !== null ? (
            <line
              x1={xFor(hoverIndex)}
              x2={xFor(hoverIndex)}
              y1={PADDING.top}
              y2={PADDING.top + plotHeight}
              stroke={CHART_INK_MUTED}
              strokeWidth={1}
            />
          ) : null}

          {/* Series */}
          <g clipPath={`url(#${clipId})`}>
            {series.map((s) => {
              const points = s.values
                .map((value, index) => (value === null ? null : { x: xFor(index), y: yFor(value) }))
                .filter((p): p is { x: number; y: number } => p !== null);
              if (points.length === 0) return null;
              const path = points
                .map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(2)} ${p.y.toFixed(2)}`)
                .join(' ');
              return (
                <path
                  key={s.key}
                  d={path}
                  fill="none"
                  stroke={s.color}
                  strokeWidth={s.emphasis ? 3 : 2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              );
            })}
          </g>

          {/* Markers: a 2px surface ring keeps overlapping marks readable */}
          {series.map((s) =>
            s.values.map((value, index) =>
              value === null ? null : (
                <circle
                  key={`${s.key}-${index}`}
                  cx={xFor(index)}
                  cy={yFor(value)}
                  r={hoverIndex === index ? 5 : s.emphasis ? 4.5 : 3.5}
                  fill={s.emphasis || hoverIndex === index ? s.color : 'var(--color-ink-850)'}
                  stroke={s.color}
                  strokeWidth={2}
                />
              ),
            ),
          )}

          {/* Direct labels at the last point, for small series counts */}
          {showDirectLabels
            ? series.map((s) => {
                const lastIndex = s.values.reduce<number>(
                  (acc, value, index) => (value !== null ? index : acc),
                  -1,
                );
                const value = lastIndex >= 0 ? s.values[lastIndex] : null;
                if (value === null || value === undefined) return null;
                return (
                  <text
                    key={`label-${s.key}`}
                    x={xFor(lastIndex) + 9}
                    y={yFor(value) + 3.5}
                    fontSize={10}
                    fill="var(--color-ink-200)"
                    fontWeight={s.emphasis ? 700 : 400}
                  >
                    {s.label}
                  </text>
                );
              })
            : null}

          {/* Invisible hit areas, wider than the marks */}
          {labels.map((label, index) => (
            <rect
              key={`hit-${label}`}
              x={xFor(index) - plotWidth / Math.max(1, (labels.length - 1) * 2)}
              y={PADDING.top}
              width={plotWidth / Math.max(1, labels.length - 1)}
              height={plotHeight}
              fill="transparent"
              onMouseEnter={() => setHoverIndex(index)}
              onFocus={() => setHoverIndex(index)}
            />
          ))}
        </svg>
      </div>

      {/* Tooltip rendered in HTML below the plot: readable at any width and
          reachable by keyboard, unlike a floating SVG overlay. */}
      <div className="mt-2 min-h-[2.25rem]">
        {hoverIndex !== null ? (
          <div className="inline-flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg border border-ink-700 bg-ink-900 px-3 py-2 text-xs">
            <span className="font-semibold text-ink-200">{labels[hoverIndex]}</span>
            {series.map((s) => {
              const value = s.values[hoverIndex];
              if (value === null || value === undefined) return null;
              return (
                <span key={s.key} className="inline-flex items-center gap-1.5 text-ink-300">
                  <span
                    aria-hidden
                    className="inline-block h-2 w-2 rounded-full"
                    style={{ background: s.color }}
                  />
                  <span className={s.emphasis ? 'font-semibold text-ink-100' : ''}>{s.label}</span>
                  <span className="tnum text-ink-100">{format(value)}</span>
                </span>
              );
            })}
          </div>
        ) : null}
      </div>

      {series.length > 1 ? (
        <figcaption className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-300">
          {series.map((s) => (
            <span key={s.key} className="inline-flex items-center gap-1.5">
              <span
                aria-hidden
                className="inline-block h-0.5 w-4 rounded-full"
                style={{ background: s.color, height: s.emphasis ? 3 : 2 }}
              />
              <span className={s.emphasis ? 'font-semibold text-ink-100' : ''}>{s.label}</span>
            </span>
          ))}
        </figcaption>
      ) : null}
    </figure>
  );
}
