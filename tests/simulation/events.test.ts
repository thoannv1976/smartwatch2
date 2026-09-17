import { describe, expect, it } from 'vitest';
import {
  ARENA_SCENARIO_VERSION,
  CHALLENGER_SCENARIO_VERSION,
  PRACTICE_ONLY_SCENARIO_VERSIONS,
  PRACTICE_SCENARIO_VERSIONS,
  SCENARIO_VERSION,
  SELECTABLE_SCENARIO_VERSIONS,
  VARIED_SCENARIO_VERSION,
  buildMarketEvent,
  drawEventKeys,
  getGameConfig,
  getMarketEvent,
  type MarketEventKey,
} from '@/domain/simulation';
import { vi as viDict } from '@/i18n/vi';
import { en as enDict } from '@/i18n/en';

/**
 * Market events, fixed and drawn.
 *
 * The single most important assertion in this file is the FIRST one: the six
 * events of a graded scenario, in their order, must be exactly what they always
 * were. Two students' scores only mean the same thing if they faced the same
 * market, and every mark already awarded depends on that holding for ever.
 */

/** What `smartwatch-v1` has always played, quarter by quarter. */
const OFFICIAL_SIX: MarketEventKey[] = [
  'NORMAL_MARKET',
  'FITNESS_HEALTH_BOOM',
  'PRICE_COMPETITION',
  'ECONOMIC_SLOWDOWN',
  'AI_SMARTWATCH_FEATURES',
  'ONLINE_SHOPPING_PEAK',
];

describe('graded scenarios are frozen', () => {
  it('PLAYS THE SAME SIX EVENTS IN THE SAME ORDER, for every graded scenario', () => {
    for (const version of [SCENARIO_VERSION, CHALLENGER_SCENARIO_VERSION, ARENA_SCENARIO_VERSION]) {
      const config = getGameConfig(version);
      const played = Array.from({ length: config.quarters }, (_, i) =>
        getMarketEvent(i + 1, config).key,
      );
      expect(played, version).toEqual(OFFICIAL_SIX);
    }
  });

  it('ignores a seed entirely, so no caller can accidentally vary a graded market', () => {
    const config = getGameConfig(SCENARIO_VERSION);
    for (const seed of ['seed-a', 'seed-b', 'completely-different']) {
      const played = Array.from({ length: config.quarters }, (_, i) =>
        getMarketEvent(i + 1, config, seed).key,
      );
      expect(played).toEqual(OFFICIAL_SIX);
    }
  });

  it('produces identical event objects, not merely identical keys', () => {
    // A key that matched while the market size or the weights had moved would
    // still change every score in the class.
    const config = getGameConfig(SCENARIO_VERSION);
    for (let quarter = 1; quarter <= config.quarters; quarter += 1) {
      const event = getMarketEvent(quarter, config);
      expect(event).toEqual(buildMarketEvent(OFFICIAL_SIX[quarter - 1]!, quarter, config));
    }
  });
});

describe('the practice pool', () => {
  const config = getGameConfig(VARIED_SCENARIO_VERSION);

  it('refuses to resolve an event without a seed, rather than falling back', () => {
    // A silent fallback to the fixed six would let the decision screen render
    // one event while the engine simulated another — a wrong market that looks
    // entirely normal.
    expect(() => getMarketEvent(1, config)).toThrow(/seed/i);
  });

  it('is deterministic in the seed, so reloading a page cannot change the market', () => {
    const first = drawEventKeys('session-seed-1', 6);
    const second = drawEventKeys('session-seed-1', 6);
    expect(second).toEqual(first);
  });

  it('gives different seeds different markets', () => {
    const a = drawEventKeys('session-seed-1', 6);
    const b = drawEventKeys('session-seed-2', 6);
    expect(b).not.toEqual(a);
  });

  it('never repeats an event inside one run', () => {
    // Six distinct markets is the point of the mode; the same event three times
    // would be less varied than the fixed six, not more.
    for (const seed of ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']) {
      const drawn = drawEventKeys(`practice-${seed}`, 6);
      expect(drawn).toHaveLength(6);
      expect(new Set(drawn).size).toBe(6);
    }
  });

  it('reaches the pool-only events, not just the fixed six', () => {
    const seen = new Set<MarketEventKey>();
    for (let i = 0; i < 60; i += 1) {
      for (const key of drawEventKeys(`spread-${i}`, 6)) seen.add(key);
    }
    // If the draw were biased to the head of the pool, the later entries would
    // never appear and the mode would add nothing.
    expect(seen.has('QUALITY_EXPECTATIONS')).toBe(true);
    expect(seen.has('SERVICE_EXPECTATIONS')).toBe(true);
    expect(seen.has('BRAND_HYPE')).toBe(true);
    expect(seen.has('SUPPLY_SHORTAGE')).toBe(true);
    expect(seen.has('MARKET_EXPANSION')).toBe(true);
    expect(seen.has('MARKETING_FATIGUE')).toBe(true);
  });

  it('draws every pool entry across enough runs, so none is dead weight', () => {
    const seen = new Set<MarketEventKey>();
    for (let i = 0; i < 200; i += 1) {
      for (const key of drawEventKeys(`coverage-${i}`, 6)) seen.add(key);
    }
    expect(seen.size).toBe(12);
  });

  it('changes nothing but the weights, the market size and the multipliers', () => {
    // Every event is configuration. One that added a formula would make the
    // pool a second engine, and the practice mode would stop teaching the same
    // model the graded one does.
    const keys = drawEventKeys('shape-check', 6);
    for (const [index, key] of keys.entries()) {
      const event = buildMarketEvent(key, index + 1, config);
      expect(Object.keys(event).sort()).toEqual([
        'key',
        'marketUnits',
        'marketingStrengthMultiplier',
        'productContributionMultiplier',
        'quarter',
        'technologyContributionMultiplier',
        'weights',
      ]);
      expect(event.marketUnits).toBeGreaterThan(0);
      const total = Object.values(event.weights).reduce((sum, w) => sum + w, 0);
      expect(total).toBeCloseTo(1, 6);
    }
  });
});

describe('a drawn-event scenario can never be graded coursework', () => {
  it('is absent from the list an assignment is validated against', () => {
    // `SELECTABLE_SCENARIO_VERSIONS` is the zod enum in createAssignmentAction,
    // so this is the enforcement point, not a cosmetic filter. An instructor
    // cannot set it even by editing the request.
    for (const version of PRACTICE_ONLY_SCENARIO_VERSIONS) {
      expect(SELECTABLE_SCENARIO_VERSIONS).not.toContain(version);
    }
    expect(SELECTABLE_SCENARIO_VERSIONS).not.toContain(VARIED_SCENARIO_VERSION);
  });

  it('is offered for practice', () => {
    expect(PRACTICE_SCENARIO_VERSIONS).toContain(VARIED_SCENARIO_VERSION);
  });

  it('lists exactly the scenarios that actually draw their events', () => {
    // The two must not drift: a scenario that draws but is not listed could be
    // set as coursework, which is the failure this whole structure prevents.
    const drawing = Object.keys({
      [SCENARIO_VERSION]: 0,
      [CHALLENGER_SCENARIO_VERSION]: 0,
      [ARENA_SCENARIO_VERSION]: 0,
      [VARIED_SCENARIO_VERSION]: 0,
    }).filter((version) => getGameConfig(version).eventSelection === 'SEEDED_POOL');

    expect(drawing.sort()).toEqual([...PRACTICE_ONLY_SCENARIO_VERSIONS].sort());
  });

  it('shares every coefficient with the scenario it is built from', () => {
    // The mode varies the market, not the model. If a coefficient differed, a
    // practice run would be teaching a different simulation.
    const base = getGameConfig(SCENARIO_VERSION) as unknown as Record<string, unknown>;
    const varied = getGameConfig(VARIED_SCENARIO_VERSION) as unknown as Record<string, unknown>;

    for (const key of Object.keys(base)) {
      if (key === 'scenarioVersion') continue;
      expect(JSON.stringify(varied[key]), key).toBe(JSON.stringify(base[key]));
    }
    expect(varied.engineVersion).toBe(base.engineVersion);
  });
});

describe('both dictionaries name every event', () => {
  it('has a title and a description for each key the pool can draw', () => {
    const keys = new Set<MarketEventKey>(OFFICIAL_SIX);
    for (let i = 0; i < 200; i += 1) {
      for (const key of drawEventKeys(`names-${i}`, 6)) keys.add(key);
    }

    for (const key of keys) {
      expect(viDict.events[key], `vi events.${key}`).toBeTruthy();
      expect(enDict.events[key], `en events.${key}`).toBeTruthy();
      expect(viDict.eventDesc[key], `vi eventDesc.${key}`).toBeTruthy();
      expect(enDict.eventDesc[key], `en eventDesc.${key}`).toBeTruthy();
    }
  });
});
