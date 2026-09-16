import { notFound, redirect } from 'next/navigation';
import {
  ARENA_SCENARIO_VERSION,
  ARENA_SEATS,
  createArenaCompanies,
  getGameConfig,
  getMarketEvent,
  suggestStrategies,
  type QuarterDecision,
} from '@/domain/simulation';
import { requireUserPage } from '@/server/auth/guards';
import { getRepositories } from '@/db/repositories/firestore';
import { createGroupService } from '@/server/group/service';
import { isGroupError } from '@/server/group/errors';
import { getTranslations } from '@/i18n/server';
import { GroupDecisionScreen } from '@/components/group/GroupDecisionScreen';
import { Card, CardTitle, PageHeader } from '@/components/ui/primitives';
import { formatInteger } from '@/lib/format';

export const metadata = { title: 'Quyết định nhóm — Smartwatch CEO Challenge' };

/**
 * One student's decision for the current quarter of a group match.
 *
 * Everything on this page is about the viewer's OWN company. The five rivals'
 * decisions for this quarter do not exist yet — that is the point of the mode —
 * and their previous ones are never sent here.
 */
export default async function GroupDecisionPage({
  params,
}: {
  params: Promise<{ groupId: string }>;
}) {
  const { groupId } = await params;
  const user = await requireUserPage(`/group/${groupId}/decision`);
  const { t, locale } = await getTranslations();

  const repos = getRepositories();
  const service = createGroupService(repos);

  let state;
  let member;
  try {
    member = await service.getMemberOf(groupId, user.uid);
    if (!member) notFound();
    state = await service.getState(groupId);
  } catch (error) {
    if (isGroupError(error)) notFound();
    throw error;
  }

  // Nothing left to decide, or this student has already decided: the lobby is
  // the right place to be.
  if (state.completed || state.currentQuarter === null) redirect(`/group/${groupId}`);
  if (state.submittedSeats.includes(member.seatKey)) redirect(`/group/${groupId}`);

  const quarter = state.currentQuarter;
  const config = getGameConfig(state.game?.scenarioVersion ?? ARENA_SCENARIO_VERSION);
  const event = getMarketEvent(quarter, config);

  // The match is created lazily, on the first submission — so before quarter
  // one there are no stored companies. Derive them from the seat map instead of
  // starting the match here: opening a page must not freeze the seats for
  // everyone else. `createArenaCompanies` is pure and writes nothing, and gives
  // every seat the same starting row anyway.
  const quarters = await service.listQuarters(groupId);
  const companies =
    state.game?.companies ??
    createArenaCompanies(
      ARENA_SEATS.map((seatKey) => {
        const uid = state.group.seats[seatKey] ?? null;
        const seated = state.members.find((m) => m.uid === uid && m.leftAt == null);
        return { seatKey, uid: seated?.uid ?? null, companyName: seated?.companyName ?? '' };
      }),
      config,
    );

  const playerState = companies.find((c) => c.companyKey === member.seatKey) ?? null;
  if (!playerState) notFound();

  const history = quarters
    .map((q) => q.results.find((r) => r.companyKey === member.seatKey))
    .filter((result): result is NonNullable<typeof result> => Boolean(result));
  const previousDecisions = quarters
    .map((q) => q.decisions[member.seatKey])
    .filter((decision): decision is QuarterDecision => Boolean(decision));

  const suggestions = suggestStrategies(
    event,
    playerState,
    history,
    previousDecisions[previousDecisions.length - 1] ?? null,
    config,
  );

  return (
    <main className="mx-auto flex max-w-4xl flex-col gap-6 px-4 py-8 sm:px-6">
      <PageHeader
        title={`${t.common.quarterShort}${quarter} · ${t.decision.title}`}
        subtitle={`${state.group.name} · ${member.companyName}`}
      />

      <Card>
        <CardTitle>
          {t.dashboard.marketEvent}: {t.events[event.key]}
        </CardTitle>
        <p className="max-w-prose text-sm text-ink-300">{t.eventDesc[event.key]}</p>
        <p className="tnum mt-2 text-xs text-ink-400">
          {t.dashboard.marketSize}: {formatInteger(event.marketUnits, locale)} {t.dashboard.units}
        </p>
      </Card>

      <GroupDecisionScreen
        groupId={groupId}
        quarter={quarter}
        scenarioVersion={config.scenarioVersion}
        capabilities={{
          productQuality: playerState.productQuality,
          technology: playerState.technology,
          distribution: playerState.distribution,
          customerExperience: playerState.customerExperience,
        }}
        playerState={playerState}
        suggestions={suggestions}
        previousDecisions={previousDecisions}
      />
    </main>
  );
}
