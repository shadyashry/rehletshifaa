"use client";

import { useEffect, useRef, useState } from "react";
import type { Locale } from "@/lib/i18n";
import { useWorkCopy } from "@/components/portal/portal-copy";
import { careAreaLabel, fillTemplate, plural } from "@/lib/portal-labels";
import { ConfirmDialog } from "@/components/portal/portal-ui";

/**
 * Consultant routing on the case page: choosing a named, eligible consultant; the coordinator's confirmation of a
 * consultant referral; and the consultant's own referral / second-opinion forms. Consultants are addressed by
 * practitioner id only — no identity-provider subject is requested, shown or sent. The backend re-checks every rule.
 */
export type Load = <T>(path: string) => Promise<T>;
export type Mutate = (path: string, body?: unknown, method?: string) => Promise<unknown>;
export type CareCategory = { slug: string; nameEn: string; nameAr: string };
export type EligibleConsultant = {
  practitionerId: string; displayName: string; specialty?: string | null; subspecialty?: string | null; careArea: string; matchedBy: string;
  capabilities: { type: string; code: string; label: string }[]; languages?: string | null; availabilityStatus?: string | null;
  expectedReviewHours?: number | null; activeCases: number; pendingOffers: number;
};
export type Referral = {
  id: string; type: "TRANSFER" | "SECOND_OPINION"; status: string; fromConsultantName?: string | null; clinicalReason: string;
  suggestedCareArea?: string | null; suggestedCapability?: string | null; suggestedPractitionerId?: string | null; suggestedConsultantName?: string | null;
  targetCareArea?: string | null; targetConsultantName?: string | null; coordinatorNote?: string | null; receiverReason?: string | null;
  opinion?: string | null; opinionSubmittedAt?: string | null; createdAt: string; updatedAt: string; version: number; viewerRelation: string;
};

/** The referral wording, from the staff work copy (`portalWork.referrals`), with the counted phrases in the locale's plural forms. */
function useReferralCopy() {
  const work = useWorkCopy();
  const t = work.referrals;
  return {
    ...t,
    reviewTime: (hours: number) => fillTemplate(t.reviewTime, { hours: plural(work.locale, hours, work.plural.reviewHours) }),
    workload: (active: number, pending: number) => [plural(work.locale, active, work.plural.activeCases), pending ? plural(work.locale, pending, work.plural.pendingOffers) : null].filter(Boolean).join(" · "),
    statusText: (status: string) => (Object.hasOwn(t.status, status) ? t.status[status as keyof typeof t.status] : status),
  };
}

function areaName(slug: string | null | undefined, categories: CareCategory[], locale: Locale) {
  const c = categories.find(x => x.slug === slug);
  return c ? (locale === "ar" ? c.nameAr : c.nameEn) : slug ?? "";
}

/** Eligible consultants for a care area, as choosable cards. Loads from the case-scoped coordinator endpoint. */
export function EligibleConsultantPicker({ caseId, careArea, value, onChange, load, empty, footer }: {
  locale: Locale; caseId: string; careArea: string; value: string; onChange: (practitionerId: string) => void; load: Load;
  /** What the caller can do next when nobody is eligible; without it the message stands alone. */
  empty?: React.ReactNode;
  /** Shown under the list only when someone is eligible (the caller's submit): nothing to submit, no button. */
  footer?: React.ReactNode;
}) {
  const t = useReferralCopy();
  // The answer belongs to one case + care area: until THAT read answers, the list is loading.
  const key = careArea ? `${caseId}|${careArea}` : null;
  const [result, setResult] = useState<{ key: string; rows: EligibleConsultant[] } | null>(null);
  useEffect(() => {
    if (!key) return;
    let live = true;
    void load<EligibleConsultant[]>(`/coordinator/cases/${caseId}/eligible-consultants?careArea=${encodeURIComponent(careArea)}`)
      .then(r => { if (live) setResult({ key, rows: r ?? [] }); }).catch(() => { if (live) setResult({ key, rows: [] }); });
    return () => { live = false; };
  }, [key, caseId, careArea, load]);
  const rows = !key ? [] : result?.key === key ? result.rows : null;
  if (rows === null) return <p role="status" className="text-sm text-ink-500">{t.loading}</p>;
  if (!rows.length) return <div><p role="status" className="text-[0.9375rem] font-semibold text-ink-800">{t.noneEligible}</p>{empty}</div>;
  return <><fieldset>
    <legend className="text-sm font-bold">{t.choose}</legend>
    <p className="text-[0.8125rem] text-ink-500">{t.chooseHint}</p>
    <div className="mt-2 grid gap-2 md:grid-cols-2">{rows.map(c => <label key={c.practitionerId} className={`flex cursor-pointer gap-3 rounded-lg border p-3 text-sm ${value === c.practitionerId ? "border-brand-500 bg-brand-50" : "border-line"}`}>
      <input type="radio" name={`consultant-${caseId}`} className="mt-1" checked={value === c.practitionerId} onChange={() => onChange(c.practitionerId)}/>
      <span className="min-w-0">
        <strong className="block text-ink-900">{c.displayName}</strong>
        <span className="block text-ink-600">{[c.specialty, c.subspecialty].filter(Boolean).join(" · ")}</span>
        {c.capabilities.length > 0 && <span className="mt-1 flex flex-wrap gap-1">{c.capabilities.map(k => <span key={`${k.type}:${k.code}`} className="rounded-full bg-mist px-2 py-0.5 text-[0.8125rem] font-semibold text-ink-700">{k.label}</span>)}</span>}
        <span className="mt-1 block text-[0.8125rem] text-ink-500">{[c.expectedReviewHours ? t.reviewTime(c.expectedReviewHours) : null, t.workload(c.activeCases, c.pendingOffers), c.languages].filter(Boolean).join(" · ")}</span>
        {c.matchedBy === "APPROVED_CAPABILITY" && <span className="mt-1 block text-[0.8125rem] font-semibold text-brand-700">{t.viaCapability}</span>}
      </span>
    </label>)}</div>
  </fieldset>{footer}</>;
}

/** The coordinator's half of a consultant referral: confirm the handover to an eligible consultant, or decline it. */
export function ReferralConfirmation({ locale, caseId, careCategory, categories, busy, load, mutate }: {
  locale: Locale; caseId: string; careCategory?: string; categories: CareCategory[]; busy: boolean; load: Load; mutate: Mutate;
}) {
  const t = useReferralCopy();
  const [referral, setReferral] = useState<Referral | null | undefined>(undefined);
  const [area, setArea] = useState("");
  const [chosen, setChosen] = useState("");
  const [declining, setDeclining] = useState(false);
  // The suggested (or the case's) area stays listed even when the category list lacks it; with no area the coordinator
  // chooses one, so the select never shows one area while the consultant search uses another.
  const work = useWorkCopy(); const empty = work.empty;
  const areaOptions = area && !categories.some(c => c.slug === area) ? [...categories, { slug: area, nameEn: careAreaLabel(area, work.careAreas), nameAr: careAreaLabel(area, work.careAreas) }] : categories;
  useEffect(() => {
    let live = true;
    void load<Referral[]>(`/coordinator/cases/${caseId}/referrals`).then(rows => {
      if (!live) return;
      const open = (rows ?? []).find(r => r.status === "AWAITING_COORDINATOR") ?? null;
      setReferral(open);
      setArea(open?.suggestedCareArea ?? careCategory ?? "");
      setChosen(open?.suggestedPractitionerId ?? "");
    }).catch(() => { if (live) setReferral(null); });
    return () => { live = false; };
  }, [caseId, careCategory, load]);
  if (referral === undefined) return <p role="status" className="text-sm text-ink-500">{t.loading}</p>;
  if (!referral) return <p className="text-sm text-ink-500">{t.noOpen}</p>;
  return <div className="space-y-3">
    <div className="border-y border-line py-3 text-sm">
      <p className="font-bold text-ink-900">{referral.type === "TRANSFER" ? t.transfer : t.secondOpinion} · {fillTemplate(t.requestedBy, { name: `⁨${referral.fromConsultantName ?? ""}⁩` })}</p>
      <p className="mt-1 whitespace-pre-wrap text-ink-700"><span className="font-semibold">{t.reason}:</span> <bdi dir="auto">{referral.clinicalReason}</bdi></p>
      {(referral.suggestedCareArea || referral.suggestedCapability || referral.suggestedConsultantName) && <p className="mt-1 text-ink-600"><span className="font-semibold">{t.suggested}:</span> {[areaName(referral.suggestedCareArea, categories, locale), referral.suggestedCapability, referral.suggestedConsultantName].filter(Boolean).join(" · ")}</p>}
      {referral.receiverReason && <p className="mt-1 text-alert-800"><span className="font-semibold">{t.declinedBy}:</span> {referral.receiverReason}</p>}
    </div>
    <label className="block max-w-sm text-sm font-bold">{t.careArea}
      <select className="field mt-1.5" value={area} required onChange={e => { setArea(e.target.value); setChosen(""); }}>
        {!area && <option value="" disabled>{empty.chooseArea}</option>}
        {areaOptions.map(c => <option key={c.slug} value={c.slug}>{locale === "ar" ? c.nameAr : c.nameEn}</option>)}
      </select>
    </label>
    <EligibleConsultantPicker locale={locale} caseId={caseId} careArea={area} value={chosen} onChange={setChosen} load={load}/>
    {declining ? <form className="flex flex-wrap items-end gap-2" onSubmit={e => { e.preventDefault(); const note = String(new FormData(e.currentTarget).get("note") ?? "").trim(); if (note) void mutate(`/coordinator/cases/${caseId}/referrals/${referral.id}/decline`, { note, expectedVersion: referral.version }); }}>
        <label className="block min-w-60 flex-1 text-sm font-bold">{t.declineNote}<input name="note" required maxLength={500} className="field mt-1.5"/></label>
        <button className="btn-primary" disabled={busy}>{t.sendDecline}</button><button type="button" className="btn-secondary" onClick={() => setDeclining(false)}>{t.cancel}</button>
      </form>
      : <form className="grid gap-3 sm:grid-cols-[1fr_auto_auto] sm:items-end" onSubmit={e => { e.preventDefault(); const note = String(new FormData(e.currentTarget).get("note") ?? "").trim(); if (chosen) void mutate(`/coordinator/cases/${caseId}/referrals/${referral.id}/confirm`, { practitionerId: chosen, careArea: area, note: note || null, expectedVersion: referral.version }); }}>
        <label className="block text-sm font-bold">{t.note}<input name="note" maxLength={500} className="field mt-1.5"/></label>
        <button className="btn-primary" disabled={!chosen || busy}>{t.confirm}</button>
        <button type="button" className="btn-secondary" onClick={() => setDeclining(true)}>{t.decline}</button>
      </form>}
  </div>;
}

/**
 * The consultant's referrals on a case: what they asked for and where it stands, the form to refer (primary consultant
 * under review only), and — for a consultant asked for a second opinion — the opinion form.
 */
export function ConsultantReferrals({ locale, caseId, careCategory, categories, canRefer, busy, load, mutate }: {
  locale: Locale; caseId: string; careCategory?: string; categories: CareCategory[]; canRefer: boolean; busy: boolean; load: Load; mutate: Mutate;
}) {
  const t = useReferralCopy();
  const [rows, setRows] = useState<Referral[]>([]);
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<"TRANSFER" | "SECOND_OPINION">("SECOND_OPINION");
  // Submitting the opinion ends this consultant's access, so it is confirmed first.
  const [pendingOpinion, setPendingOpinion] = useState<string | null>(null);
  // The opinion form goes away once it is sent; the focus moves to the referrals section rather than the page body.
  const section = useRef<HTMLElement>(null);
  const confirmCopy = useWorkCopy().confirm;
  const [area, setArea] = useState("");
  const [candidates, setCandidates] = useState<EligibleConsultant[]>([]);
  const [version, setVersion] = useState(0);
  const reloadRows = () => setVersion(v => v + 1);
  useEffect(() => {
    let live = true;
    void load<Referral[]>(`/doctor/cases/${caseId}/referrals`).then(r => { if (live) setRows(r ?? []); }).catch(() => { if (live) setRows([]); });
    return () => { live = false; };
  }, [caseId, load, version]);
  const lookup = area || careCategory || "";
  useEffect(() => {
    if (!open || !lookup) return;
    let live = true;
    void load<EligibleConsultant[]>(`/doctor/referral-candidates?careArea=${encodeURIComponent(lookup)}`).then(r => { if (live) setCandidates(r ?? []); }).catch(() => { if (live) setCandidates([]); });
    return () => { live = false; };
  }, [open, lookup, load]);
  const secondOpinion = rows.find(r => r.viewerRelation === "RECEIVER" && r.type === "SECOND_OPINION" && r.status === "IN_PROGRESS");
  const openOfType = (kind: string) => rows.some(r => r.viewerRelation === "REFERRER" && r.type === kind && ["AWAITING_COORDINATOR", "AWAITING_CONSULTANT", "IN_PROGRESS"].includes(r.status));
  if (!rows.length && !canRefer && !secondOpinion) return null;
  return <section ref={section} tabIndex={-1} className="space-y-4 border-t border-line pt-4 outline-none" aria-label={t.referrals}>
    {secondOpinion && <form id="case-actions" className="space-y-2" onSubmit={e => { e.preventDefault(); const opinion = String(new FormData(e.currentTarget).get("opinion") ?? "").trim(); if (opinion) setPendingOpinion(opinion); }}>
      <h3 className="text-[1.0625rem] font-bold text-brand-900">{t.yourOpinion}</h3>
      <p className="whitespace-pre-wrap border-y border-line py-3 text-sm text-ink-700"><span className="font-semibold">{t.reason}:</span> <bdi dir="auto">{secondOpinion.clinicalReason}</bdi> ({fillTemplate(t.requestedBy, { name: `⁨${secondOpinion.fromConsultantName ?? ""}⁩` })})</p>
      <textarea name="opinion" required maxLength={20000} dir="auto" className="field min-h-32" aria-label={t.yourOpinion} aria-describedby="second-opinion-hint"/>
      <p id="second-opinion-hint" className="text-[0.8125rem] text-ink-500">{t.opinionHint}</p>
      <button className="btn-primary" disabled={busy}>{t.submitOpinion}</button>
    </form>}
    {secondOpinion && pendingOpinion !== null && <ConfirmDialog title={confirmCopy.opinionTitle} body={confirmCopy.opinionBody} confirm={confirmCopy.opinion} cancel={confirmCopy.keepEditing}
      onCancel={() => setPendingOpinion(null)}
      onConfirm={() => { const opinion = pendingOpinion; setPendingOpinion(null); void mutate(`/doctor/cases/${caseId}/referrals/${secondOpinion.id}/opinion`, { opinion }).then(result => { reloadRows(); if (result) section.current?.focus(); }); }}/>}

    {rows.filter(r => r !== secondOpinion).length > 0 && <div>
      <h3 className="text-[1.0625rem] font-bold text-brand-900">{t.referrals}</h3>
      <ul className="mt-2 divide-y divide-line text-sm">{rows.filter(r => r !== secondOpinion).map(r => <li key={r.id} className="py-2">
        <p><strong>{r.type === "TRANSFER" ? t.transfer : t.secondOpinion}</strong>{r.targetConsultantName ? <> <bdi>{fillTemplate(t.to, { name: r.targetConsultantName })}</bdi></> : null} · {t.statusText(r.status)}</p>
        {r.coordinatorNote && <p className="text-ink-600">{t.coordinatorNote}: <bdi dir="auto">{r.coordinatorNote}</bdi></p>}
        {r.opinion && r.viewerRelation === "REFERRER" && <p className="mt-1 whitespace-pre-wrap text-ink-800"><span className="font-semibold">{t.opinion}:</span> <bdi dir="auto">{r.opinion}</bdi></p>}
      </li>)}</ul>
    </div>}

    {canRefer && (open ? <form className="space-y-3" onSubmit={e => {
      e.preventDefault();
      const f = new FormData(e.currentTarget);
      const text = (k: string) => { const v = String(f.get(k) ?? "").trim(); return v || null; };
      void mutate(`/doctor/cases/${caseId}/referrals`, { type, clinicalReason: text("clinicalReason"), suggestedCareArea: area || null, suggestedCapability: text("suggestedCapability"), suggestedPractitionerId: text("suggestedPractitionerId") })
        .then(r => { if (r) { setOpen(false); reloadRows(); } });
    }}>
      <h3 className="text-[1.0625rem] font-bold text-brand-900">{t.refer}</h3>
      <p className="text-[0.8125rem] text-ink-500">{t.referHint}</p>
      <fieldset className="grid gap-2 sm:grid-cols-2"><legend className="text-sm font-bold">{t.type}</legend>
        {(["SECOND_OPINION", "TRANSFER"] as const).map(k => <label key={k} className={`flex gap-2 rounded-lg border p-3 text-sm ${type === k ? "border-brand-600" : "border-line"} ${openOfType(k) ? "text-ink-500" : ""}`}>
          <input type="radio" name="type" checked={type === k} disabled={openOfType(k)} onChange={() => setType(k)}/>
          <span><strong className="block">{k === "TRANSFER" ? t.transfer : t.secondOpinion}</strong>{k === "TRANSFER" ? t.transferHint : t.secondHint}</span>
        </label>)}
      </fieldset>
      <label className="block text-sm font-bold">{t.clinicalReason}<textarea name="clinicalReason" required maxLength={4000} dir="auto" className="field mt-1.5 min-h-24"/></label>
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="block text-sm font-bold">{t.suggestArea}<select className="field mt-1.5" value={area} onChange={e => setArea(e.target.value)}>
          <option value="">{t.sameArea}</option>{categories.map(c => <option key={c.slug} value={c.slug}>{locale === "ar" ? c.nameAr : c.nameEn}</option>)}</select></label>
        <label className="block text-sm font-bold">{t.suggestCapability}<input name="suggestedCapability" maxLength={200} className="field mt-1.5"/></label>
        <label className="block text-sm font-bold">{t.suggestConsultant}<select name="suggestedPractitionerId" className="field mt-1.5" defaultValue="">
          <option value="">{t.noSuggestion}</option>{candidates.map(c => <option key={c.practitionerId} value={c.practitionerId}>{c.displayName}{c.subspecialty ? ` · ${c.subspecialty}` : ""}</option>)}</select></label>
      </div>
      {/* Secondary: the review's Submit recommendation stays the view's one filled action while the referral form is open. */}
      <div className="flex flex-wrap gap-2"><button className="btn-secondary" disabled={busy || openOfType(type)}>{t.send}</button><button type="button" className="btn-secondary" onClick={() => setOpen(false)}>{t.cancel}</button></div>
    </form> : <button type="button" className="link-cta text-[0.9375rem]" onClick={() => setOpen(true)}>{t.refer}</button>)}
  </section>;
}
