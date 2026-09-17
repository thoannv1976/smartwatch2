import { describe, expect, it } from 'vitest';
import {
  boardLetter,
  customerVoices,
  getGameConfig,
  pressHeadlines,
  type CompanyQuarterResult,
  type PressFacts,
  type QuarterDecision,
} from '@/domain/simulation';
import { vi as viDict } from '@/i18n/vi';
import { en as enDict } from '@/i18n/en';

/**
 * The narrative layer.
 *
 * Two things are worth asserting here and nothing else really is:
 *
 *  1. the generators pick the story the NUMBERS support, and lead with the bad
 *     news when there is bad news — a page that celebrates a share gain while
 *     the company is losing money teaches the wrong lesson;
 *  2. every key they can return exists in both dictionaries. The i18n parity
 *     test compares vi against en, but neither file knows which keys the domain
 *     will actually ask for, so a typo in a key would only surface as a blank
 *     card in front of a class.
 */

const config = getGameConfig();

const decision: QuarterDecision = {
  productPoints: 20,
  technologyPoints: 20,
  marketingPoints: 20,
  distributionPoints: 20,
  cxPoints: 20,
  priceIndex: 100,
};

function result(overrides: Partial<CompanyQuarterResult> = {}): CompanyQuarterResult {
  const intermediates = {
    priceAttractiveness: 0,
    productAttractiveness: 0,
    marketingStrength: 0,
    rawDemandScore: 0,
    adjustedDemandScore: 0,
    randomFactor: 1,
    potentialDemandShare: 0,
    potentialUnits: 100_000,
    fulfilmentCapacityFactor: 1,
    fulfilledPotentialUnits: 100_000,
    conversionModifier: 1,
    unitProductCost: 0,
    returnRate: 0.05,
    unfulfilledUnits: 0,
    ...(overrides.intermediates ?? {}),
  };
  return {
    companyId: 'player',
    companyKey: 'player',
    companyName: 'NovaTime',
    controllerType: 'PLAYER',
    quarter: 2,
    productQuality: 55,
    technology: 55,
    brandAwareness: 55,
    marketingStrength: 50,
    distribution: 50,
    customerExperience: 55,
    customerSatisfaction: 65,
    demandScore: 40,
    unitsSold: 80_000,
    actualPrice: 3_000_000,
    revenue: 240_000_000_000,
    cogs: 0,
    grossProfit: 0,
    returnCost: 0,
    netProfit: 10_000_000_000,
    cash: 50_000_000_000,
    marketShare: 0.18,
    netProfitMargin: 0.12,
    rank: 3,
    ...overrides,
    intermediates,
  };
}

function facts(overrides: Partial<PressFacts> = {}): PressFacts {
  return {
    companyName: 'NovaTime',
    quarter: 2,
    eventKey: 'NORMAL_MARKET',
    weights: config.defaultDemandWeights,
    decision,
    result: result(),
    previous: null,
    config,
    ...overrides,
  };
}

describe('headlines', () => {
  it('leads with the loss, not the share gain, when both are true', () => {
    // The ordering that matters most. A student who has just lost money must
    // not read a celebration at the top of the page.
    const headlines = pressHeadlines(
      facts({
        result: result({ netProfit: -5_000_000_000, marketShare: 0.25 }),
        previous: result({ quarter: 1, marketShare: 0.18 }),
      }),
    );
    expect(headlines[0]!.key).toBe('profitLoss');
    expect(headlines[0]!.tone).toBe('bad');
  });

  it('reports demand that distribution could not serve', () => {
    const headlines = pressHeadlines(
      facts({
        result: result({
          intermediates: { potentialUnits: 100_000, unfulfilledUnits: 20_000 } as never,
        }),
      }),
    );
    expect(headlines.map((h) => h.key)).toContain('stockout');
  });

  it('never returns more than two, and never returns none', () => {
    const busy = pressHeadlines(
      facts({
        result: result({
          netProfit: -1,
          customerSatisfaction: 40,
          rank: 4,
          marketShare: 0.05,
          intermediates: { potentialUnits: 100_000, unfulfilledUnits: 40_000 } as never,
        }),
        previous: result({ quarter: 1, rank: 1, marketShare: 0.3 }),
      }),
    );
    expect(busy.length).toBeLessThanOrEqual(2);

    // A quarter where nothing crosses a threshold still says something.
    const quiet = pressHeadlines(facts());
    expect(quiet.length).toBeGreaterThan(0);
  });

  it('marks taking and losing the lead', () => {
    expect(
      pressHeadlines(
        facts({ result: result({ rank: 1 }), previous: result({ quarter: 1, rank: 3 }) }),
      ).map((h) => h.key),
    ).toContain('tookTheLead');

    expect(
      pressHeadlines(
        facts({ result: result({ rank: 4 }), previous: result({ quarter: 1, rank: 1 }) }),
      ).map((h) => h.key),
    ).toContain('lostTheLead');
  });
});

describe('customer voices', () => {
  it('complains about a premium price the brand has not earned', () => {
    const voices = customerVoices(
      facts({
        decision: { ...decision, priceIndex: 115 },
        result: result({ brandAwareness: 35 }),
      }),
    );
    expect(voices.map((v) => v.key)).toContain('tooExpensive');
  });

  it('turns a high return rate into a complaint a person would make', () => {
    const voices = customerVoices(
      facts({ result: result({ intermediates: { returnRate: 0.2 } as never }) }),
    );
    expect(voices.map((v) => v.key)).toContain('qualityComplaint');
  });

  it('always says at least two things, and never more than three', () => {
    const bland = customerVoices(facts());
    expect(bland.length).toBeGreaterThanOrEqual(2);
    expect(bland.length).toBeLessThanOrEqual(3);
  });

  it('gives every voice a star rating in range', () => {
    const voices = customerVoices(
      facts({ result: result({ customerSatisfaction: 40, brandAwareness: 30 }) }),
    );
    for (const voice of voices) {
      expect(voice.stars).toBeGreaterThanOrEqual(1);
      expect(voice.stars).toBeLessThanOrEqual(5);
    }
  });
});

describe('the board letter', () => {
  it('treats negative cash as the most urgent thing on the table', () => {
    const letter = boardLetter(facts({ result: result({ cash: -1 }) }), []);
    expect(letter.key).toBe('cashCrisis');
    expect(letter.adviceKey).toBe('protectCash');
  });

  it('does not call one bad quarter a crisis when the tenure is profitable', () => {
    // The reason the letter reads history rather than only this quarter.
    const letter = boardLetter(facts({ result: result({ netProfit: -1_000_000_000 }) }), [
      result({ quarter: 1, netProfit: 40_000_000_000 }),
    ]);
    expect(letter.key).toBe('concerned');
    expect(letter.key).not.toBe('alarmed');
  });

  it('carries exactly one instruction, whatever the state of the company', () => {
    const cases: PressFacts[] = [
      facts(),
      facts({ result: result({ cash: -1 }) }),
      facts({ result: result({ customerSatisfaction: 40 }) }),
      facts({ result: result({ netProfitMargin: 0.01 }) }),
      facts({ result: result({ brandAwareness: 30 }) }),
      facts({ result: result({ rank: 6 }), previous: result({ quarter: 1, rank: 2 }) }),
    ];
    for (const input of cases) {
      const letter = boardLetter(input, []);
      expect(typeof letter.adviceKey).toBe('string');
      expect(letter.adviceKey.length).toBeGreaterThan(0);
    }
  });

  it('is never contemptuous: the advice is always about the company, never the person', () => {
    // A tone check written as a content check. Every advice string must name a
    // lever, and none may address the student's ability.
    for (const dict of [viDict, enDict]) {
      for (const text of Object.values(dict.boardAdvice)) {
        expect(text.length).toBeGreaterThan(20);
        expect(text.toLowerCase()).not.toMatch(/\b(stupid|lazy|hopeless|kém cỏi|lười|vô dụng)\b/);
      }
    }
  });
});

describe('every key the domain can emit exists in both dictionaries', () => {
  // The gap the i18n parity test cannot see: it compares vi against en, but
  // neither knows which keys press.ts will ask for. A typo here would render an
  // empty card in front of a class.
  const pressCases: PressFacts[] = [
    facts(),
    facts({ result: result({ netProfit: -1 }) }),
    facts({ result: result({ netProfitMargin: 0.01 }) }),
    facts({ result: result({ customerSatisfaction: 40 }) }),
    facts({ result: result({ customerSatisfaction: 80 }) }),
    facts({ result: result({ rank: 1 }), previous: result({ quarter: 1, rank: 3 }) }),
    facts({ result: result({ rank: 4 }), previous: result({ quarter: 1, rank: 1 }) }),
    facts({ result: result({ marketShare: 0.3 }), previous: result({ quarter: 1, marketShare: 0.1 }) }),
    facts({ result: result({ marketShare: 0.1 }), previous: result({ quarter: 1, marketShare: 0.3 }) }),
    facts({
      result: result({ intermediates: { potentialUnits: 100_000, unfulfilledUnits: 30_000 } as never }),
    }),
    facts({ decision: { ...decision, priceIndex: 118 }, result: result({ brandAwareness: 30 }) }),
    facts({ decision: { ...decision, priceIndex: 88 } }),
    facts({ result: result({ productQuality: 80, technology: 80, customerExperience: 80 }) }),
    facts({ result: result({ intermediates: { returnRate: 0.3 } as never }) }),
    facts({ result: result({ cash: -1 }) }),
    // Profit up on the previous quarter with nothing else moving, which is the
    // only shape that lets `profitRecord` survive the two-headline cut.
    facts({
      result: result({ netProfit: 20_000_000_000 }),
      previous: result({ quarter: 1, netProfit: 10_000_000_000 }),
    }),
  ];

  it('covers every headline, voice, board and advice key it produces', () => {
    for (const input of pressCases) {
      for (const headline of pressHeadlines(input)) {
        expect(viDict.press[headline.key], `vi press.${headline.key}`).toBeTruthy();
        expect(enDict.press[headline.key], `en press.${headline.key}`).toBeTruthy();
      }
      for (const voice of customerVoices(input)) {
        expect(viDict.voices[voice.key], `vi voices.${voice.key}`).toBeTruthy();
        expect(enDict.voices[voice.key], `en voices.${voice.key}`).toBeTruthy();
      }
      const letter = boardLetter(input, []);
      expect(viDict.board[letter.key], `vi board.${letter.key}`).toBeTruthy();
      expect(enDict.board[letter.key], `en board.${letter.key}`).toBeTruthy();
      expect(viDict.boardAdvice[letter.adviceKey], `vi boardAdvice.${letter.adviceKey}`).toBeTruthy();
      expect(enDict.boardAdvice[letter.adviceKey], `en boardAdvice.${letter.adviceKey}`).toBeTruthy();
    }
  });

  it('reaches every declared key at least once across those cases', () => {
    // The other direction: a dictionary entry nothing can produce is dead
    // weight that a translator still has to maintain.
    const seen = new Set<string>();
    for (const input of pressCases) {
      for (const h of pressHeadlines(input)) seen.add(`press.${h.key}`);
      for (const v of customerVoices(input)) seen.add(`voices.${v.key}`);
      const letter = boardLetter(input, []);
      seen.add(`board.${letter.key}`);
      seen.add(`boardAdvice.${letter.adviceKey}`);
    }

    const declared = [
      ...Object.keys(viDict.press).filter((k) => k !== 'title' && k !== 'hint').map((k) => `press.${k}`),
      ...Object.keys(viDict.voices).filter((k) => k !== 'title' && k !== 'hint').map((k) => `voices.${k}`),
    ];
    const unreachable = declared.filter((key) => !seen.has(key));
    expect(unreachable).toEqual([]);
  });
});
