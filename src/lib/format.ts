import type { Locale } from '@/i18n';

/**
 * Number formatting shared by every screen and by the CSV export.
 *
 * All KPI numbers are formatted here so a value reads the same on the dashboard,
 * in the history table and in the instructor export.
 */

const localeTag: Record<Locale, string> = { vi: 'vi-VN', en: 'en-US' };

export function formatInteger(value: number, locale: Locale = 'vi'): string {
  return new Intl.NumberFormat(localeTag[locale], { maximumFractionDigits: 0 }).format(value);
}

export function formatDecimal(value: number, locale: Locale = 'vi', digits = 1): string {
  return new Intl.NumberFormat(localeTag[locale], {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);
}

/** Full currency amount, e.g. $14,285,700. Used where precision matters. */
export function formatMoney(value: number, locale: Locale = 'vi'): string {
  const sign = value < 0 ? '-' : '';
  return `${sign}$${formatInteger(Math.abs(Math.round(value)), locale)}`;
}

/**
 * Compact currency for KPI tiles, e.g. $14.29M. Millions are the natural unit:
 * the whole game plays out between roughly $1M and $200M.
 */
export function formatMoneyCompact(value: number, locale: Locale = 'vi'): string {
  const sign = value < 0 ? '-' : '';
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return `${sign}$${formatDecimal(abs / 1_000_000, locale, 2)}M`;
  if (abs >= 1_000) return `${sign}$${formatDecimal(abs / 1_000, locale, 1)}K`;
  return `${sign}$${formatInteger(abs, locale)}`;
}

/** A ratio in 0..1 rendered as a percentage, e.g. 0.1225 -> 12.3%. */
export function formatPercent(value: number, locale: Locale = 'vi', digits = 1): string {
  return `${formatDecimal(value * 100, locale, digits)}%`;
}

/** A percentage-point delta, e.g. +1.8 pp. */
export function formatPercentagePoints(value: number, locale: Locale = 'vi'): string {
  const sign = value > 0 ? '+' : '';
  return `${sign}${formatDecimal(value * 100, locale, 1)} pp`;
}

/** A 0..100 capability score. */
export function formatScore(value: number, locale: Locale = 'vi'): string {
  return formatDecimal(value, locale, 1);
}

/** Signed relative change between two values, e.g. +12.4%. Null when undefined. */
export function relativeChange(current: number, previous: number): number | null {
  if (previous === 0) return null;
  return (current - previous) / Math.abs(previous);
}

export function formatSignedPercent(value: number, locale: Locale = 'vi'): string {
  const sign = value > 0 ? '+' : '';
  return `${sign}${formatDecimal(value * 100, locale, 1)}%`;
}

export function formatSignedMoneyCompact(value: number, locale: Locale = 'vi'): string {
  const sign = value > 0 ? '+' : '';
  return `${sign}${formatMoneyCompact(value, locale)}`;
}

export function formatDate(value: Date | string | number, locale: Locale = 'vi'): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat(localeTag[locale], {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

export function formatDateOnly(value: Date | string | number, locale: Locale = 'vi'): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat(localeTag[locale], { dateStyle: 'medium' }).format(date);
}

/** Formats a Date for a `datetime-local` input, in the browser's local timezone. */
export function toDateTimeInputValue(value: Date | string | number): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours(),
  )}:${pad(date.getMinutes())}`;
}
