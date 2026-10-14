"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import type { Locale } from "@/lib/i18n";
import { ControlCenterShell } from "./ControlCenterShell";
import { useControlCenterAccess } from "./control-center-access";
import { useAdminApi } from "./admin-api";
import type { Tone } from "./admin-labels";
import { EmptyState, ErrorNotice, Facts, Field, Section, StatusBadge, SuccessNotice } from "./cc-ui";
import { FocusTrapDialog } from "./FocusTrapDialog";
import { facilityText, type FacilityCopy } from "./facility-copy";

type Accreditation = { id: string; body: string; referenceNumber?: string | null; issuedOn?: string | null; expiresOn: string; status: string; recordedBy: string };
type Package = { id: string; facilityId: string; facilityName?: string | null; procedureCode: string; name: string; careCategory: string; minEgp: number; maxEgp: number;
  inclusions: string; exclusions?: string | null; validFrom: string; validTo?: string | null; version: number; approvalStatus: string; proposedBy: string; decidedBy?: string | null; decisionNote?: string | null };
type Facility = { id: string; name: string; city: string; kind: string; status: string; accreditationStatus: string; contactName?: string | null; contactEmail?: string | null;
  contactPhone?: string | null; settlementTerms: string; settlementNotes?: string | null; accreditations: Accreditation[]; packages: Package[] };
type CareArea = { slug: string; nameEn: string; nameAr: string };
type Decision = { kind: "approve" | "reject" | "retire"; pkg: Package };

const ACCREDITATION_TONE: Record<string, Tone> = { NONE: "neutral", CURRENT: "success", EXPIRED: "danger" };
const RECORD_TONE: Record<string, Tone> = { CURRENT: "success", EXPIRED: "danger", WITHDRAWN: "neutral" };
const APPROVAL_TONE: Record<string, Tone> = { PENDING_FINANCE: "warning", APPROVED: "success", REJECTED: "danger", RETIRED: "neutral" };
const DAY_MS = 86_400_000;

/**
 * Commercial › Facilities & Packages (P0-5, review B-02 / A-07). Consultant Operations maintains the facility record, its
 * accreditation records and proposes package price ranges; a Finance Manager approves each range once (the backend also
 * refuses the proposer approving their own version and asks for a recent sign-in). Facilities are a price source and a
 * destination, never users: nothing here invites anyone or grants a role.
 */
export function FacilityCatalog({ locale }: { locale: Locale }) {
  const ar = locale === "ar";
  const t: FacilityCopy = facilityText(locale);
  const { user, loading: authLoading, signIn } = useAuth();
  const access = useControlCenterAccess();
  const api = useAdminApi();
  const [facilities, setFacilities] = useState<Facility[] | null>(null);
  const [careAreas, setCareAreas] = useState<CareArea[]>([]);
  const [pending, setPending] = useState<Package[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [loadError, setLoadError] = useState<unknown>(null); const [saveError, setSaveError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false); const [notice, setNotice] = useState(""); const [decision, setDecision] = useState<Decision | null>(null);
  /** Read once per mount, so "expires in N days" is stable across re-renders (react-hooks/purity). */
  const [now] = useState(() => Date.now());
  const allowed = access.can("FACILITY_READ");
  const canManage = access.can("FACILITY_MANAGE");
  const canApprove = access.can("FACILITY_PACKAGE_APPROVE");
  const read = useCallback(() => Promise.all([api<Facility[]>("/admin/facilities"), api<CareArea[]>("/admin/facilities/care-areas"), api<Package[]>("/admin/facilities/pending-packages")]), [api]);
  const load = useCallback(async () => {
    setLoadError(null);
    try { const [f, a, p] = await read(); setFacilities(f); setCareAreas(a); setPending(p); }
    catch (e) { setLoadError(e); setFacilities([]); }
  }, [read]);
  useEffect(() => {
    if (!user || !allowed) return;
    let live = true;
    read().then(([f, a, p]) => { if (live) { setFacilities(f); setCareAreas(a); setPending(p); } }, (e) => { if (live) { setLoadError(e); setFacilities([]); } });
    return () => { live = false; };
  }, [user, allowed, read]);

  /** One write, then the whole page reloads: lists, the queue and the selected facility stay one truth. */
  const act = async (call: () => Promise<unknown>, done: string, form?: HTMLFormElement) => {
    setBusy(true); setSaveError(null); setNotice("");
    try { await call(); form?.reset(); setNotice(done); await load(); return true; }
    catch (e) { setSaveError(e); return false; } finally { setBusy(false); }
  };
  const text = (d: FormData, key: string) => { const v = String(d.get(key) ?? "").trim(); return v === "" ? null : v; };
  const facilityBody = (d: FormData) => ({ name: text(d, "name"), city: text(d, "city"), kind: text(d, "kind"), settlementTerms: text(d, "settlementTerms"), settlementNotes: text(d, "settlementNotes"),
    contactName: text(d, "contactName"), contactEmail: text(d, "contactEmail"), contactPhone: text(d, "contactPhone") });
  const createFacility = (e: React.FormEvent<HTMLFormElement>) => { e.preventDefault(); const form = e.currentTarget; void act(() => api("/admin/facilities", { method: "POST", body: facilityBody(new FormData(form)) }), t.saved, form); };
  const updateFacility = (id: string) => (e: React.FormEvent<HTMLFormElement>) => { e.preventDefault(); const form = e.currentTarget; void act(() => api(`/admin/facilities/${id}`, { method: "PUT", body: facilityBody(new FormData(form)) }), t.saved).then((ok) => { if (ok) setEditing(false); }); };
  const setStatus = (id: string, status: string) => void act(() => api(`/admin/facilities/${id}/status`, { method: "PUT", body: { status } }), t.saved);
  const recordAccreditation = (id: string) => (e: React.FormEvent<HTMLFormElement>) => { e.preventDefault(); const form = e.currentTarget; const d = new FormData(form);
    void act(() => api(`/admin/facilities/${id}/accreditations`, { method: "POST", body: { body: text(d, "body"), referenceNumber: text(d, "referenceNumber"), issuedOn: text(d, "issuedOn"), expiresOn: text(d, "expiresOn") } }), t.accreditationRecorded, form); };
  const withdraw = (facilityId: string, accreditationId: string) => void act(() => api(`/admin/facilities/${facilityId}/accreditations/${accreditationId}/withdraw`, { method: "POST" }), t.accreditationWithdrawn);
  const propose = (id: string) => (e: React.FormEvent<HTMLFormElement>) => { e.preventDefault(); const form = e.currentTarget; const d = new FormData(form);
    void act(() => api(`/admin/facilities/${id}/packages`, { method: "POST", body: { procedureCode: text(d, "procedureCode"), name: text(d, "name"), careCategory: text(d, "careCategory"), minEgp: Number(d.get("minEgp")), maxEgp: Number(d.get("maxEgp")),
      inclusions: text(d, "inclusions"), exclusions: text(d, "exclusions"), validFrom: text(d, "validFrom"), validTo: text(d, "validTo") } }), t.proposed, form); };
  const decide = async (note: string | null) => {
    if (!decision) return;
    const { kind, pkg } = decision;
    const done = kind === "approve" ? t.approved : kind === "reject" ? t.rejected : t.retired;
    const ok = await act(() => api(`/admin/facilities/${pkg.facilityId}/packages/${pkg.id}/${kind}`, { method: "POST", body: { note } }), done);
    if (ok) setDecision(null);
  };

  const areaName = (slug: string) => { const found = careAreas.find((c) => c.slug === slug); return found ? (ar ? found.nameAr : found.nameEn) : slug; };
  const date = (d?: string | null) => d ? new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(new Date(d)) : null;
  const egp = new Intl.NumberFormat(ar ? "ar-EG" : "en-EG", { style: "currency", currency: "EGP", maximumFractionDigits: 0 });
  const range = (p: Package) => `${egp.format(p.minEgp)} – ${egp.format(p.maxEgp)}`;
  const daysLeft = (expiresOn: string) => Math.ceil((new Date(expiresOn).getTime() - now) / DAY_MS);
  const label = (map: Record<string, string>, key: string) => map[key] ?? key;
  const options = (map: Record<string, string>) => Object.entries(map).map(([k, v]) => <option key={k} value={k}>{v}</option>);

  const shell = (body: React.ReactNode) => <ControlCenterShell locale={locale} active="facilities" title={t.title} intro={t.intro}>{body}</ControlCenterShell>;
  if (authLoading) return shell(<p role="status">{t.loading}</p>);
  if (!user) return shell(<button onClick={() => void signIn()}>{t.signIn}</button>);
  if (!allowed) return shell(<EmptyState title={t.deniedTitle} body={t.deniedBody} />);
  if (facilities === null) return shell(<p role="status">{t.loadingFacilities}</p>);
  if (loadError) return shell(<ErrorNotice error={loadError} locale={locale} action="load" onRetry={() => void load()} />);
  const selected = facilities.find((f) => f.id === selectedId) ?? null;

  const facilityFields = (f?: Facility) => <>
    <Field label={t.name} required><input name="name" required maxLength={200} defaultValue={f?.name ?? ""} /></Field>
    <Field label={t.city} required><input name="city" required maxLength={120} defaultValue={f?.city ?? ""} /></Field>
    <Field label={t.kind} required><select name="kind" required defaultValue={f?.kind ?? "HOSPITAL"}>{options(t.kinds)}</select></Field>
    <Field label={t.settlementTerms} required><select name="settlementTerms" required defaultValue={f?.settlementTerms ?? "NET_30"}>{options(t.settlement)}</select></Field>
    <Field label={t.settlementNotes}><input name="settlementNotes" maxLength={1000} defaultValue={f?.settlementNotes ?? ""} /></Field>
    <Field label={t.contactName}><input name="contactName" maxLength={160} defaultValue={f?.contactName ?? ""} /></Field>
    <Field label={t.contactEmail} hint={t.contactEmailHint}><input name="contactEmail" type="email" maxLength={255} dir="ltr" defaultValue={f?.contactEmail ?? ""} /></Field>
    <Field label={t.contactPhone}><input name="contactPhone" type="tel" maxLength={40} dir="ltr" defaultValue={f?.contactPhone ?? ""} /></Field>
  </>;

  const packageRow = (p: Package, showFacility: boolean) => <li key={p.id}>
    <span><strong><bdi dir="ltr">{p.procedureCode}</bdi> · {p.name}</strong>{showFacility && p.facilityName ? <span className="cc-meta"> · {p.facilityName}</span> : null}<br />
      <span className="cc-meta">{t.version(p.version)} · {areaName(p.careCategory)} · {t.validFrom} {date(p.validFrom)}{p.validTo ? ` · ${t.validTo} ${date(p.validTo)}` : ""}</span></span>
    <span><bdi dir="ltr">{range(p)}</bdi></span>
    <span><StatusBadge tone={APPROVAL_TONE[p.approvalStatus] ?? "neutral"}>{label(t.approval, p.approvalStatus)}</StatusBadge>{p.decisionNote ? <span className="cc-meta"> {p.decisionNote}</span> : null}</span>
    <span className="cc-row-actions" role="group" aria-label={t.packageActions(p.procedureCode)}>
      {canApprove && p.approvalStatus === "PENDING_FINANCE" && <><button type="button" disabled={busy} onClick={() => setDecision({ kind: "approve", pkg: p })}>{t.approve}</button>
        <button type="button" className="cc-secondary" disabled={busy} onClick={() => setDecision({ kind: "reject", pkg: p })}>{t.reject}</button></>}
      {canManage && (p.approvalStatus === "PENDING_FINANCE" || p.approvalStatus === "APPROVED") && <button type="button" className="cc-secondary" disabled={busy} onClick={() => setDecision({ kind: "retire", pkg: p })}>{t.retire}</button>}
    </span>
  </li>;

  return shell(<>
    <p className="cc-internal" role="note"><strong>{t.internalNote}</strong> {t.internalBody}</p>
    <SuccessNotice>{notice || null}</SuccessNotice>
    <ErrorNotice error={saveError} locale={locale} />
    {canApprove && <Section id="pending" title={t.pendingQueue} description={t.pendingQueueIntro}>
      {pending.length === 0 ? <p className="cc-meta">{t.nothingPending}</p> : <ul className="cc-list">{pending.map((p) => packageRow(p, true))}</ul>}
    </Section>}
    {!selected && <Section id="facilities" title={t.facilities}>
      {facilities.length === 0 ? <EmptyState title={t.noFacilities} body={canManage ? t.noFacilitiesBody : undefined} />
        : <ul className="cc-list">{facilities.map((f) => <li key={f.id}>
          <span><strong>{f.name}</strong><br /><span className="cc-meta">{f.city} · {label(t.kinds, f.kind)} · {label(t.settlement, f.settlementTerms)}</span></span>
          <span><StatusBadge tone={ACCREDITATION_TONE[f.accreditationStatus] ?? "neutral"}>{label(t.accreditation, f.accreditationStatus)}</StatusBadge></span>
          <span><StatusBadge tone={f.status === "ACTIVE" ? "success" : "danger"}>{label(t.status, f.status)}</StatusBadge></span>
          <span className="cc-row-actions"><button type="button" className="cc-secondary" onClick={() => { setSelectedId(f.id); setEditing(false); }} aria-label={t.openFacility(f.name)}>{t.openFacility(f.name)}</button></span>
        </li>)}</ul>}
      {canManage && <form className="cc-form-grid" onSubmit={createFacility} aria-label={t.newFacilityForm}>
        {facilityFields()}
        <div className="cc-form-actions"><button disabled={busy}>{t.addFacility}</button></div>
      </form>}
    </Section>}
    {selected && <>
      <Section id="facility" title={selected.name} description={`${selected.city} · ${label(t.kinds, selected.kind)}`}
        actions={<>
          <button type="button" className="cc-secondary" onClick={() => { setSelectedId(null); setEditing(false); }}>{t.back}</button>
          {canManage && <button type="button" className="cc-secondary" aria-pressed={editing} onClick={() => setEditing((v) => !v)}>{t.editFacility}</button>}
          {canManage && (selected.status === "ACTIVE"
            ? <button type="button" className="cc-secondary" disabled={busy} onClick={() => setStatus(selected.id, "SUSPENDED")}>{t.suspend}</button>
            : <button type="button" disabled={busy} onClick={() => setStatus(selected.id, "ACTIVE")}>{t.reactivate}</button>)}
        </>}>
        <p><StatusBadge tone={selected.status === "ACTIVE" ? "success" : "danger"}>{label(t.status, selected.status)}</StatusBadge> <StatusBadge tone={ACCREDITATION_TONE[selected.accreditationStatus] ?? "neutral"}>{label(t.accreditation, selected.accreditationStatus)}</StatusBadge></p>
        {editing ? <form className="cc-form-grid" onSubmit={updateFacility(selected.id)} aria-label={t.editFacility}>
          {facilityFields(selected)}
          <div className="cc-form-actions"><button disabled={busy}>{t.save}</button><button type="button" className="cc-secondary" onClick={() => setEditing(false)}>{t.cancel}</button></div>
        </form>
        : <Facts items={[[t.settlementTerms, `${label(t.settlement, selected.settlementTerms)}${selected.settlementNotes ? ` · ${selected.settlementNotes}` : ""}`],
          [t.contactName, selected.contactName ?? "—"], [t.contactEmail, selected.contactEmail ? <bdi dir="ltr">{selected.contactEmail}</bdi> : "—"], [t.contactPhone, selected.contactPhone ? <bdi dir="ltr">{selected.contactPhone}</bdi> : "—"]]} />}
      </Section>
      <Section id="accreditations" title={t.accreditations} description={t.accreditationsIntro}>
        {selected.accreditations.length === 0 ? <p className="cc-meta">{t.noAccreditations}</p> : <ul className="cc-list">{selected.accreditations.map((a) => {
          const left = a.status === "CURRENT" ? daysLeft(a.expiresOn) : null;
          return <li key={a.id}>
            <span><strong>{a.body}</strong>{a.referenceNumber ? <span className="cc-meta"> · <bdi dir="ltr">{a.referenceNumber}</bdi></span> : null}</span>
            <span>{t.expiresOn} {date(a.expiresOn)}{left !== null && left <= 60 ? <span className="cc-meta"> · {t.expiresIn(Math.max(left, 0))}</span> : null}</span>
            <span><StatusBadge tone={RECORD_TONE[a.status] ?? "neutral"}>{label(t.accreditationStatus, a.status)}</StatusBadge></span>
            <span className="cc-row-actions">{canManage && a.status === "CURRENT" && <button type="button" className="cc-secondary" disabled={busy} onClick={() => withdraw(selected.id, a.id)}>{t.withdraw}</button>}</span>
          </li>;
        })}</ul>}
        {canManage && <form className="cc-filterbar" onSubmit={recordAccreditation(selected.id)} aria-label={t.addAccreditation}>
          <Field label={t.body} hint={t.bodyHint} required><input name="body" required maxLength={80} list="accrediting-bodies" /><datalist id="accrediting-bodies"><option value="JCI" /><option value="GAHAR" /><option value="ISO 9001" /></datalist></Field>
          <Field label={t.reference}><input name="referenceNumber" maxLength={160} dir="ltr" /></Field>
          <Field label={t.issuedOn}><input name="issuedOn" type="date" dir="ltr" /></Field>
          <Field label={t.expiresOn} required><input name="expiresOn" type="date" required dir="ltr" /></Field>
          <button disabled={busy}>{t.addAccreditation}</button>
        </form>}
      </Section>
      <Section id="packages" title={t.packages} description={t.packagesIntro}>
        {selected.packages.length === 0 ? <p className="cc-meta">{t.noPackages}</p> : <ul className="cc-list">{selected.packages.map((p) => packageRow(p, false))}</ul>}
        {canManage && selected.status === "ACTIVE" && <form className="cc-form-grid" onSubmit={propose(selected.id)} aria-label={t.newPackageForm}>
          <Field label={t.procedureCode} hint={t.procedureCodeHint} required><input name="procedureCode" required maxLength={40} dir="ltr" /></Field>
          <Field label={t.packageName} required><input name="name" required maxLength={200} /></Field>
          <Field label={t.careArea} required><select name="careCategory" required>{careAreas.map((a) => <option key={a.slug} value={a.slug}>{ar ? a.nameAr : a.nameEn}</option>)}</select></Field>
          <Field label={t.minEgp} required><input name="minEgp" type="number" min="0" step="1" required dir="ltr" /></Field>
          <Field label={t.maxEgp} required><input name="maxEgp" type="number" min="0" step="1" required dir="ltr" /></Field>
          <Field label={t.inclusions} hint={t.inclusionsHint} required><textarea name="inclusions" required maxLength={2000} rows={3} /></Field>
          <Field label={t.exclusions}><textarea name="exclusions" maxLength={2000} rows={2} /></Field>
          <Field label={t.validFrom} required><input name="validFrom" type="date" required dir="ltr" defaultValue={new Date().toISOString().slice(0, 10)} /></Field>
          <Field label={t.validTo} hint={t.validToHint}><input name="validTo" type="date" dir="ltr" /></Field>
          <div className="cc-form-actions"><button disabled={busy}>{t.proposePackage}</button></div>
        </form>}
      </Section>
    </>}
    {decision && <FocusTrapDialog label={decision.kind === "approve" ? t.approveTitle : decision.kind === "reject" ? t.rejectTitle : t.retireTitle} onClose={busy ? () => undefined : () => setDecision(null)}>
      <form onSubmit={(e) => { e.preventDefault(); void decide(text(new FormData(e.currentTarget), "note")); }}>
        <h2>{decision.kind === "approve" ? t.approveTitle : decision.kind === "reject" ? t.rejectTitle : t.retireTitle}</h2>
        <p><strong><bdi dir="ltr">{decision.pkg.procedureCode}</bdi> · {decision.pkg.name}</strong> · {t.version(decision.pkg.version)} · <bdi dir="ltr">{range(decision.pkg)}</bdi>{decision.pkg.facilityName ? ` · ${decision.pkg.facilityName}` : ""}</p>
        <ul className="cc-consequences">
          {decision.kind === "approve" && <><li>{t.approveConsequence1}</li><li>{t.approveConsequence2}</li></>}
          {decision.kind === "reject" && <li>{t.rejectConsequence}</li>}
          {decision.kind === "retire" && <li>{t.retireConsequence}</li>}
          {decision.kind !== "retire" && <li>{t.freshSignIn}</li>}
        </ul>
        <Field label={decision.kind === "reject" ? t.reason : t.note} required={decision.kind === "reject"}><textarea name="note" maxLength={500} rows={2} required={decision.kind === "reject"} /></Field>
        <div className="cc-form-actions"><button disabled={busy}>{t.confirm}</button><button type="button" className="cc-secondary" disabled={busy} onClick={() => setDecision(null)}>{t.cancel}</button></div>
      </form>
    </FocusTrapDialog>}
  </>);
}
