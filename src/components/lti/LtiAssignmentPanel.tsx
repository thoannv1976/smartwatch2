import { GraduationCap } from 'lucide-react';
import { getTranslations } from '@/i18n/server';
import { Card, CardTitle, InfoNote } from '@/components/ui/primitives';
import { getLtiService, isLtiEnabled } from '@/server/lti/runtime';
import { SendClassGradesButton } from './SendClassGradesButton';

/** Instructor view: which LMS activities play this assignment, and sending grades. */
export async function LtiAssignmentPanel({ assignmentId }: { assignmentId: string }) {
  if (!isLtiEnabled()) return null;
  const { t } = await getTranslations();
  const links = await getLtiService().linksForAssignment(assignmentId);
  const canSend = links.some((l) => l.linkTarget);

  return (
    <Card>
      <CardTitle>
        <span className="inline-flex items-center gap-2">
          <GraduationCap className="h-4 w-4 text-brand-500" aria-hidden />
          {t.lti.panelTitle}
        </span>
      </CardTitle>
      {links.length === 0 ? (
        <InfoNote>{t.lti.panelNone}</InfoNote>
      ) : (
        <div className="flex flex-col gap-3">
          <div>
            <p className="text-xs font-semibold text-ink-400">{t.lti.panelLinked}</p>
            <ul className="mt-1 flex flex-col gap-1">
              {links.map((l) => (
                <li key={l.key} className="text-sm text-ink-100">
                  <span className="font-semibold">{l.resourceTitle ?? '—'}</span>
                  <span className="text-ink-400"> · {l.contextTitle ?? l.contextLabel ?? ''}</span>
                </li>
              ))}
            </ul>
          </div>
          <p className="text-sm text-ink-300">{t.lti.panelAuto}</p>
          {canSend ? (
            <SendClassGradesButton assignmentId={assignmentId} />
          ) : (
            <InfoNote>{t.lti.panelNoColumn}</InfoNote>
          )}
        </div>
      )}
    </Card>
  );
}
