import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getGameConfig } from '@/domain/simulation';
import { requireUserPage } from '@/server/auth/guards';
import { getRepositories } from '@/db/repositories/firestore';
import { createGroupService } from '@/server/group/service';
import { isGroupError } from '@/server/group/errors';
import { getQuarterView } from '@/server/group/queries';
import { getTranslations } from '@/i18n/server';
import { interpolate } from '@/i18n';
import { RankingTable } from '@/components/game/RankingTable';
import { QuarterReviewCard } from '@/components/game/QuarterReview';
import {
  Badge,
  Card,
  CardTitle,
  PageHeader,
  StatTile,
  TableScroll,
  Td,
  Th,
  WarningNote,
} from '@/components/ui/primitives';
import {
  formatInteger,
  formatMoney,
  formatMoneyCompact,
  formatPercent,
  formatPercentagePoints,
  formatScore,
  formatSignedPercent,
  relativeChange,
} from '@/lib/format';

export const metadata = { title: 'Kết quả quý (nhóm) — Smartwatch CEO Challenge' };

/**
 * One quarter of a group match, as one student sees it.
 *
 * Everything rendered comes from `getQuarterView`, which is where the
 * confidentiality boundary lives: it hands over the viewer's own decision and
 * the five rivals' PUBLIC outcomes, and simply does not contain their
 * allocations. See `src/server/group/queries.ts`.
 */
export default async function GroupQuarterResultPage({
  params,
}: {
  params: Promise<{ groupId: string; quarter: string }>;
}) {
  const { groupId, quarter: quarterParam } = await params;
  const user = await requireUserPage(`/group/${groupId}`);
  const { t, locale } = await getTranslations();

  const quarterNumber = Number(quarterParam);
  if (!Number.isInteger(quarterNumber)) notFound();

  const repos = getRepositories();
  const service = createGroupService(repos);

  let member;
  let state;
  try {
    member = await service.getMemberOf(groupId, user.uid);
    if (!member) notFound();
    state = await service.getState(groupId);
  } catch (error) {
    if (isGroupError(error)) notFound();
    throw error;
  }

  const view = await getQuarterView(repos, groupId, member.seatKey, quarterNumber);
  if (!view) notFound();

  const config = getGameConfig(state.game?.scenarioVersion ?? undefined);
  const result = view.yourResult;
  const previous = view.previousResult;

  const revenueChange = previous ? relativeChange(result.revenue, previous.revenue) : null;
  const profitChange = previous ? relativeChange(result.netProfit, previous.netProfit) : null;
  const shareChange = previous ? result.marketShare - previous.marketShare : null;

  const isLastQuarter = quarterNumber >= config.quarters;

  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-6 px-4 py-8 sm:px-6">
      <PageHeader
        title={`${t.common.quarterShort}${quarterNumber} · ${t.result.title}`}
        subtitle={`${state.group.name} · ${member.companyName}`}
        right={<Badge tone="info">{t.events[view.eventKey]}</Badge>}
      />

      {view.yourDecisionWasDefault ? (
        <WarningNote>{t.group.yourDecisionDefaulted}</WarningNote>
      ) : null}

      <Card>
        <CardTitle>{t.result.eventContext}</CardTitle>
        <p className="max-w-prose text-sm text-ink-300">{t.eventDesc[view.eventKey]}</p>
        <p className="tnum mt-2 text-xs text-ink-400">
          {t.dashboard.marketSize}: {formatInteger(view.marketUnits, locale)} {t.dashboard.units}
        </p>
      </Card>

      <Card>
        <CardTitle>{t.result.title}</CardTitle>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatTile
            emphasis
            label={t.kpi.revenue}
            value={formatMoneyCompact(result.revenue, locale)}
            delta={revenueChange === null ? undefined : formatSignedPercent(revenueChange, locale)}
            deltaTone={revenueChange === null ? 'neutral' : revenueChange >= 0 ? 'good' : 'bad'}
          />
          <StatTile
            emphasis
            label={t.kpi.netProfit}
            value={formatMoneyCompact(result.netProfit, locale)}
            delta={profitChange === null ? undefined : formatSignedPercent(profitChange, locale)}
            deltaTone={result.netProfit >= 0 ? 'good' : 'bad'}
          />
          <StatTile
            emphasis
            label={t.kpi.marketShare}
            value={formatPercent(result.marketShare, locale)}
            delta={shareChange === null ? undefined : formatPercentagePoints(shareChange, locale)}
            deltaTone={shareChange === null ? 'neutral' : shareChange >= 0 ? 'good' : 'bad'}
          />
          <StatTile label={t.kpi.rank} value={`${result.rank} / ${view.results.length}`} />
          <StatTile label={t.kpi.unitsSold} value={formatInteger(result.unitsSold, locale)} />
          <StatTile label={t.kpi.actualPrice} value={formatMoney(result.actualPrice, locale)} />
          <StatTile
            label={t.kpi.netProfitMargin}
            value={formatPercent(result.netProfitMargin, locale)}
            deltaTone={result.netProfitMargin >= 0 ? 'good' : 'bad'}
          />
          <StatTile
            label={t.kpi.customerSatisfaction}
            value={formatScore(result.customerSatisfaction, locale)}
          />
        </div>

        {result.cash < 0 ? (
          <div className="mt-3">
            <WarningNote>{t.dashboard.cashWarning}</WarningNote>
          </div>
        ) : null}
      </Card>

      <Card>
        <CardTitle>{t.result.yourDecision}</CardTitle>
        <TableScroll>
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <Th align="right">{t.decision.product}</Th>
                <Th align="right">{t.decision.technology}</Th>
                <Th align="right">{t.decision.marketing}</Th>
                <Th align="right">{t.decision.distribution}</Th>
                <Th align="right">{t.decision.cx}</Th>
                <Th align="right">{t.decision.priceIndex}</Th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <Td numeric align="right">{view.yourDecision.productPoints}</Td>
                <Td numeric align="right">{view.yourDecision.technologyPoints}</Td>
                <Td numeric align="right">{view.yourDecision.marketingPoints}</Td>
                <Td numeric align="right">{view.yourDecision.distributionPoints}</Td>
                <Td numeric align="right">{view.yourDecision.cxPoints}</Td>
                <Td numeric align="right">{view.yourDecision.priceIndex}</Td>
              </tr>
            </tbody>
          </table>
        </TableScroll>
      </Card>

      <Card>
        <CardTitle>{t.dashboard.ranking}</CardTitle>
        <RankingTable
          results={view.results}
          locale={locale}
          playerCompanyName={member.companyName}
          playerCompanyKey={member.seatKey}
        />
      </Card>

      {/* Rivals: public outcomes only, and a qualitative line each. Their point
          allocations are never sent to this page — see `getQuarterView`. */}
      <Card>
        <CardTitle hint={t.group.rivalsHint}>{t.group.rivalsTitle}</CardTitle>
        <ul className="flex flex-col gap-2">
          {view.intel.map((entry) => {
            const rival = view.rivals.find((r) => r.seatKey === entry.companyKey);
            return (
              <li key={entry.companyKey} className="text-sm text-ink-300">
                • {interpolate(t.intel[entry.key], { company: entry.companyName })}
                {rival?.isBot ? (
                  <span className="ml-2 align-middle">
                    <Badge tone="neutral">{t.group.botBadge}</Badge>
                  </span>
                ) : null}
              </li>
            );
          })}
        </ul>
      </Card>

      <QuarterReviewCard t={t} notes={view.reviewNotes} />

      <div className="flex flex-wrap gap-3">
        <Link
          href={`/group/${groupId}`}
          className="rounded-md bg-brand-500 px-5 py-2.5 text-sm font-semibold text-ink-950 transition hover:bg-brand-400"
        >
          {isLastQuarter ? t.group.viewReport : t.group.lobbyTitle}
        </Link>
        {quarterNumber > 1 ? (
          <Link
            href={`/group/${groupId}/result/${quarterNumber - 1}`}
            className="rounded-md border border-ink-600 px-5 py-2.5 text-sm text-ink-200 transition hover:bg-ink-800"
          >
            {interpolate(t.group.viewResult, { quarter: quarterNumber - 1 })}
          </Link>
        ) : null}
      </div>
    </main>
  );
}
