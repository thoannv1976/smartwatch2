import Link from 'next/link';
import { requireRolePage } from '@/server/auth/guards';
import { getRepositories } from '@/db/repositories/firestore';
import { getTranslations } from '@/i18n/server';
import { interpolate } from '@/i18n';
import { STALLED_AFTER_DAYS, listStalledGroups } from '@/server/instructor/queries';
import { isArchived } from '@/db/models';
import { RoleSelect } from '@/components/instructor/RoleSelect';
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
} from '@/components/ui/primitives';
import { getGameConfig, SELECTABLE_SCENARIO_VERSIONS } from '@/domain/simulation';
import { formatDate, formatInteger, formatMoney } from '@/lib/format';

export const metadata = { title: 'Quản trị — Smartwatch CEO Challenge' };

/** Admin: users, courses and the read-only engine configuration (spec 9.3). */
export default async function AdminPage() {
  const admin = await requireRolePage('ADMIN', '/admin');
  const { t, locale } = await getTranslations();

  const repos = getRepositories();
  const [users, courses, stalledGroups] = await Promise.all([
    repos.users.list(200),
    repos.courses.listAll(),
    listStalledGroups(),
  ]);

  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-6 px-4 py-8 sm:px-6">
      <PageHeader title={t.admin.title} subtitle={admin.displayName} />

      {/* Group mode waits for all six and has no automatic deadline, which is a
          deliberate choice with exactly one failure mode: a group waiting
          forever on somebody who stopped turning up. An instructor sees that on
          their own assignment page; this is the system-wide view, so nothing
          sits stuck in a class nobody is watching. */}
      {stalledGroups.length > 0 ? (
        <Card className="border-warn-500/40">
          <CardTitle hint={interpolate(t.groupAdmin.stalledHint, { days: STALLED_AFTER_DAYS })}>
            {t.groupAdmin.stalledTitle}
          </CardTitle>
          <TableScroll>
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  <Th>{t.instructor.courseName}</Th>
                  <Th>{t.groupAdmin.tab}</Th>
                  <Th align="center">{t.common.quarter}</Th>
                  <Th>{t.groupAdmin.waitingOn.replace('{names}', '').replace(':', '')}</Th>
                  <Th align="right" />
                </tr>
              </thead>
              <tbody>
                {stalledGroups.map((row) => (
                  <tr key={row.groupId}>
                    <Td className="text-ink-200">
                      {row.courseName}
                      <span className="block text-xs text-ink-500">{row.assignmentTitle}</span>
                    </Td>
                    <Td className="text-ink-100">{row.groupName}</Td>
                    <Td numeric align="center">
                      {t.common.quarterShort}
                      {row.quarter}
                    </Td>
                    <Td className="text-warn-500">
                      {row.waitingOn.join(', ')}
                      <span className="block text-xs text-ink-500">
                        {interpolate(t.groupAdmin.stalledDays, { days: row.idleDays })}
                      </span>
                    </Td>
                    <Td align="right">
                      <Link
                        href={`/instructor/assignments/${row.assignmentId}`}
                        className="text-brand-400 underline-offset-2 hover:underline"
                      >
                        {t.instructor.viewDetail}
                      </Link>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableScroll>
        </Card>
      ) : null}

      <Card>
        <CardTitle
          right={
            <Link
              href="/admin/users"
              className="rounded-md bg-brand-500 px-3 py-1.5 text-xs font-semibold text-ink-950 transition hover:bg-brand-400"
            >
              {t.common.edit}
            </Link>
          }
        >
          {t.admin.users} ({users.length})
        </CardTitle>
        {users.length === 0 ? (
          <EmptyState>{t.common.none}</EmptyState>
        ) : (
          <TableScroll>
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  <Th>{t.auth.displayName}</Th>
                  <Th>{t.auth.email}</Th>
                  <Th>{t.admin.changeRole}</Th>
                  <Th>{t.home.startedAt}</Th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => (
                  <tr key={user.uid}>
                    <Td className="text-ink-100">{user.displayName}</Td>
                    <Td className="text-ink-400">{user.email}</Td>
                    <Td>
                      <RoleSelect uid={user.uid} role={user.role} isSelf={user.uid === admin.uid} />
                    </Td>
                    <Td className="text-ink-400">{formatDate(user.createdAt, locale)}</Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableScroll>
        )}
      </Card>

      <Card>
        <CardTitle>
          {t.instructor.courses} ({courses.length})
        </CardTitle>
        {courses.length === 0 ? (
          <EmptyState>{t.common.none}</EmptyState>
        ) : (
          <TableScroll>
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  <Th>{t.instructor.courseName}</Th>
                  <Th>{t.instructor.semester}</Th>
                  <Th />
                </tr>
              </thead>
              <tbody>
                {courses.map((course) => (
                  <tr key={course.id}>
                    <Td className="text-ink-100">
                      {course.courseName}{' '}
                      {isArchived(course) ? (
                        <Badge tone="warn">{t.instructorAdmin.archived}</Badge>
                      ) : null}
                    </Td>
                    <Td className="text-ink-300">{course.semester}</Td>
                    <Td align="right">
                      <Link
                        href={`/instructor/courses/${course.id}`}
                        className="text-brand-400 underline-offset-2 hover:underline"
                      >
                        {t.instructor.viewDetail}
                      </Link>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableScroll>
        )}
      </Card>

      <Card>
        <CardTitle hint={t.admin.configReadOnly}>{t.admin.engineConfig}</CardTitle>
        <div className="flex flex-col gap-4">
          {SELECTABLE_SCENARIO_VERSIONS.map((version) => {
            const config = getGameConfig(version);
            return (
              <div key={version} className="rounded-lg border border-ink-700/60 bg-ink-900/50 p-4">
                <p className="font-mono text-sm font-semibold text-brand-400">
                  {version} · engine {config.engineVersion}
                </p>
                <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-xs sm:grid-cols-4">
                  <Entry label="quarters" value={String(config.quarters)} />
                  <Entry
                    label="marketUnitsBase"
                    value={formatInteger(config.marketUnitsBase, locale)}
                  />
                  <Entry
                    label="referencePrice"
                    value={formatMoney(config.referencePrice, locale)}
                  />
                  <Entry label="strategyPoints" value={String(config.strategyPoints)} />
                  <Entry
                    label="quarterlyStrategicInvestment"
                    value={formatMoney(config.quarterlyStrategicInvestment, locale)}
                  />
                  <Entry
                    label="quarterlyFixedOperatingCost"
                    value={formatMoney(config.quarterlyFixedOperatingCost, locale)}
                  />
                  <Entry
                    label="playerStartingCash"
                    value={formatMoney(config.playerStartingCash, locale)}
                  />
                  <Entry
                    label="priceIndex"
                    value={`${config.priceIndexMin}–${config.priceIndexMax}`}
                  />
                  <Entry
                    label="random"
                    value={`${config.randomMin}–${config.randomMax}`}
                  />
                  <Entry
                    label="profitScoreDivisor"
                    value={formatInteger(config.profitScoreDivisor, locale)}
                  />
                  <Entry label="quarterlyRankBy" value={config.quarterlyRankBy} />
                  <Entry
                    label="playerStart"
                    value={`B${config.playerStart.brandAwareness} P${config.playerStart.productQuality} T${config.playerStart.technology} D${config.playerStart.distribution} C${config.playerStart.customerExperience}`}
                  />
                </dl>
              </div>
            );
          })}
        </div>
        <div className="mt-4">
          <InfoNote>{t.admin.configReadOnly}</InfoNote>
        </div>
      </Card>
    </main>
  );
}

function Entry({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="font-mono text-ink-400">{label}</dt>
      <dd className="tnum text-ink-100">{value}</dd>
    </div>
  );
}
