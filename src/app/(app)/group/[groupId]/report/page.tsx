import Link from 'next/link';
import { notFound } from 'next/navigation';
import { classPercentile } from '@/domain/simulation';
import { requireUserPage } from '@/server/auth/guards';
import { getRepositories } from '@/db/repositories/firestore';
import { createGroupService } from '@/server/group/service';
import { isGroupError } from '@/server/group/errors';
import { getGroupReportView } from '@/server/group/queries';
import { getClassRank } from '@/server/game/queries';
import { getTranslations } from '@/i18n/server';
import { interpolate } from '@/i18n';
import { HistoryCharts } from '@/components/game/HistoryCharts';
import { TenureReviewCard } from '@/components/game/TenureReview';
import { PrintButton } from '@/components/ui/PrintButton';
import {
  Badge,
  Card,
  CardTitle,
  EmptyState,
  PageHeader,
  TableScroll,
  Td,
  Th,
  WarningNote,
} from '@/components/ui/primitives';
import { formatDecimal, formatMoneyCompact, formatPercent } from '@/lib/format';

export const metadata = { title: 'Báo cáo nhóm — Smartwatch CEO Challenge' };

/**
 * The final report for one student of a finished group match.
 *
 * Same shape as the solo report — score, tenure review, print — plus the two
 * things only a group has: where the student finished among the six, and the
 * six-company charts. Built from `getGroupReportView`, so no rival allocation
 * reaches this page.
 */
export default async function GroupReportPage({
  params,
}: {
  params: Promise<{ groupId: string }>;
}) {
  const { groupId } = await params;
  const user = await requireUserPage(`/group/${groupId}/report`);
  const { t, locale } = await getTranslations();

  const repos = getRepositories();
  const service = createGroupService(repos);

  try {
    const member = await service.getMemberOf(groupId, user.uid);
    if (!member) notFound();
  } catch (error) {
    if (isGroupError(error)) notFound();
    throw error;
  }

  const report = await getGroupReportView(repos, groupId, user.uid);
  if (!report) {
    return (
      <main className="mx-auto flex max-w-4xl flex-col gap-6 px-4 py-8 sm:px-6">
        <PageHeader title={t.groupReport.title} />
        <EmptyState>{t.report.notCompleted}</EmptyState>
        <Link
          href={`/group/${groupId}`}
          className="w-fit rounded-md bg-brand-500 px-5 py-2.5 text-sm font-semibold text-ink-950 transition hover:bg-brand-400"
        >
          {t.group.lobbyTitle}
        </Link>
      </main>
    );
  }

  const { member, yourScore, scores, tenure } = report;
  const leader = scores.find((s) => s.gameRank === 1) ?? yourScore;
  const gapToLeader = leader.finalScore - yourScore.finalScore;

  // Where this student sits in the WHOLE class, across every group. Reuses the
  // solo path unchanged, because a group match writes ordinary graded rows.
  const storedResult = await repos.finalResults.get(`${groupId}__${member.seatKey}`);
  const classRank = storedResult ? await getClassRank(storedResult) : null;
  const percentile = classRank ? classPercentile(classRank.rank, classRank.total) : null;

  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-6 px-4 py-8 sm:px-6">
      <div className="print-only text-xs">
        <p className="text-base font-bold">{t.groupReport.title}</p>
        <p>
          {t.printing.player}: {user.displayName || user.email} · {report.group.name} ·{' '}
          {member.companyName}
        </p>
        <p>
          {report.group.id} · {member.seatKey}
        </p>
      </div>

      <PageHeader
        title={t.groupReport.title}
        subtitle={`${report.group.name} · ${member.companyName} · ${member.productName}`}
        right={<Badge tone="brand">{t.group.title}</Badge>}
      />

      <Card className="border-brand-600/50 bg-brand-500/5">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs font-semibold tracking-wide text-brand-400 uppercase">
              {t.report.finalScore}
            </p>
            <p className="tnum mt-1 text-5xl font-bold text-ink-100">
              {formatDecimal(yourScore.finalScore, locale, 2)}
              <span className="ml-2 text-xl font-normal text-ink-400">/ 100</span>
            </p>
          </div>
          <div className="flex flex-wrap gap-6 text-right">
            <div>
              <p className="text-xs text-ink-400">{t.groupReport.yourRank}</p>
              <p className="tnum text-2xl font-bold text-ink-100">
                {yourScore.gameRank}
                <span className="ml-1 text-sm font-normal text-ink-400">
                  {interpolate(t.groupReport.ofSix, { total: scores.length })}
                </span>
              </p>
            </div>
            {classRank ? (
              <div>
                <p className="text-xs text-ink-400">{t.report.classRank}</p>
                <p className="tnum text-2xl font-bold text-ink-100">
                  {classRank.rank} / {classRank.total}
                </p>
              </div>
            ) : null}
          </div>
        </div>

        {yourScore.gameRank > 1 ? (
          <p className="tnum mt-4 border-t border-brand-600/20 pt-4 text-sm text-ink-300">
            {t.groupReport.gapToLeader}: {formatDecimal(gapToLeader, locale, 2)}
          </p>
        ) : null}

        {percentile ? (
          <p className="mt-2 text-sm text-ink-300">
            <span className="font-semibold">{t.percentile[percentile.band]}</span> ·{' '}
            {interpolate(t.percentile.youBeat, { value: percentile.percentile })}
          </p>
        ) : null}
      </Card>

      {report.defaultedQuarters.length > 0 ? (
        <WarningNote>
          {interpolate(t.group.defaultedQuarters, {
            quarters: report.defaultedQuarters.join(', '),
          })}
        </WarningNote>
      ) : null}

      <TenureReviewCard t={t} locale={locale} review={tenure} />

      <Card>
        <CardTitle>{t.groupReport.standings}</CardTitle>
        <TableScroll>
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <Th align="center">{t.kpi.rank}</Th>
                <Th>{t.common.company}</Th>
                <Th align="right">{t.report.finalScore}</Th>
                <Th align="right">{t.kpi.netProfit}</Th>
                <Th align="right">{t.kpi.marketShare}</Th>
                <Th align="right">{t.kpi.customerSatisfaction}</Th>
              </tr>
            </thead>
            <tbody>
              {[...scores]
                .sort((a, b) => a.gameRank - b.gameRank)
                .map((score) => {
                  const isYou = score.companyKey === member.seatKey;
                  return (
                    <tr key={score.companyKey} className={isYou ? 'bg-brand-500/10' : ''}>
                      <Td numeric align="center" className={isYou ? 'font-bold' : ''}>
                        {score.gameRank}
                      </Td>
                      <Td className={isYou ? 'font-bold text-ink-100' : 'text-ink-200'}>
                        {score.companyName}
                        {isYou ? (
                          <span className="ml-2 align-middle">
                            <Badge tone="brand">{t.group.youBadge}</Badge>
                          </span>
                        ) : null}
                        {score.controllerType === 'AI' ? (
                          <span className="ml-2 align-middle">
                            <Badge tone="neutral">{t.group.botBadge}</Badge>
                          </span>
                        ) : null}
                      </Td>
                      <Td numeric align="right">{formatDecimal(score.finalScore, locale, 2)}</Td>
                      <Td numeric align="right">
                        {formatMoneyCompact(score.cumulativeProfit, locale)}
                      </Td>
                      <Td numeric align="right">
                        {formatPercent(score.finalMarketShare, locale)}
                      </Td>
                      <Td numeric align="right">{formatDecimal(score.finalCsat, locale, 1)}</Td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </TableScroll>
      </Card>

      <HistoryCharts
        resultsByQuarter={report.resultsByQuarter}
        playerCompanyName={member.companyName}
        playerCompanyKey={member.seatKey}
      />

      <div className="no-print flex flex-wrap gap-3">
        <PrintButton />
        <Link
          href={`/group/${groupId}`}
          className="rounded-md border border-ink-600 bg-ink-800 px-5 py-2.5 text-sm text-ink-100 transition hover:bg-ink-700"
        >
          {t.group.lobbyTitle}
        </Link>
        <Link
          href="/home"
          className="rounded-md border border-ink-600 px-5 py-2.5 text-sm text-ink-200 transition hover:bg-ink-800"
        >
          {t.home.title}
        </Link>
      </div>
    </main>
  );
}
