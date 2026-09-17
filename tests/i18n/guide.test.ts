import { describe, expect, it } from 'vitest';
import {
  GOLDEN_STRATEGY_MAX_QUARTERS,
  ALL_ACHIEVEMENTS,
  getGameConfig,
} from '@/domain/simulation';
import { LOCALES, getDictionary } from '@/i18n';
import { guideVi } from '@/i18n/guide.vi';

/**
 * The student guide.
 *
 * Two invariants that the existing i18n parity test cannot see, because it only
 * compares Vietnamese against English and has no idea what the numbers mean:
 *
 *  1. every question has an answer. A question whose answer key is missing
 *     renders as an empty block in front of a class;
 *  2. every number quoted in the prose matches the engine. The guide states
 *     coefficients as fact — "100 points", "profit is 30% of the score",
 *     "0.70 + 0.003 x Distribution" — and prose that has quietly drifted from
 *     `config.ts` is worse than no prose, because a student trusts it.
 *
 * The numbers are read FROM the config here rather than written out again, so
 * changing a coefficient and forgetting the guide turns this test red.
 */

const config = getGameConfig();

describe('every question has an answer', () => {
  for (const locale of LOCALES) {
    const guide = getDictionary(locale).guide;

    it(`${locale}: part 1 questions and answers have the same keys`, () => {
      expect(Object.keys(guide.part1.answers).sort()).toEqual(
        Object.keys(guide.part1.questions).sort(),
      );
    });

    it(`${locale}: part 2 questions and answers have the same keys`, () => {
      expect(Object.keys(guide.part2.answers).sort()).toEqual(
        Object.keys(guide.part2.questions).sort(),
      );
    });

    it(`${locale}: no answer is a stub`, () => {
      // An answer shorter than its question is a placeholder somebody meant to
      // come back to.
      for (const [key, question] of Object.entries(guide.part1.questions)) {
        const answer = guide.part1.answers[key as keyof typeof guide.part1.answers];
        expect(answer.length, `part1.${key}`).toBeGreaterThan(question.length);
      }
      for (const [key, question] of Object.entries(guide.part2.questions)) {
        const answer = guide.part2.answers[key as keyof typeof guide.part2.answers];
        expect(answer.length, `part2.${key}`).toBeGreaterThan(question.length);
      }
    });
  }

  it('teaches something in both parts', () => {
    expect(Object.keys(guideVi.part1.questions).length).toBeGreaterThanOrEqual(6);
    expect(Object.keys(guideVi.part2.questions).length).toBeGreaterThanOrEqual(5);
  });
});

describe('the numbers in the prose match the engine', () => {
  /** Every string in the guide, flattened, for both locales. */
  function guideText(locale: (typeof LOCALES)[number]): string {
    const walk = (value: unknown): string[] => {
      if (typeof value === 'string') return [value];
      if (value && typeof value === 'object') return Object.values(value).flatMap(walk);
      return [];
    };
    return walk(getDictionary(locale).guide).join(' ');
  }

  it('states the strategy point total the engine actually enforces', () => {
    for (const locale of LOCALES) {
      expect(guideText(locale), locale).toContain(String(config.strategyPoints));
    }
  });

  it('states the real price index range and reference price', () => {
    for (const locale of LOCALES) {
      const text = guideText(locale);
      expect(text, locale).toContain(`${config.priceIndexMin}–${config.priceIndexMax}`);
      expect(text, locale).toContain(String(config.referencePrice));
    }
  });

  it('states the real number of quarters', () => {
    expect(config.quarters).toBe(6);
    for (const locale of LOCALES) {
      expect(guideText(locale), locale).toContain(String(config.quarters));
    }
  });

  it('states the score weights as percentages of the real weights', () => {
    // profit 30%, share 25%, brand 15%, csat 15%, innovation 15%.
    const asPercent = (weight: number) => String(Math.round(weight * 100));
    for (const locale of LOCALES) {
      const text = guideText(locale);
      for (const [name, weight] of Object.entries(config.scoreWeights)) {
        expect(text, `${locale} ${name}`).toContain(`${asPercent(weight)}%`);
      }
    }
  });

  it('states the real default demand weights', () => {
    for (const locale of LOCALES) {
      const text = guideText(locale);
      for (const [factor, weight] of Object.entries(config.defaultDemandWeights)) {
        expect(text, `${locale} ${factor}`).toContain(`${Math.round(weight * 100)}%`);
      }
    }
  });

  it('states the real fulfilment coefficients, which is the whole distribution lesson', () => {
    for (const locale of LOCALES) {
      const text = guideText(locale);
      // Written with a comma in Vietnamese and a dot in English.
      const base = String(config.fulfilmentBase).replace('.', locale === 'vi' ? ',' : '.');
      const slope = String(config.fulfilmentSlope).replace('.', locale === 'vi' ? ',' : '.');
      expect(text, `${locale} base`).toContain(base);
      expect(text, `${locale} slope`).toContain(slope);
    }
  });

  it('states the real return-rate bounds', () => {
    for (const locale of LOCALES) {
      const text = guideText(locale);
      expect(text, `${locale} min`).toContain(`${Math.round(config.returnRateMin * 100)}%`);
      expect(text, `${locale} max`).toContain(`${Math.round(config.returnRateMax * 100)}%`);
    }
  });

  it('states the real Golden Strategy limit and achievement count', () => {
    for (const locale of LOCALES) {
      const text = guideText(locale);
      expect(text, `${locale} golden`).toContain(String(GOLDEN_STRATEGY_MAX_QUARTERS));
      expect(text, `${locale} badges`).toContain(String(ALL_ACHIEVEMENTS.length));
    }
  });

  it('states the real starting cash and base market size', () => {
    for (const locale of LOCALES) {
      const text = guideText(locale);
      // Thousands separators differ by language; compare the digit groups.
      const cash = config.playerStartingCash.toLocaleString(locale === 'vi' ? 'de-DE' : 'en-US');
      const units = config.marketUnitsBase.toLocaleString(locale === 'vi' ? 'de-DE' : 'en-US');
      expect(text, `${locale} cash`).toContain(cash);
      expect(text, `${locale} units`).toContain(units);
    }
  });

  it('quotes the arena starting row the group scenario really uses', () => {
    const arena = getGameConfig('smartwatch-v1-arena').playerStart;
    for (const locale of LOCALES) {
      const text = guideText(locale);
      for (const value of [
        arena.brandAwareness,
        arena.productQuality,
        arena.distribution,
      ]) {
        expect(text, `${locale} ${value}`).toContain(String(value));
      }
    }
  });
});
