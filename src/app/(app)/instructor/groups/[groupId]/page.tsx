import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ARENA_SEATS } from '@/domain/simulation';
import { isArchived } from '@/db/models';
import { requireRolePage } from '@/server/auth/guards';
import { hasRole } from '@/server/auth/session';
import { getRepositories } from '@/db/repositories/firestore';
import { getGroupDetail } from '@/server/instructor/queries';
import { getTranslations } from '@/i18n/server';
import { interpolate } from '@/i18n';
import {
  ArchiveGroupButton,
  ForceQuarterButton,
  RefreshButton,
  RenameGroupForm,
  ReleaseSeatButton,
} from '@/components/instructor/GroupControls';
import {
  Badge,
  Card,
  CardTitle,
  EmptyState,
  InfoNote,
  PageHeader,
  TableScroll,
  Td,
  Th,
  WarningNote,
} from '@/components/ui/primitives';
import { formatDate, formatDecimal, formatMoneyCompact, formatPercent } from '@/lib/format';

export const metadata = { title: 'Chi tiết nhóm — Smartwatch CEO Challenge' };

/**
 * The full audit trail of one group match.
 *
 * THE ONE SCREEN THAT SHOWS ALL SIX ALLOCATIONS. Staff may see exact decisions
 * (spec 7.3), and comparing them side by side is the teaching material: it is
 * how an instructor answers "why did that company win?" in front of the class.
 * Nothing here is reachable by a student — the route is under /instructor and
 * the guard below re-checks course ownership.
 */
export default async function InstructorGroupPage({
  params,
}: {
  params: Promise<{ groupId: string }>;
}) {
  const { groupId } = await params;
  const user = await requireRolePage('INSTRUCTOR', `/instructor/groups/${groupId}`);
  const { t, locale } = await getTranslations();

  const detail = await getGroupDetail(groupId);
  if (!detail) notFound();

  // An instructor may only inspect a group on a course they own.
  const repos = getRepositories();
  if (!hasRole(user.role, 'ADMIN')) {
    const course = await repos.courses.get(detail.group.courseId);
    if (!course || course.instructorId !== user.uid) notFound();
  }

  const {
    group,
    members,
    quarters,
    scores,
    defaults,
    currentQuarter,
    completed,
    submittedSeats,
    waitingOn,
    submittedAt,
    isFinal,
  } = detail;
  const bySeat = new Map(members.filter((m) => m.leftAt == null).map((m) => [m.seatKey, m]));
  const submitted = new Set(submittedSeats);
  const liveMembers = members.filter((m) => m.leftAt == null);

  return (
    <main className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-8 sm:px-6">
      <PageHeader
        title={`${t.groupAdmin.detailTitle} · ${group.name}`}
        subtitle={t.groupAdmin.detailHint}
        right={
          <div className="flex flex-wrap items-center justify-end gap-2">
            <span className="font-mono text-sm tracking-widest text-ink-100">{group.joinCode}</span>
            <RenameGroupForm groupId={group.id} name={group.name} />
            <ArchiveGroupButton groupId={group.id} archived={isArchived(group)} />
            <Link
              href={`/instructor/assignments/${group.assignmentId}`}
              className="rounded-md border border-ink-600 bg-ink-800 px-3 py-1.5 text-xs text-ink-100 transition hover:bg-ink-700"
            >
              {t.instructor.assignments}
            </Link>
          </div>
        }
      />

      {/* Roster AND live status in one table. The six seats are already listed
          here in the students' own order, so a second table would repeat the
          same six people; the status columns simply join them. What nobody sees
          before the quarter runs is WHAT was submitted — see
          `GroupService.listSubmissionStatus`. */}
      <Card>
        <CardTitle
          hint={completed ? undefined : t.groupAdmin.liveStatusHint}
          right={
            completed ? null : (
              <span className="flex flex-wrap items-center gap-2">
                <RefreshButton />
                <ForceQuarterButton groupId={group.id} disabled={liveMembers.length === 0} />
              </span>
            )
          }
        >
          {completed || currentQuarter === null
            ? t.groupAdmin.members
            : interpolate(t.groupAdmin.liveStatus, { quarter: currentQuarter })}
        </CardTitle>

        {completed ? (
          <div className="mb-4">
            <InfoNote>{t.groupAdmin.liveStatusDone}</InfoNote>
          </div>
        ) : waitingOn.length === 0 ? (
          <div className="mb-4">
            <InfoNote>
              {liveMembers.length === 0
                ? t.groupAdmin.noGroups
                : submitted.size === 0
                  ? t.groupAdmin.liveStatusNotStarted
                  : t.groupAdmin.allSubmitted}
            </InfoNote>
          </div>
        ) : (
          <div className="mb-4">
            <WarningNote>
              {interpolate(t.groupAdmin.waitingOn, {
                names: waitingOn.map((w) => w.displayName).join(', '),
              })}
            </WarningNote>
          </div>
        )}

        <TableScroll>
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <Th>{t.common.company}</Th>
                <Th>{t.common.student}</Th>
                <Th>{t.instructor.studentCode}</Th>
                <Th>{t.newGame.positioning}</Th>
                <Th>{t.groupAdmin.status}</Th>
                <Th>{t.groupAdmin.submittedAt}</Th>
                <Th align="right" />
              </tr>
            </thead>
            <tbody>
              {ARENA_SEATS.map((seatKey) => {
                const member = bySeat.get(seatKey);
                const hasSubmitted = submitted.has(seatKey);
                const at = submittedAt.get(seatKey);
                return (
                  <tr key={seatKey}>
                    <Td className="text-ink-100">{member?.companyName ?? '—'}</Td>
                    <Td className="text-ink-200">
                      {member?.displayName ?? <Badge tone="neutral">{t.group.botBadge}</Badge>}
                    </Td>
                    <Td className="text-ink-400">{member?.studentCode ?? '—'}</Td>
                    <Td className="text-ink-400">
                      {member ? t.positioning[member.positioning] : '—'}
                    </Td>
                    <Td>
                      {!member ? (
                        <Badge tone="neutral">{t.group.botBadge}</Badge>
                      ) : completed ? (
                        <span className="text-xs text-ink-500">—</span>
                      ) : (
                        <Badge tone={hasSubmitted ? 'good' : 'warn'}>
                          {hasSubmitted ? t.group.statusSubmitted : t.group.statusWaiting}
                        </Badge>
                      )}
                    </Td>
                    <Td className="text-ink-400">
                      {member && !completed && at ? formatDate(at, locale) : '—'}
                    </Td>
                    <Td align="right">
                      {member && !completed && !hasSubmitted ? (
                        <ReleaseSeatButton groupId={group.id} uid={member.uid} />
                      ) : null}
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </TableScroll>
      </Card>

      {scores.length > 0 ? (
        <Card>
          {/* Never call a mid-match table "final". `computeGameFinalScores`
              happily scores two quarters, and an instructor reading "final
              standings" at quarter two would be reading marks that are still
              going to move. */}
          <CardTitle hint={isFinal ? undefined : t.groupAdmin.standingsProvisionalHint}>
            {isFinal
              ? t.groupAdmin.standings
              : interpolate(t.groupAdmin.standingsProvisional, { quarter: quarters.length })}
          </CardTitle>
          <TableScroll>
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  <Th align="center">{t.kpi.rank}</Th>
                  <Th>{t.common.company}</Th>
                  <Th align="right">{t.report.finalScore}</Th>
                  <Th align="right">{t.kpi.netProfit}</Th>
                  <Th align="right">{t.kpi.marketShare}</Th>
                  <Th align="right">{t.kpi.brandAwareness}</Th>
                  <Th align="right">{t.kpi.customerSatisfaction}</Th>
                </tr>
              </thead>
              <tbody>
                {[...scores]
                  .sort((a, b) => a.gameRank - b.gameRank)
                  .map((score) => (
                    <tr key={score.companyKey}>
                      <Td numeric align="center">{score.gameRank}</Td>
                      <Td className="text-ink-100">
                        {score.companyName}
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
                      <Td numeric align="right">{formatDecimal(score.finalBrand, locale, 1)}</Td>
                      <Td numeric align="right">{formatDecimal(score.finalCsat, locale, 1)}</Td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </TableScroll>
        </Card>
      ) : null}

      {quarters.length === 0 ? (
        <Card>
          <EmptyState>{t.history.noData}</EmptyState>
        </Card>
      ) : (
        quarters.map((quarter) => (
          <Card key={quarter.quarter}>
            <CardTitle hint={t.eventDesc[quarter.eventKey]}>
              {t.common.quarterShort}
              {quarter.quarter} · {t.events[quarter.eventKey]}
            </CardTitle>
            <TableScroll>
              <table className="w-full border-collapse">
                <thead>
                  <tr>
                    <Th>{t.common.company}</Th>
                    <Th align="right">{t.decision.product}</Th>
                    <Th align="right">{t.decision.technology}</Th>
                    <Th align="right">{t.decision.marketing}</Th>
                    <Th align="right">{t.decision.distribution}</Th>
                    <Th align="right">{t.decision.cx}</Th>
                    <Th align="right">{t.decision.priceIndex}</Th>
                    <Th align="right">{t.kpi.unitsSold}</Th>
                    <Th align="right">{t.kpi.netProfit}</Th>
                    <Th align="right">{t.kpi.marketShare}</Th>
                    <Th align="center">{t.kpi.rank}</Th>
                  </tr>
                </thead>
                <tbody>
                  {[...quarter.results]
                    .sort((a, b) => a.rank - b.rank)
                    .map((result) => {
                      const decision = quarter.decisions[result.companyKey];
                      if (!decision) return null;
                      const wasDefault = defaults.get(`${quarter.quarter}_${result.companyKey}`);
                      return (
                        <tr key={result.companyKey}>
                          <Td className="text-ink-100">
                            {result.companyName}
                            {result.controllerType === 'AI' ? (
                              <span className="ml-2 align-middle">
                                <Badge tone="neutral">{t.group.botBadge}</Badge>
                              </span>
                            ) : null}
                            {wasDefault ? (
                              <span className="ml-2 align-middle">
                                <Badge tone="warn">{t.groupAdmin.defaultFlag}</Badge>
                              </span>
                            ) : null}
                          </Td>
                          <Td numeric align="right">{decision.productPoints}</Td>
                          <Td numeric align="right">{decision.technologyPoints}</Td>
                          <Td numeric align="right">{decision.marketingPoints}</Td>
                          <Td numeric align="right">{decision.distributionPoints}</Td>
                          <Td numeric align="right">{decision.cxPoints}</Td>
                          <Td numeric align="right">{decision.priceIndex}</Td>
                          <Td numeric align="right">
                            {result.unitsSold.toLocaleString(locale)}
                          </Td>
                          <Td
                            numeric
                            align="right"
                            className={result.netProfit < 0 ? 'text-bad-400' : undefined}
                          >
                            {formatMoneyCompact(result.netProfit, locale)}
                          </Td>
                          <Td numeric align="right">
                            {formatPercent(result.marketShare, locale)}
                          </Td>
                          <Td numeric align="center">{result.rank}</Td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </TableScroll>
          </Card>
        ))
      )}
    </main>
  );
}
