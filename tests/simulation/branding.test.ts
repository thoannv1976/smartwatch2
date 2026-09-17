import { describe, expect, it } from 'vitest';
import {
  ARENA_SCENARIO_VERSION,
  BRAND_DISPLAY_NAMES,
  CHALLENGER_SCENARIO_VERSION,
  SCENARIO_VERSION,
  USE_BRAND_NAMES,
  VARIED_SCENARIO_VERSION,
  gameConfigs,
  getGameConfig,
  withBrandNames,
} from '@/domain/simulation';
import { vi as viDict } from '@/i18n/vi';
import { en as enDict } from '@/i18n/en';
import { guideVi } from '@/i18n/guide.vi';
import { guideEn } from '@/i18n/guide.en';

/**
 * Competitor naming.
 *
 * This software is sold, and putting somebody else's trademark in a paid
 * product is a different proposition from using it in your own teaching
 * material. The shipped default is therefore descriptive, and an institution
 * that has decided it is comfortable doing so opts in.
 *
 * The property that matters most is the LAST one: turning the switch must not
 * move a single number. A naming choice that changed a score would make two
 * institutions' results incomparable, which is exactly what the scenario
 * versioning exists to prevent.
 */

/** The trademarks that must not appear in a default build. */
const TRADEMARKS = /Apple|Garmin|Samsung|Galaxy|Huawei|Pixel|Fitbit/;

const SOLO_SCENARIOS = [SCENARIO_VERSION, CHALLENGER_SCENARIO_VERSION, VARIED_SCENARIO_VERSION];

describe('the shipped default carries no trademark', () => {
  it('assumes the switch is off in the test environment', () => {
    // Everything below describes the default build. If a future setup file set
    // the variable, these assertions would be checking the wrong thing.
    expect(USE_BRAND_NAMES).toBe(false);
  });

  it('names no real brand in any scenario a student can play', () => {
    for (const version of Object.keys(gameConfigs)) {
      for (const competitor of getGameConfig(version).competitors) {
        expect(competitor.displayName, `${version}/${competitor.key}`).not.toMatch(TRADEMARKS);
      }
    }
  });

  it('names no real brand in either dictionary or the student guide', () => {
    const walk = (value: unknown): string[] => {
      if (typeof value === 'string') return [value];
      if (value && typeof value === 'object') return Object.values(value).flatMap(walk);
      return [];
    };

    for (const [label, dict] of [
      ['vi', viDict],
      ['en', enDict],
      ['guide.vi', guideVi],
      ['guide.en', guideEn],
    ] as const) {
      for (const text of walk(dict)) {
        expect(text, `${label}: ${text.slice(0, 60)}`).not.toMatch(TRADEMARKS);
      }
    }
  });
});

describe('the switch', () => {
  it('restores all five real names when applied', () => {
    const branded = withBrandNames(getGameConfig(SCENARIO_VERSION));
    for (const competitor of branded.competitors) {
      expect(competitor.displayName).toBe(BRAND_DISPLAY_NAMES[competitor.key]);
    }
    expect(branded.competitors).toHaveLength(5);
  });

  it('CHANGES NOTHING BUT THE LABEL', () => {
    // The assertion the whole design rests on. If a coefficient, a starting row
    // or a competitor key differed between the two namings, two institutions
    // would be playing different games under the same scenario version.
    for (const version of SOLO_SCENARIOS) {
      const plain = getGameConfig(version);
      const branded = withBrandNames(plain);

      const strip = (config: typeof plain) => ({
        ...config,
        competitors: config.competitors.map((c) => ({ ...c, displayName: '' })),
      });

      expect(JSON.stringify(strip(branded)), version).toBe(JSON.stringify(strip(plain)));
      expect(branded.scenarioVersion, version).toBe(plain.scenarioVersion);
      expect(branded.engineVersion, version).toBe(plain.engineVersion);
    }
  });

  it('keeps the competitor keys untouched, because they are stored data', () => {
    // `apple`, `garmin`… are written into every session, every quarter and
    // every exported CSV. Renaming them would break saved games and force a
    // scenario-version bump that makes graded results incomparable.
    const plain = getGameConfig(SCENARIO_VERSION).competitors.map((c) => c.key);
    const branded = withBrandNames(getGameConfig(SCENARIO_VERSION)).competitors.map((c) => c.key);
    expect(branded).toEqual(plain);
    expect(plain).toEqual(['apple', 'garmin', 'samsung', 'huawei', 'pixel']);
  });

  it('LEAVES GROUP MODE ALONE even when it is on', () => {
    // The five non-human arena seats are `Bot 2`…`Bot 6` precisely so an empty
    // chair beside a classmate is never mistaken for a real company. The brand
    // switch is not for that, and must not reach it.
    for (const competitor of getGameConfig(ARENA_SCENARIO_VERSION).competitors) {
      expect(competitor.displayName).toMatch(/^Bot \d+$/);
    }
  });
});
