import { notFound } from 'next/navigation';
import { ARENA_SEATS } from '@/domain/simulation';
import { requireUserPage } from '@/server/auth/guards';
import { getRepositories } from '@/db/repositories/firestore';
import { createGroupService } from '@/server/group/service';
import { isGroupError } from '@/server/group/errors';
import { getTranslations } from '@/i18n/server';
import { GroupLobby, type LobbySeat } from '@/components/group/GroupLobby';
import { PageHeader } from '@/components/ui/primitives';

export const metadata = { title: 'Nhóm — Smartwatch CEO Challenge' };

/**
 * The group waiting room.
 *
 * Only a member of the group may open it. Everything it shows is public within
 * the group — who holds which company and whether they have decided — and it
 * shows no allocations at all.
 */
export default async function GroupLobbyPage({
  params,
}: {
  params: Promise<{ groupId: string }>;
}) {
  const { groupId } = await params;
  const user = await requireUserPage(`/group/${groupId}`);
  const { t } = await getTranslations();

  const service = createGroupService(getRepositories());

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

  const byUid = new Map(state.members.map((m) => [m.uid, m]));
  const seats: LobbySeat[] = ARENA_SEATS.map((seatKey) => {
    const uid = state.group.seats[seatKey] ?? null;
    const seatMember = uid ? byUid.get(uid) : undefined;
    return {
      seatKey,
      companyName: seatMember?.companyName ?? '',
      studentName: seatMember?.displayName ?? null,
      isYou: uid === user.uid,
      isBot: uid == null,
      hasSubmitted: state.submittedSeats.includes(seatKey),
    };
  });

  const lastPlayedQuarter = state.game && state.game.currentRound > 0 ? state.game.currentRound : null;

  return (
    <main className="mx-auto flex max-w-4xl flex-col gap-6 px-4 py-8 sm:px-6">
      <PageHeader title={t.group.lobbyTitle} subtitle={t.group.subtitle} />

      <GroupLobby
        groupId={groupId}
        groupName={state.group.name}
        joinCode={state.group.joinCode}
        seats={seats}
        currentQuarter={state.currentQuarter}
        completed={state.completed}
        youHaveSubmitted={state.submittedSeats.includes(member.seatKey)}
        lastPlayedQuarter={lastPlayedQuarter}
      />
    </main>
  );
}
