import 'server-only';
import {
  ARENA_SEATS,
  buildArenaIntel,
  computeGameFinalScores,
  getGameConfig,
  groupResultsByCompany,
  awardAchievements,
  boardLetter,
  customerVoices,
  forecastAccuracy,
  pressHeadlines,
  reviewQuarter,
  scoreForecast,
  tenureReview,
  type CompanyFinalScore,
  type CompanyKey,
  type CompanyQuarterResult,
  type CompetitorIntel,
  type Achievement,
  type BoardLetter,
  type CustomerVoice,
  type ForecastAccuracy,
  type ForecastScore,
  type QuarterDecision,
  type PressHeadline,
  type QuarterForecast,
  type ReviewNote,
  type TenureReview,
} from '@/domain/simulation';
import { quarterForecast } from '@/db/models';
import type { GroupDoc, GroupGameDoc, GroupMemberDoc, QuarterDoc } from '@/db/models';
import type { Repositories } from '@/db/repositories/types';

/**
 * View models for the group screens.
 *
 * THIS FILE IS THE CONFIDENTIALITY BOUNDARY. A stored group quarter holds all
 * six decisions, because the engine needs them and an instructor may audit
 * them. A student may see only their own, plus the qualitative intelligence
 * line about each rival (spec 7.3).
 *
 * In solo play that rival is an invented brand; here it is a classmate sitting
 * in the same room, being marked against them. So rather than handing a page
 * the `QuarterDoc` and trusting it to render carefully, every group screen is
 * given a NARROW view model built here, which simply does not contain the other
 * five allocations. A page cannot leak what it was never given, and the
 * property is testable on this function instead of on rendered HTML.
 */

/** One rival, as a student is allowed to see them. */
export interface RivalView {
  seatKey: CompanyKey;
  companyName: string;
  /** True when a bot is driving this company, so the screen can say so. */
  isBot: boolean;
  marketShare: number;
  unitsSold: number;
  revenue: number;
  netProfit: number;
  customerSatisfaction: number;
  rank: number;
}

/** One played quarter, as a student is allowed to see it. */
export interface QuarterView {
  quarter: number;
  eventKey: QuarterDoc['eventKey'];
  marketUnits: number;
  weights: QuarterDoc['weights'];
  /** The viewer's own decision. Never anybody else's. */
  yourDecision: QuarterDecision;
  yourResult: CompanyQuarterResult;
  previousResult: CompanyQuarterResult | null;
  /** All six results — public numbers, the same ones the ranking table shows. */
  results: CompanyQuarterResult[];
  rivals: RivalView[];
  intel: CompetitorIntel[];
  reviewNotes: ReviewNote[];
  /** True when this quarter was forced through with a decision made for you. */
  yourDecisionWasDefault: boolean;
  /**
   * The viewer's OWN prediction judged against their own result. Null when they
   * made none. A classmate's prediction — and the sentence of reasoning that
   * goes with it — never appears in this view, which is why the forecast is
   * passed in already narrowed to one seat rather than as the full submission
   * list: a caller cannot leak a field it was never handed.
   */
  yourForecast: ForecastScore | null;
  /**
   * The quarter told as reporting, reviews and a letter from the board.
   *
   * Generated HERE rather than on the page, for the same reason the decisions
   * are stripped here: this file is the boundary, and press about the viewer's
   * own company is the only press a student may read. Building it on the page
   * would mean handing the page the raw quarter documents it must never see.
   */
  headlines: PressHeadline[];
  voices: CustomerVoice[];
  board: BoardLetter;
}

export interface GroupReportView {
  group: GroupDoc;
  member: GroupMemberDoc;
  /** Final scores of all six companies, ranked. */
  scores: CompanyFinalScore[];
  yourScore: CompanyFinalScore;
  tenure: TenureReview;
  /** Every quarter's results, for the six-company charts. */
  resultsByQuarter: { quarter: number; results: CompanyQuarterResult[] }[];
  /** Quarters where a decision was made on the viewer's behalf. */
  defaultedQuarters: number[];
  /** The viewer's own calibration across the match. Null if they never predicted. */
  forecast: ForecastAccuracy | null;
  /** Badges the viewer earned. Derived from their own rows, never stored. */
  achievements: Achievement[];
}

/**
 * Builds one quarter as a given seat may see it.
 *
 * Takes the stored quarter and returns a view with the other five decisions
 * stripped out. Pure, so the "no rival allocations" property is a unit test.
 */
export function buildQuarterView(input: {
  viewerSeat: CompanyKey;
  quarter: QuarterDoc;
  previousQuarter: QuarterDoc | null;
  game: GroupGameDoc;
  /** Seats currently held by a student; everything else is bot-driven. */
  occupiedSeats: CompanyKey[];
  yourDecisionWasDefault: boolean;
  /** The VIEWER's own prediction, already separated from the other five. */
  yourForecast?: QuarterForecast | null;
  /** The VIEWER's own earlier result rows, oldest first, for the board letter. */
  yourHistory?: CompanyQuarterResult[];
}): QuarterView | null {
  const { viewerSeat, quarter, previousQuarter, game, occupiedSeats } = input;

  const yourDecision = quarter.decisions[viewerSeat];
  const yourResult = quarter.results.find((r) => r.companyKey === viewerSeat);
  if (!yourDecision || !yourResult) return null;

  const previousResult =
    previousQuarter?.results.find((r) => r.companyKey === viewerSeat) ?? null;

  const pressFacts = {
    companyName: yourResult.companyName,
    quarter: quarter.quarter,
    eventKey: quarter.eventKey,
    weights: quarter.weights,
    decision: yourDecision,
    result: yourResult,
    previous: previousResult,
    config: getGameConfig(game.scenarioVersion),
  };

  const rivals: RivalView[] = ARENA_SEATS.filter((seat) => seat !== viewerSeat)
    .map((seatKey) => {
      const result = quarter.results.find((r) => r.companyKey === seatKey);
      if (!result) return null;
      return {
        seatKey,
        companyName: result.companyName,
        isBot: !occupiedSeats.includes(seatKey),
        marketShare: result.marketShare,
        unitsSold: result.unitsSold,
        revenue: result.revenue,
        netProfit: result.netProfit,
        customerSatisfaction: result.customerSatisfaction,
        rank: result.rank,
      } satisfies RivalView;
    })
    .filter((rival): rival is RivalView => rival !== null);

  return {
    quarter: quarter.quarter,
    eventKey: quarter.eventKey,
    marketUnits: quarter.marketUnits,
    weights: quarter.weights,
    yourDecision,
    yourResult,
    previousResult,
    results: quarter.results,
    rivals,
    intel: buildArenaIntel(
      viewerSeat,
      quarter.decisions,
      previousQuarter?.decisions ?? null,
      game.companies,
    ),
    reviewNotes: reviewQuarter(
      {
        quarter: quarter.quarter,
        weights: quarter.weights,
        decision: yourDecision,
        result: yourResult,
      },
      previousResult,
    ),
    yourDecisionWasDefault: input.yourDecisionWasDefault,
    yourForecast: input.yourForecast ? scoreForecast(input.yourForecast, yourResult) : null,
    headlines: pressHeadlines(pressFacts),
    voices: customerVoices(pressFacts),
    board: boardLetter(pressFacts, input.yourHistory ?? []),
  };
}

/** Loads and assembles one quarter for one student. */
export async function getQuarterView(
  repos: Repositories,
  groupId: string,
  viewerSeat: CompanyKey,
  quarterNumber: number,
): Promise<QuarterView | null> {
  const [group, game] = await Promise.all([
    repos.groups.get(groupId),
    repos.groupGames.get(groupId),
  ]);
  if (!group || !game) return null;

  // One read of the match instead of two of its quarters: the board letter needs
  // the whole tenure so far, so that a bad quarter inside a rising trend is not
  // written up as a crisis.
  const [allQuarters, submissions] = await Promise.all([
    repos.groupGames.listQuarters(groupId),
    repos.groupGames.listSubmissions(groupId, quarterNumber),
  ]);
  const quarter = allQuarters.find((q) => q.quarter === quarterNumber) ?? null;
  const previousQuarter = allQuarters.find((q) => q.quarter === quarterNumber - 1) ?? null;
  if (!quarter) return null;

  const yourHistory = allQuarters
    .filter((q) => q.quarter < quarterNumber)
    .sort((a, b) => a.quarter - b.quarter)
    .map((q) => q.results.find((r) => r.companyKey === viewerSeat))
    .filter((row): row is CompanyQuarterResult => Boolean(row));

  return buildQuarterView({
    viewerSeat,
    quarter,
    previousQuarter,
    game,
    occupiedSeats: ARENA_SEATS.filter((seat) => group.seats[seat] != null),
    yourDecisionWasDefault:
      submissions.find((s) => s.seatKey === viewerSeat)?.wasDefault ?? false,
    // Narrowed to the viewer's seat HERE, at the read, so nothing downstream is
    // ever holding five other people's predictions.
    yourForecast: quarterForecast(
      submissions.find((s) => s.seatKey === viewerSeat) ?? { forecast: null },
    ),
    yourHistory,
  });
}

/** The final report for one student of a finished match. */
export async function getGroupReportView(
  repos: Repositories,
  groupId: string,
  uid: string,
): Promise<GroupReportView | null> {
  const [group, game, member] = await Promise.all([
    repos.groups.get(groupId),
    repos.groupGames.get(groupId),
    repos.groups.getMember(groupId, uid),
  ]);
  if (!group || !game || !member) return null;

  const config = getGameConfig(game.scenarioVersion);
  const quarters = await repos.groupGames.listQuarters(groupId);
  if (quarters.length < config.quarters) return null;

  const scores = computeGameFinalScores(
    groupResultsByCompany(quarters.flatMap((q) => q.results)),
    config,
  );
  const yourScore = scores.find((s) => s.companyKey === member.seatKey);
  if (!yourScore) return null;

  const facts = quarters
    .map((q) => {
      const decision = q.decisions[member.seatKey];
      const result = q.results.find((r) => r.companyKey === member.seatKey);
      return decision && result
        ? { quarter: q.quarter, weights: q.weights, decision, result }
        : null;
    })
    .filter((fact): fact is NonNullable<typeof fact> => fact !== null);

  const defaultedQuarters: number[] = [];
  const forecastEntries: { forecast: QuarterForecast | null; result: CompanyQuarterResult }[] = [];
  for (const q of quarters) {
    const submissions = await repos.groupGames.listSubmissions(groupId, q.quarter);
    const yours = submissions.find((s) => s.seatKey === member.seatKey);
    if (yours?.wasDefault) defaultedQuarters.push(q.quarter);

    const result = q.results.find((r) => r.companyKey === member.seatKey);
    // Only this student's own prediction is collected, and only against their
    // own result row.
    if (result) forecastEntries.push({ forecast: quarterForecast(yours ?? { forecast: null }), result });
  }

  return {
    group,
    member,
    scores,
    yourScore,
    tenure: tenureReview(facts, yourScore.finalScore),
    resultsByQuarter: quarters.map((q) => ({ quarter: q.quarter, results: q.results })),
    defaultedQuarters,
    forecast: forecastAccuracy(forecastEntries),
    achievements: awardAchievements({
      quarters: facts.map((fact) => ({
        quarter: fact.quarter,
        eventKey: quarters.find((q) => q.quarter === fact.quarter)!.eventKey,
        weights: fact.weights,
        decision: fact.decision,
        result: fact.result,
      })),
      score: yourScore,
      config,
      forecastIndex: forecastAccuracy(forecastEntries)?.index ?? null,
    }),
  };
}
