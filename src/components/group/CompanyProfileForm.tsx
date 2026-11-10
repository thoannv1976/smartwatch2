'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { POSITIONINGS, type Positioning } from '@/domain/simulation';
import { updateCompanyAction } from '@/server/group/actions';
import { useI18n } from '@/i18n/client';
import { Card, CardTitle, ErrorNote, InfoNote } from '@/components/ui/primitives';

/**
 * The student's own company in an industry: name, product and positioning.
 *
 * Students seated automatically (industry mode, or from Moodle) start with a
 * company named after them. They can rename it until the industry's first
 * decision is submitted; the market is built from these names at that moment,
 * so after that the form turns read-only.
 */
export function CompanyProfileForm({
  groupId,
  companyName,
  productName,
  positioning,
  editable,
}: {
  groupId: string;
  companyName: string;
  productName: string;
  positioning: Positioning;
  editable: boolean;
}) {
  const { t } = useI18n();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [company, setCompany] = useState(companyName);
  const [product, setProduct] = useState(productName);
  const [pos, setPos] = useState<Positioning>(positioning);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const dirty = company.trim() !== companyName || product.trim() !== productName || pos !== positioning;
  const ready = editable && dirty && company.trim() && product.trim() && !pending;

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!ready) return;
    setError(null);
    setSaved(false);
    startTransition(async () => {
      const result = await updateCompanyAction({
        groupId,
        companyName: company,
        productName: product,
        positioning: pos,
      });
      if (result.ok) {
        setSaved(true);
        router.refresh();
      } else {
        setError(t.errors[result.error]);
      }
    });
  };

  const input =
    'rounded-lg border border-ink-600 bg-ink-850 px-3 py-2 text-sm text-ink-100 focus:border-brand-500 focus:ring-2 focus:ring-brand-100 focus:outline-none disabled:opacity-60';

  return (
    <Card>
      <CardTitle hint={t.group.editCompanyHint}>{t.group.editCompanyTitle}</CardTitle>
      <form onSubmit={submit} className="flex flex-col gap-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-xs text-ink-300">
            {t.group.companyName}
            <input
              value={company}
              onChange={(e) => setCompany(e.target.value)}
              maxLength={60}
              disabled={!editable}
              className={input}
              required
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-ink-300">
            {t.group.productName}
            <input
              value={product}
              onChange={(e) => setProduct(e.target.value)}
              maxLength={60}
              disabled={!editable}
              className={input}
              required
            />
          </label>
        </div>
        <label className="flex flex-col gap-1 text-xs text-ink-300">
          {t.newGame.positioning}
          <select
            value={pos}
            onChange={(e) => setPos(e.target.value as Positioning)}
            disabled={!editable}
            className={input}
          >
            {POSITIONINGS.map((option) => (
              <option key={option} value={option}>
                {t.positioning[option]}
              </option>
            ))}
          </select>
          <span className="mt-1 text-xs text-ink-500">{t.positioningDesc[pos]}</span>
        </label>

        {error ? <ErrorNote>{error}</ErrorNote> : null}
        {editable ? (
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="submit"
              disabled={!ready}
              className="rounded-lg bg-brand-500 shadow-sm shadow-brand-500/25 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-400 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {pending ? t.group.savingCompany : t.group.saveCompany}
            </button>
            {saved && !dirty ? <span className="text-sm text-good-400">{t.group.companySaved}</span> : null}
          </div>
        ) : (
          <InfoNote>{t.group.companyLockedNote}</InfoNote>
        )}
      </form>
    </Card>
  );
}
