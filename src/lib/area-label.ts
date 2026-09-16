import type { Dictionary } from '@/i18n';

/**
 * Translates the `{area}` value carried by a coach rule.
 *
 * The rules in `advice.ts` return raw keys — sometimes an investment field
 * (`distributionPoints`), sometimes a demand channel (`distribution`) — because
 * they are pure and know nothing about language. `areaNames` holds both
 * spellings so either can be rendered without the rules having to care.
 */
export function areaLabel(t: Dictionary, area: unknown): string {
  const names = t.areaNames as Record<string, string | undefined>;
  return (typeof area === 'string' ? names[area] : undefined) ?? String(area ?? '');
}

/** Replaces a raw `area` key with its translated label before interpolation. */
export function withAreaLabel(
  t: Dictionary,
  values: Record<string, string | number>,
): Record<string, string | number> {
  return 'area' in values ? { ...values, area: areaLabel(t, values.area) } : values;
}
