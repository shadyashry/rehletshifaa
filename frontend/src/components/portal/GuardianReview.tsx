"use client";

import { useCallback, useEffect, useId, useMemo, useState } from "react";

import { intlLocale, type Locale } from "@/lib/i18n";
import { AGE_BANDS, type AgeBand } from "@/lib/case-form-schema";
import { fillTemplate } from "@/lib/portal-labels";
import { useWorkCopy } from "@/components/portal/portal-copy";
import { ConfirmDialog } from "@/components/portal/portal-ui";
import { StatusBadge, type StatusTone } from "@/components/portal/StatusBadge";
import type { Mutate } from "@/components/portal/portal-model";

/** What the coordinator sees of a guardian delegation (never the document's content). */
export type GuardianView = {
  caseId: string; ageBand?: string | null; minor: boolean; state: "NONE" | "EVIDENCE_MISSING" | "EVIDENCE_UNVERIFIED" | "VERIFIED";
  legalBasis?: string | null; relationship?: string | null; evidenceDocumentId?: string | null; evidenceVerifiedAt?: string | null;
};
const MINOR_BANDS = new Set(["UNDER_12", "AGE_12_17"]);

/**
 * P1-13 (A-05), staff case page: the patient's age band, corrected by the coordinator who owns the case, and — for a minor —
 * the guardian and the decision on their evidence. The backend decides what a band means and whether a guardian counts; this
 * panel records the band and the decision, and shows the result.
 */
export function GuardianReview({ locale, caseId, ageBand, canEdit, busy, mutate, load, viewDoc }: {
  locale: Locale; caseId: string; ageBand?: string | null; canEdit: boolean; busy: boolean; mutate: Mutate;
  load: <T>(path: string) => Promise<T>; viewDoc: (id: string) => void;
}) {
  const work = useWorkCopy();
  const t = work.safety.guardianReview, bands = work.safety.ageBand, basis = work.safety.guardian.basis as Record<string, string>;
  const id = useId();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<AgeBand | "">((ageBand as AgeBand | null) ?? "");
  const [guardian, setGuardian] = useState<GuardianView | null | undefined>(undefined);
  const [refusing, setRefusing] = useState(false);
  const minor = MINOR_BANDS.has(ageBand ?? "");
  const dateFormat = useMemo(() => new Intl.DateTimeFormat(intlLocale(locale), { dateStyle: "medium" }), [locale]);

  const readGuardian = useCallback(() => load<GuardianView>(`/coordinator/cases/${caseId}/guardian`).then(setGuardian, () => setGuardian(null)), [load, caseId]);
  useEffect(() => {
    if (!minor) return;
    let live = true;
    load<GuardianView>(`/coordinator/cases/${caseId}/guardian`).then(view => { if (live) setGuardian(view); }, () => { if (live) setGuardian(null); });
    return () => { live = false; };
  }, [load, caseId, minor]);

  async function saveBand() {
    if (!draft || draft === ageBand) { setEditing(false); return; }
    const result = await mutate(`/coordinator/cases/${caseId}/age-band`, { ageBand: draft }, "PUT");
    if (result) setEditing(false);
  }
  async function decide(decision: "VERIFY" | "REJECT") {
    const result = await mutate(`/coordinator/cases/${caseId}/guardian/evidence-decision`, { decision });
    if (result) await readGuardian();
  }

  const bandLabel = ageBand ? (bands.bands as Record<string, string>)[ageBand] ?? ageBand : bands.notStated;
  return (
    <section aria-labelledby={`${id}-title`} className="card p-4 sm:p-5">
      <h3 id={`${id}-title`} className="title text-base">{t.title}</h3>
      <dl className="mt-3 text-[0.9rem]">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2">
          <dt className="text-ink-500">{bands.label}</dt>
          <dd className="min-w-0 flex-1 text-end font-semibold text-ink-900">
            {!editing ? <>
              <span>{bandLabel}</span>
              {canEdit && <button type="button" className="link-cta ms-3 inline-flex min-h-11 items-center text-[0.85rem]" onClick={() => { setDraft((ageBand as AgeBand | null) ?? ""); setEditing(true); }}>{t.change}</button>}
            </> : (
              <span className="flex flex-wrap items-center justify-end gap-2">
                <label className="sr-only" htmlFor={`${id}-band`}>{bands.label}</label>
                <select id={`${id}-band`} className="field !w-auto min-w-40" value={draft} onChange={event => setDraft(event.target.value as AgeBand | "")}>
                  {!ageBand && <option value="">{bands.notStated}</option>}
                  {AGE_BANDS.map(band => <option key={band} value={band}>{(bands.bands as Record<string, string>)[band]}</option>)}
                </select>
                <button type="button" className="btn-secondary" onClick={() => setEditing(false)}>{t.cancel}</button>
                <button type="button" className="btn-primary" disabled={busy || !draft} onClick={() => void saveBand()}>{t.save}</button>
              </span>
            )}
          </dd>
        </div>
      </dl>
      {minor && <div className="mt-3 space-y-3 text-[0.9rem]">
        <p className="text-[0.85rem] text-ink-600">{bands.minor}</p>
        {guardian === null && <p role="alert" className="text-[0.85rem] text-alert-800">{t.loadFailed}</p>}
        {guardian && (
          <div className="border-t border-line pt-3">
            <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
              <p className="text-ink-500">{t.guardian}</p>
              <StatusBadge tone={guardianTone(guardian.state)}>{(t.states as Record<string, string>)[guardian.state] ?? guardian.state}</StatusBadge>
            </div>
            {guardian.legalBasis && <p className="mt-1.5 font-semibold text-ink-800">{basis[guardian.legalBasis] ?? guardian.legalBasis}</p>}
            {guardian.state === "VERIFIED" && guardian.evidenceVerifiedAt &&
              <p className="mt-0.5 text-[0.85rem] text-ink-500">{fillTemplate(t.verifiedOn, { date: dateFormat.format(new Date(guardian.evidenceVerifiedAt)) })}</p>}
            {guardian.evidenceDocumentId && (
              <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
                <button type="button" className="link-cta inline-flex min-h-11 items-center text-[0.85rem]" onClick={() => viewDoc(guardian.evidenceDocumentId!)}>{t.viewDocument}</button>
                {canEdit && guardian.state === "EVIDENCE_UNVERIFIED" && <span className="ms-auto flex gap-2">
                  <button type="button" className="btn-secondary" disabled={busy} onClick={() => setRefusing(true)}>{t.refuse}</button>
                  <button type="button" className="btn-primary" disabled={busy} onClick={() => void decide("VERIFY")}>{t.verify}</button>
                </span>}
              </div>
            )}
          </div>
        )}
      </div>}
      {refusing && <ConfirmDialog title={t.refuseTitle} body={t.refuseBody} confirm={t.refuse} cancel={t.cancel}
        onConfirm={() => { setRefusing(false); void decide("REJECT"); }} onCancel={() => setRefusing(false)}/>}
    </section>
  );
}

function guardianTone(state: string): StatusTone {
  return state === "VERIFIED" ? "success" : state === "EVIDENCE_UNVERIFIED" ? "warning" : "neutral";
}
