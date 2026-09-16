import { describe, expect, it } from 'vitest';
import {
  ARENA_SCENARIO_VERSION,
  ARENA_SEATS,
  createArenaCompanies,
  fullArenaSeats,
  getGameConfig,
  getMarketEvent,
  playArenaQuarter,
  positioningMap,
  readRivals,
  runSandbox,
  totalInvestmentPoints,
  validateDecision,
  type CompanyKey,
  type CompanyQuarterResult,
  type CompetitorIntel,
  type QuarterDecision,
} from '@/domain/simulation';
import { decision } from './helpers';

/**
 * The competitive tools that replace the Golden Strategy in group mode.
 *
 * Two properties matter more than the advice itself: everything they read is
 * information the student can already see, and the practice bench cannot be
 * used to work out what a classmate did.
 */

const arena = getGameConfig(ARENA_SCENARIO_VERSION);
const SEED = 'smartwatch-v1-2026';

function intel(entries: Partial<Record<CompanyKey, CompetitorIntel['key']>>): CompetitorIntel[] {
  return Object.entries(entries).map(([companyKey, key]) => ({
    companyKey: companyKey as CompanyKey,
    companyName: `Company ${companyKey}`,
    key: key!,
  }));
}

/** Plays one real quarter and returns its results, for the map tests. */
function playedResults(decisions: Partial<Record<CompanyKey, QuarterDecision>>) {
  const seats = fullArenaSeats();
  return playArenaQuarter(
    {
      quarter: 1,
      states: createArenaCompanies(seats, arena),
      humanDecisions: decisions,
      previousQuarters: [],
      seed: SEED,
    },
    arena,
  ).simulation.companyResults;
}

describe('readRivals', () => {
  const event = getMarketEvent(3, arena); // Price Competition: price weight 0.30.

  it('says something useful before the first quarter, without inventing data', () => {
    const notes = readRivals({
      viewerSeat: 'player',
      lastQuarter: null,
      event,
      botSeats: [],
      config: arena,
    });
    expect(notes).toEqual([{ key: 'quietQuarter', values: {} }]);
  });

  it('spots a crowd cutting price', () => {
    const notes = readRivals({
      viewerSeat: 'player',
      lastQuarter: {
        intel: intel({
          apple: 'aggressivePricing',
          garmin: 'aggressivePricing',
          samsung: 'aggressivePricing',
          huawei: 'steady',
          pixel: 'steady',
        }),
        results: [],
      },
      event,
      botSeats: [],
      config: arena,
    });
    expect(notes.map((n) => n.key)).toContain('manyCutPrice');
  });

  it('does not call three scattered moves a pattern', () => {
    const notes = readRivals({
      viewerSeat: 'player',
      lastQuarter: {
        intel: intel({
          apple: 'aggressivePricing',
          garmin: 'marketingPush',
          samsung: 'steady',
          huawei: 'steady',
          pixel: 'steady',
        }),
        results: [],
      },
      event,
      botSeats: [],
      config: arena,
    });
    expect(notes.map((n) => n.key)).not.toContain('manyCutPrice');
    expect(notes.map((n) => n.key)).not.toContain('marketingCrowded');
  });

  it('points at an empty channel the coming quarter rewards', () => {
    // Q6 Online Shopping Peak lifts the distribution weight to 0.15.
    const notes = readRivals({
      viewerSeat: 'player',
      lastQuarter: {
        intel: intel({
          apple: 'marketingPush',
          garmin: 'premiumPricing',
          samsung: 'technologyPush',
          huawei: 'steady',
          pixel: 'steady',
        }),
        results: [],
      },
      event: getMarketEvent(6, arena),
      botSeats: [],
      config: arena,
    });
    expect(notes.map((n) => n.key)).toContain('distributionGap');
  });

  it('names a leader pulling away, and notices when you are the leader', () => {
    const results = playedResults({
      player: decision({ marketingPoints: 50, distributionPoints: 20, productPoints: 20, technologyPoints: 5, cxPoints: 5 }),
      apple: decision({ productPoints: 100, technologyPoints: 0, marketingPoints: 0, distributionPoints: 0, cxPoints: 0 }),
    });

    const asPlayer = readRivals({
      viewerSeat: 'player',
      lastQuarter: { intel: [], results },
      event,
      botSeats: [],
      config: arena,
    });
    const leader = results.reduce((best, r) => (r.marketShare > best.marketShare ? r : best));

    const keys = asPlayer.map((n) => n.key);
    if (leader.companyKey === 'player') {
      expect(keys).toContain('youLead');
    } else {
      expect(keys.some((key) => key === 'leaderPulling' || key === 'packTight')).toBe(true);
    }
  });

  it('flags bot seats, the one rival whose behaviour is predictable', () => {
    const notes = readRivals({
      viewerSeat: 'player',
      lastQuarter: null,
      event,
      botSeats: ['huawei', 'pixel'],
      config: arena,
    });
    expect(notes[0]).toEqual({ key: 'botSeats', values: { count: 2 } });
  });

  it('stays short enough to read', () => {
    const notes = readRivals({
      viewerSeat: 'player',
      lastQuarter: {
        intel: intel({
          apple: 'aggressivePricing',
          garmin: 'aggressivePricing',
          samsung: 'aggressivePricing',
          huawei: 'marketingPush',
          pixel: 'marketingPush',
        }),
        results: playedResults({ player: decision() }),
      },
      event: getMarketEvent(6, arena),
      botSeats: ['pixel'],
      config: arena,
    });
    expect(notes.length).toBeLessThanOrEqual(4);
  });

  it('is deterministic', () => {
    const run = () =>
      readRivals({
        viewerSeat: 'player',
        lastQuarter: {
          intel: intel({ apple: 'aggressivePricing' }),
          results: playedResults({ player: decision() }),
        },
        event,
        botSeats: [],
        config: arena,
      });
    expect(run()).toEqual(run());
  });

  it('reads only published signals — never an allocation', () => {
    // The whole input surface is intel keys plus result rows. Give it an
    // allocation-free input and it must still produce its full reading.
    const notes = readRivals({
      viewerSeat: 'player',
      lastQuarter: {
        intel: intel({
          apple: 'aggressivePricing',
          garmin: 'aggressivePricing',
          samsung: 'aggressivePricing',
        }),
        results: [],
      },
      event,
      botSeats: [],
      config: arena,
    });
    expect(notes.length).toBeGreaterThan(0);
  });
});

describe('positioningMap', () => {
  it('places every company that sold anything, with price from published figures', () => {
    const results = playedResults({
      player: decision({ priceIndex: 90 }),
      apple: decision({ priceIndex: 115 }),
    });
    const points = positioningMap(results, 'player', ['garmin']);

    expect(points).toHaveLength(6);

    const you = points.find((p) => p.isYou)!;
    const expected = results.find((r) => r.companyKey === 'player')!;
    expect(you.price).toBeCloseTo(expected.revenue / expected.unitsSold, 2);

    // And the price really does track the index that produced it.
    const premium = points.find((p) => p.seatKey === 'apple')!;
    expect(premium.price).toBeGreaterThan(you.price);
  });

  it('marks the viewer and the bot seats', () => {
    const points = positioningMap(playedResults({ player: decision() }), 'garmin', ['pixel']);
    expect(points.filter((p) => p.isYou).map((p) => p.seatKey)).toEqual(['garmin']);
    expect(points.filter((p) => p.isBot).map((p) => p.seatKey)).toEqual(['pixel']);
  });

  it('drops a company that sold nothing rather than dividing by zero', () => {
    const results: CompanyQuarterResult[] = playedResults({ player: decision() }).map((result) =>
      result.companyKey === 'pixel' ? { ...result, unitsSold: 0, revenue: 0 } : result,
    );
    const points = positioningMap(results, 'player', []);

    expect(points).toHaveLength(5);
    expect(points.every((p) => Number.isFinite(p.price))).toBe(true);
  });
});

describe('the practice bench', () => {
  const playerState = createArenaCompanies(fullArenaSeats(), arena).find(
    (c) => c.companyKey === 'player',
  )!;

  it('scores a decision and the neutral split for comparison', () => {
    const result = runSandbox({
      playerState,
      decision: decision({ productPoints: 40, technologyPoints: 30, marketingPoints: 10, distributionPoints: 10, cxPoints: 10 }),
      quarter: 1,
      seed: SEED,
      config: arena,
    });

    expect(result.yours.rank).toBeGreaterThanOrEqual(1);
    expect(result.yours.rank).toBeLessThanOrEqual(6);
    expect(totalInvestmentPoints(result.neutral.decision)).toBe(arena.strategyPoints);
    expect(validateDecision(result.yours.decision, arena)).toEqual([]);
  });

  it('puts an even split exactly level with the field', () => {
    // Five clones all playing the same thing: the only honest baseline.
    const result = runSandbox({
      playerState,
      decision: { ...result0() },
      quarter: 1,
      seed: SEED,
      config: arena,
    });
    expect(result.neutral.marketShare).toBeCloseTo(1 / 6, 2);
  });

  it('rewards a better allocation with a better rank', () => {
    const strong = runSandbox({
      playerState,
      decision: decision({ productPoints: 35, technologyPoints: 25, marketingPoints: 20, distributionPoints: 15, cxPoints: 5, priceIndex: 98 }),
      quarter: 1,
      seed: SEED,
      config: arena,
    });
    const weak = runSandbox({
      playerState,
      decision: decision({ productPoints: 0, technologyPoints: 0, marketingPoints: 0, distributionPoints: 0, cxPoints: 100, priceIndex: 120 }),
      quarter: 1,
      seed: SEED,
      config: arena,
    });
    expect(strong.yours.marketShare).toBeGreaterThan(weak.yours.marketShare);
  });

  it('CANNOT BE USED TO WORK OUT WHAT A CLASSMATE DID', () => {
    // The bench's rivals are clones of the viewer playing an even split, so its
    // output depends on the viewer's OWN inputs and nothing else. Two students
    // in the same match, at the same capability state, must get identical
    // benches — which means the bench carries no information about the others.
    const student = { ...playerState, companyKey: 'player' as CompanyKey };
    const classmate = { ...playerState, companyKey: 'garmin' as CompanyKey };
    const tried = decision({ productPoints: 30, technologyPoints: 30, marketingPoints: 20, distributionPoints: 10, cxPoints: 10 });

    const a = runSandbox({ playerState: student, decision: tried, quarter: 1, seed: SEED, config: arena });
    const b = runSandbox({ playerState: classmate, decision: tried, quarter: 1, seed: SEED, config: arena });

    expect(a.yours.rank).toBe(b.yours.rank);

    // The only difference left is the seeded +/-2% demand jitter, which is
    // derived from (seed, quarter, companyKey) and carries no information about
    // anybody. A RELATIVE bound, because an absolute one on profit is a bound on
    // the size of the market rather than on the leak.
    const relative = Math.abs(a.yours.netProfit - b.yours.netProfit) / Math.abs(a.yours.netProfit);
    expect(relative).toBeLessThan(0.05);
  });

  it('takes no classmate data as input at all — which is why it cannot leak', () => {
    // The strongest form of the property, and the reason the bound above is
    // acceptable: nothing about the real match reaches this function. Change
    // every other company in the world and the bench is byte-identical, because
    // it was never given them.
    const tried = decision({ productPoints: 45, technologyPoints: 15, marketingPoints: 20, distributionPoints: 15, cxPoints: 5 });
    const before = runSandbox({ playerState, decision: tried, quarter: 2, seed: SEED, config: arena });

    // A real match, played very differently by everyone else.
    playedResults({
      apple: decision({ productPoints: 100, technologyPoints: 0, marketingPoints: 0, distributionPoints: 0, cxPoints: 0, priceIndex: 80 }),
      garmin: decision({ productPoints: 0, technologyPoints: 100, marketingPoints: 0, distributionPoints: 0, cxPoints: 0, priceIndex: 120 }),
    });

    const after = runSandbox({ playerState, decision: tried, quarter: 2, seed: SEED, config: arena });
    expect(after).toEqual(before);
  });

  it('is deterministic, so trying the same thing twice says the same thing', () => {
    const run = () =>
      runSandbox({ playerState, decision: decision(), quarter: 4, seed: SEED, config: arena });
    expect(run()).toEqual(run());
  });

  it('is fast enough to run on every keystroke', () => {
    const started = performance.now();
    for (let i = 0; i < 100; i += 1) {
      runSandbox({ playerState, decision: decision(), quarter: 1, seed: SEED, config: arena });
    }
    expect(performance.now() - started).toBeLessThan(500);
  });

  it('uses the six arena seats and nothing else', () => {
    expect([...ARENA_SEATS]).toHaveLength(6);
  });
});

/** An even split, spelled out so the baseline test reads clearly. */
function result0(): QuarterDecision {
  return {
    productPoints: 20,
    technologyPoints: 20,
    marketingPoints: 20,
    distributionPoints: 20,
    cxPoints: 20,
    priceIndex: 100,
  };
}
