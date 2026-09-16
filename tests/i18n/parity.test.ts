import { describe, expect, it } from 'vitest';
import { LOCALES, getDictionary, interpolate, type Locale } from '@/i18n';

/**
 * Vietnamese and English must carry exactly the same keys and the same
 * placeholders.
 *
 * TypeScript already forces `en` to satisfy the shape of `vi`, but it cannot
 * see INSIDE the strings: a template that says `{units}` in one language and
 * `{unit}` in the other typechecks perfectly and then renders a raw `{unit}` to
 * a student. Nor does it stop a translator leaving an English sentence in the
 * Vietnamese file, which is what the whole dictionary exists to prevent.
 */

type Leaf = { path: string; value: string };

function leaves(value: unknown, path: string[] = [], out: Leaf[] = []): Leaf[] {
  if (typeof value === 'string') {
    out.push({ path: path.join('.'), value });
  } else if (value && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) leaves(child, [...path, key], out);
  }
  return out;
}

function placeholders(template: string): string[] {
  return [...template.matchAll(/\{(\w+)\}/g)].map((m) => m[1] ?? '').sort();
}

const byLocale = new Map<Locale, Leaf[]>(
  LOCALES.map((locale) => [locale, leaves(getDictionary(locale))]),
);

describe('dictionary parity', () => {
  it('has at least one key, so a broken import cannot pass silently', () => {
    for (const locale of LOCALES) {
      expect(byLocale.get(locale)?.length ?? 0).toBeGreaterThan(200);
    }
  });

  it('has exactly the same keys in every language', () => {
    const [first, ...rest] = LOCALES;
    const reference = (byLocale.get(first!) ?? []).map((l) => l.path).sort();

    for (const locale of rest) {
      const keys = (byLocale.get(locale) ?? []).map((l) => l.path).sort();
      expect({ locale, keys }).toEqual({ locale, keys: reference });
    }
  });

  it('uses the same placeholders for the same key in every language', () => {
    const [first, ...rest] = LOCALES;
    const reference = new Map(
      (byLocale.get(first!) ?? []).map((l) => [l.path, placeholders(l.value)]),
    );

    for (const locale of rest) {
      for (const leaf of byLocale.get(locale) ?? []) {
        expect({ locale, path: leaf.path, placeholders: placeholders(leaf.value) }).toEqual({
          locale,
          path: leaf.path,
          placeholders: reference.get(leaf.path),
        });
      }
    }
  });

  it('leaves no empty string anywhere', () => {
    for (const locale of LOCALES) {
      for (const leaf of byLocale.get(locale) ?? []) {
        expect({ locale, path: leaf.path, empty: leaf.value.trim() === '' }).toEqual({
          locale,
          path: leaf.path,
          empty: false,
        });
      }
    }
  });

  it('never leaves a placeholder unfilled when every value is supplied', () => {
    // Guards the interpolation contract itself: `interpolate` leaves an unknown
    // token in place, which is how `{unit}` would reach a student.
    for (const locale of LOCALES) {
      for (const leaf of byLocale.get(locale) ?? []) {
        const values = Object.fromEntries(placeholders(leaf.value).map((p) => [p, 'X']));
        expect({ locale, path: leaf.path, leftover: /\{\w+\}/.test(interpolate(leaf.value, values)) }).toEqual({
          locale,
          path: leaf.path,
          leftover: false,
        });
      }
    }
  });
});
