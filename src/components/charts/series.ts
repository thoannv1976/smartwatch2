import type { CompanyKey } from '@/domain/simulation';

/**
 * Categorical series colours for the six companies.
 *
 * These are the documented categorical palette's dark steps, in the documented
 * slot order. That order is the colour-blindness safety mechanism, not a
 * cosmetic choice: validated against this app's chart surface (#111c33) it
 * passes the lightness band, chroma floor, adjacent CVD separation
 * (worst adjacent dE 8.4 protan), normal-vision floor (worst adjacent 19.3) and
 * the 3:1 contrast gate. Re-ordering it to give the player the amber accent was
 * tried and fails CVD separation, so the player instead gets mandatory
 * SECONDARY encoding everywhere: a thicker stroke, a filled marker, a bold
 * label and a "you" badge. Identity is therefore never colour-alone.
 */
export const SERIES_COLORS: Record<CompanyKey, string> = {
  player: '#3987e5', // slot 1 blue
  apple: '#d95926', // slot 2 orange
  garmin: '#199e70', // slot 3 aqua
  samsung: '#c98500', // slot 4 yellow
  huawei: '#d55181', // slot 5 magenta
  pixel: '#008300', // slot 6 green
};

/** Ordered list used for legends and tables, player first. */
export const COMPANY_ORDER: readonly CompanyKey[] = [
  'player',
  'apple',
  'garmin',
  'samsung',
  'huawei',
  'pixel',
] as const;

export function seriesColor(companyKey: string): string {
  return SERIES_COLORS[companyKey as CompanyKey] ?? '#6b82a8';
}

/** Status colours, reserved for state and never reused as a series colour. */
export const STATUS = {
  good: '#2fbf82',
  bad: '#f1607a',
  warn: '#f0913f',
  info: '#4aa8f0',
} as const;

/** Chart surface and ink, matching the app's design tokens. */
export const CHART_SURFACE = '#111c33';
export const CHART_GRID = '#1f3050';
export const CHART_INK_MUTED = '#6b82a8';
export const CHART_INK = '#c5d0e2';
