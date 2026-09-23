"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { AlertTriangle, Check, Clock, Info, Upload } from "lucide-react";
import { useAuth } from "@/components/AuthProvider";
import type { Locale } from "@/lib/i18n";
import { useAdminApi, type AdminApi } from "./admin-api";
import { ControlCenterError, EmptyState, ErrorNotice, Field, StatusBadge, SuccessNotice } from "./cc-ui";
import { blockerInfo, credentialDisplayStatus, credentialIsExpired, credentialTypeLabel, formatDate, relationshipLabel, type SetupArea } from "./admin-labels";
import { ccHref } from "./control-center-nav";
import { personName, type ProviderDetail } from "./provider-directory";

export type Onboarding = { organizationId: string; practitionerId: string; clinicianType: string; status: string; jurisdiction: string | null; version: number; ownerSubject: string };
export type Blocker = { code: string; message: string };
export type Readiness = { identityProvisioned: boolean; organizationMembershipActive: boolean; providerProfileComplete: boolean; clinicianProfileComplete: boolean; requiredCredentialsSubmitted: boolean; requiredCredentialsVerified: boolean; mandatoryCredentialsUnexpired: boolean; requiredRelationshipsComplete: boolean; pricingSetupRequired: boolean; pricingSetupComplete: boolean; availabilitySetupRequired: boolean; availabilitySetupComplete: boolean; credentialReady: boolean; blockers: Blocker[]; readyForActivation: boolean; evaluatedAt: string };
export type Requirement = { type: string; displayName: string; mandatory: boolean; expiryRequired: boolean };
export type Revision = { id: string; organizationId: string; practitionerId: string; ownerSubject: string; credentialType: string; revisionNumber: number; status: string; dossierStatus: string; expiresAt: string | null; submittedBy: string; submittedAt: string; version: number; evidenceIds: string[] };

/** Everything one clinician's setup screens read, from existing endpoints only. The backend readiness stays authoritative. */
export function useClinician(organizationId: string, practitionerId: string) {
  const { user } = useAuth();
  const api = useAdminApi();
  const [detail, setDetail] = useState<ProviderDetail | null>(null);
  const [onboarding, setOnboarding] = useState<Onboarding | null>(null);
  const [readiness, setReadiness] = useState<Readiness | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const base = `/admin/providers/${organizationId}`;
  const signedIn = !!user;
  const reload = useCallback(async () => {
    if (!user) { setLoading(false); return; }
    setError(null);
    try {
      const [d, o] = await Promise.all([api<ProviderDetail>(base), api<Onboarding>(`${base}/clinicians/${practitionerId}/onboarding`)]);
      setDetail(d); setOnboarding(o);
      setReadiness(await api<Readiness>(`${base}/clinicians/${practitionerId}/readiness`).catch(() => null));
    } catch (e) { setError(e); } finally { setLoading(false); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [base, practitionerId, signedIn]);
  useEffect(() => { void reload(); }, [reload]);
  const member = detail?.members.find((m) => m.practitionerId === practitionerId) ?? null;
  return { api, detail, onboarding, readiness, member, loading, error, reload };
}

/**
 * Commercial & Legal Acceptance has no command anywhere in the current release: the backend reports it as a
 * permanent `COMMERCIAL_ACCEPTANCE_MISSING` blocker (fail-closed by design). Flip this when the acceptance step ships,
 * so the blocker is then shown as an ordinary, achievable prerequisite.
 */
export const COMMERCIAL_ACCEPTANCE_IN_RELEASE = false;
export const COMMERCIAL_ACCEPTANCE_MISSING = "COMMERCIAL_ACCEPTANCE_MISSING";
/** True when activation cannot complete in this release, whatever else is done (UX-0 Decision D, case 3). */
export const activationUnavailable = (readiness: Readiness | null) =>
  !COMMERCIAL_ACCEPTANCE_IN_RELEASE && !!readiness?.blockers.some((b) => b.code === COMMERCIAL_ACCEPTANCE_MISSING);
/** The approved "Activation isn't available yet" state: information, never a disabled primary button. */
export function ActivationUnavailable({ locale, subject }: { locale: Locale; subject: "organization" | "consultant" }) {
  const ar = locale === "ar";
  const who = subject === "organization" ? (ar ? "هذه المؤسسة" : "this organization") : (ar ? "هذا الاستشاري" : "this consultant");
  return (
    <div className="cc-notice cc-notice-info" role="note" aria-labelledby={`activation-unavailable-${subject}`}>
      <Info size={18} aria-hidden />
      <div>
        <p id={`activation-unavailable-${subject}`}><strong>{ar ? "التفعيل غير متاح بعد" : "Activation isn't available yet"}</strong></p>
        <p>{ar
          ? `يجب إكمال القبول التجاري والقانوني قبل أن يتمكن ${who} من استقبال الحالات. هذه الخطوة غير متاحة في الإصدار الحالي. يمكنك إكمال بقية الإعداد الآن. لن تُوجَّه أي حالات إلى ${who} حتى يصبح التفعيل متاحًا.`
          : `Commercial & Legal Acceptance must be completed before ${who} can receive cases. That step isn't available in the current release. You can complete the remaining setup now. No cases will be routed to ${who} until activation becomes available.`}</p>
      </div>
    </div>
  );
}

/** One-line readiness summary that never counts the release-unavailable step as something left to do. */
export function readinessSummary(readiness: Readiness, locale: Locale) {
  const ar = locale === "ar";
  if (readiness.readyForActivation) return ar ? "جاهز للتفعيل" : "Ready to activate";
  const remaining = readiness.blockers.filter((b) => COMMERCIAL_ACCEPTANCE_IN_RELEASE || b.code !== COMMERCIAL_ACCEPTANCE_MISSING).length;
  if (!remaining && activationUnavailable(readiness)) return ar ? "الإعداد مكتمل — التفعيل غير متاح بعد" : "Setup complete — activation isn't available yet";
  return ar ? `${remaining} بنود متبقية` : `${remaining} item${remaining === 1 ? "" : "s"} remaining`;
}

/** Readiness issues for one setup area. The release-unavailable commercial step is not an issue anyone can fix, so it is shown once, in the activation state, instead. */
export const issuesFor = (readiness: Readiness | null, area: SetupArea, locale: Locale) =>
  (readiness?.blockers ?? []).filter((b) => COMMERCIAL_ACCEPTANCE_IN_RELEASE || b.code !== COMMERCIAL_ACCEPTANCE_MISSING)
    .map((b) => ({ ...blockerInfo(b.code, b.message, locale), code: b.code })).filter((b) => b.area === area);

/** Readiness issues shown next to the section that resolves them. */
export function SetupIssues({ issues, locale }: { issues: { label: string; detail: string; code: string }[]; locale: Locale }) {
  if (!issues.length) return null;
  return (
    <div aria-label={locale === "ar" ? "ما يلزم لإكمال هذه الخطوة" : "What this step still needs"}>
      {issues.map((i) => <p key={i.code + i.detail} className="cc-issue"><AlertTriangle size={16} aria-hidden /><span>{i.label}{i.label !== i.detail && <span className="cc-row-sub">{i.detail}</span>}</span></p>)}
    </div>
  );
}

export type ProfessionalProfile = { registrationNumber: string | null; specialty: string | null; subspecialty: string | null; qualifications: string | null; jurisdiction: string | null; version: number };
type ProfileForm = { registrationNumber: string; specialty: string; subspecialty: string; qualifications: string; jurisdiction: string };
const toForm = (p: ProfessionalProfile): ProfileForm => ({ registrationNumber: p.registrationNumber ?? "", specialty: p.specialty ?? "", subspecialty: p.subspecialty ?? "", qualifications: p.qualifications ?? "", jurisdiction: p.jurisdiction ?? "" });

/**
 * Professional details — read back from `GET …/profile` and saved with `PUT …/profile`. The form always starts from the
 * stored values, so editing one field never blanks the others, and it is not offered at all until those values have
 * been read. The save carries the version that was read, so a newer save by someone else is never silently overwritten.
 */
export function ProfessionalDetailsForm({ locale, api, organizationId, onboarding, complete, onSaved, canEdit }: { locale: Locale; api: AdminApi; organizationId: string; onboarding: Onboarding; complete: boolean; onSaved: () => void; canEdit: boolean }) {
  const ar = locale === "ar";
  const [open, setOpen] = useState(!complete);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [loadError, setLoadError] = useState<unknown>(null);
  const [saved, setSaved] = useState(false);
  const [stored, setStored] = useState<ProfessionalProfile | null>(null);
  const [form, setForm] = useState<ProfileForm>({ registrationNumber: "", specialty: "", subspecialty: "", qualifications: "", jurisdiction: onboarding.jurisdiction ?? "" });
  const [touched, setTouched] = useState(false);
  const path = `/admin/providers/${organizationId}/clinicians/${onboarding.practitionerId}/profile`;
  const read = useCallback(async () => {
    setLoadError(null);
    try { const p = await api<ProfessionalProfile>(path); setStored(p); setForm(toForm(p)); } catch (err) { setLoadError(err); }
  }, [api, path]);
  // The saved values are the starting point for any edit; only editors (provider.update) can read them.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { if (canEdit) void read(); }, [canEdit, read, onboarding.version]);
  const missing = (v: string) => touched && !v.trim() ? (ar ? "هذا الحقل مطلوب." : "This field is required.") : undefined;
  const set = (k: keyof ProfileForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setTouched(true);
    if (!stored) return;
    if (!form.registrationNumber.trim() || !form.specialty.trim() || !form.qualifications.trim() || !form.jurisdiction.trim()) return;
    setBusy(true); setError(null); setSaved(false);
    try {
      await api(path, { method: "PUT", body: { ...form, subspecialty: form.subspecialty || null, jurisdiction: form.jurisdiction.trim().toUpperCase(), version: stored.version } });
      setSaved(true); setOpen(false); onSaved();
    } catch (err) { setError(err); } finally { setBusy(false); }
  };
  const summary = stored && complete && !open ? [
    [ar ? "رقم التسجيل المهني" : "Registration number", stored.registrationNumber], [ar ? "دولة الترخيص" : "Licensing country", stored.jurisdiction],
    [ar ? "التخصص" : "Speciality", stored.specialty], [ar ? "التخصص الدقيق" : "Sub-speciality", stored.subspecialty],
  ] as [string, string | null][] : null;
  return (
    <div>
      {complete && !open && <p className="cc-meta"><StatusBadge tone="success">{ar ? "البيانات المهنية محفوظة" : "Professional details saved"}</StatusBadge>{canEdit && stored && <> <button type="button" className="cc-link" onClick={() => { setForm(toForm(stored)); setOpen(true); }}>{ar ? "تعديل البيانات" : "Edit details"}</button></>}</p>}
      {summary && <dl className="cc-facts" aria-label={ar ? "البيانات المهنية المحفوظة" : "Saved professional details"}>{summary.map(([k, v]) => <div key={k}><dt>{k}</dt><dd><bdi>{v || "—"}</bdi></dd></div>)}</dl>}
      <SuccessNotice>{saved ? (ar ? "تم حفظ البيانات المهنية." : "Professional details saved.") : null}</SuccessNotice>
      {canEdit && loadError ? <ErrorNotice error={loadError} locale={locale} action="load" onRetry={() => void read()} /> : null}
      {canEdit && !stored && !loadError && <p role="status" className="cc-meta">{ar ? "جارٍ تحميل البيانات المحفوظة…" : "Loading the saved details…"}</p>}
      {open && canEdit && stored && (
        <form onSubmit={submit} noValidate aria-label={ar ? "البيانات المهنية" : "Professional details"}>
          <ErrorNotice error={error} locale={locale} />
          <div className="cc-form-grid">
            <Field label={ar ? "رقم التسجيل المهني" : "Professional registration number"} required error={missing(form.registrationNumber)}><input dir="ltr" maxLength={100} value={form.registrationNumber} onChange={set("registrationNumber")} aria-required /></Field>
            <Field label={ar ? "دولة الترخيص" : "Licensing country"} hint={ar ? "رمز الدولة من حرفين، مثل EG" : "Two-letter country code, for example EG"} required error={missing(form.jurisdiction)}><input dir="ltr" maxLength={2} value={form.jurisdiction} onChange={set("jurisdiction")} aria-required /></Field>
            <Field label={ar ? "التخصص" : "Speciality"} required error={missing(form.specialty)}><input maxLength={120} value={form.specialty} onChange={set("specialty")} aria-required /></Field>
            <Field label={ar ? "التخصص الدقيق" : "Sub-speciality"} optionalLabel={ar ? "اختياري" : "optional"}><input maxLength={120} value={form.subspecialty} onChange={set("subspecialty")} /></Field>
            <div className="cc-span"><Field label={ar ? "المؤهلات" : "Qualifications"} hint={ar ? "الشهادات والزمالات، سطر لكل مؤهل" : "Degrees and fellowships, one per line"} required error={missing(form.qualifications)}><textarea maxLength={4000} value={form.qualifications} onChange={set("qualifications")} aria-required /></Field></div>
          </div>
          <div className="cc-form-actions">
            <button disabled={busy}>{busy ? (ar ? "جارٍ الحفظ…" : "Saving…") : (ar ? "حفظ البيانات المهنية" : "Save professional details")}</button>
            {complete && <button type="button" className="cc-secondary" onClick={() => setOpen(false)}>{ar ? "إلغاء" : "Cancel"}</button>}
          </div>
        </form>
      )}
    </div>
  );
}

const ACCEPT = ".pdf,.jpg,.jpeg,.png";
const toInstant = (date: string) => (date ? new Date(`${date}T12:00:00Z`).toISOString() : null);

/** Credential requirements from the clinician's credential policy, each with its latest submission and the next action. */
export function CredentialRequirements({ locale, api, organizationId, practitionerId, canSubmit, canReview, onChanged }: { locale: Locale; api: AdminApi; organizationId: string; practitionerId: string; canSubmit: boolean; canReview: boolean; onChanged: () => void }) {
  const ar = locale === "ar";
  const base = `/admin/providers/${organizationId}/clinicians/${practitionerId}`;
  const [requirements, setRequirements] = useState<Requirement[] | null>(null);
  const [revisions, setRevisions] = useState<Revision[]>([]);
  const [policyMissing, setPolicyMissing] = useState(false);
  const [loadError, setLoadError] = useState<unknown>(null);
  const [adding, setAdding] = useState<Requirement | null>(null);
  const load = useCallback(async () => {
    setLoadError(null); setPolicyMissing(false);
    try {
      const [req, rev] = await Promise.all([
        api<Requirement[]>(`${base}/credential-requirements`).catch((e) => { if (e instanceof ControlCenterError && e.code === "CREDENTIAL_POLICY_UNCONFIGURED") { setPolicyMissing(true); return [] as Requirement[]; } throw e; }),
        api<Revision[]>(`${base}/credentials`),
      ]);
      setRequirements(req); setRevisions(rev);
    } catch (e) { setLoadError(e); setRequirements([]); }
  }, [api, base]);
  useEffect(() => { void load(); }, [load]);
  if (requirements === null) return <p role="status">{ar ? "جارٍ تحميل متطلبات الاعتماد…" : "Loading credential requirements…"}</p>;
  if (loadError) return <ErrorNotice error={loadError} locale={locale} action="load" onRetry={() => void load()} />;
  if (policyMissing) return <p className="cc-issue"><AlertTriangle size={16} aria-hidden />{ar ? "لا توجد متطلبات اعتماد لدولة الترخيص هذه بعد. احفظ دولة الترخيص الصحيحة أولًا، أو تواصل مع فريق المنصة." : "There are no credential requirements for this licensing country yet. Save the correct licensing country first, or contact the platform team."}</p>;
  if (!requirements.length) return <EmptyState title={ar ? "لا توجد اعتمادات مطلوبة" : "No credentials are required"} />;
  const latest = (type: string) => revisions.filter((r) => r.credentialType === type).sort((a, b) => b.revisionNumber - a.revisionNumber)[0];
  return (
    <div>
      {requirements.map((req) => {
        const rev = latest(req.type);
        const status = rev ? credentialDisplayStatus(rev.status, rev.expiresAt, locale) : null;
        const expired = !!rev && credentialIsExpired(rev.status, rev.expiresAt);
        const needsNew = !rev || expired || ["REJECTED", "MORE_INFORMATION_REQUIRED"].includes(rev.status);
        return (
          <div key={req.type} className="cc-requirement">
            <div>
              <h3>{req.displayName || credentialTypeLabel(req.type, locale)}{!req.mandatory && <span className="cc-optional"> ({ar ? "اختياري" : "optional"})</span>}</h3>
              <p className="cc-meta">{rev ? <>{ar ? "أُرسل" : "Submitted"} {formatDate(rev.submittedAt, locale)}{rev.expiresAt ? <> · {ar ? "ينتهي" : "Expires"} {formatDate(rev.expiresAt, locale)}</> : null}</> : req.expiryRequired ? (ar ? "يلزم تاريخ انتهاء" : "Expiry date required") : (ar ? "لم يُضف بعد" : "Not added yet")}</p>
              {adding?.type === req.type && <CredentialSubmitForm locale={locale} api={api} organizationId={organizationId} base={base} requirement={req} onCancel={() => setAdding(null)} onSubmitted={() => { setAdding(null); void load(); onChanged(); }} />}
            </div>
            <div className="cc-row-actions">
              {status ? <StatusBadge tone={status.tone}>{status.label}</StatusBadge> : <StatusBadge tone="neutral">{ar ? "مطلوب" : "Needed"}</StatusBadge>}
              {canReview && rev && ["SUBMITTED", "UNDER_REVIEW"].includes(rev.status) && <Link className="cc-secondary cc-small" href={ccHref(locale, `/credentials/${organizationId}/${rev.id}`)}>{ar ? "مراجعة" : "Review"}</Link>}
              {canSubmit && needsNew && adding?.type !== req.type && <button type="button" className={rev ? "cc-secondary cc-small" : "cc-small"} onClick={() => setAdding(req)}><Upload size={15} aria-hidden />{expired ? (ar ? "إرسال تجديد" : "Submit renewal") : rev ? (ar ? "إرسال بديل" : "Submit replacement") : (ar ? "إضافة" : "Add")}</button>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function CredentialSubmitForm({ locale, api, organizationId, base, requirement, onCancel, onSubmitted }: { locale: Locale; api: AdminApi; organizationId: string; base: string; requirement: Requirement; onCancel: () => void; onSubmitted: () => void }) {
  const ar = locale === "ar";
  const [issuer, setIssuer] = useState(""); const [reference, setReference] = useState(""); const [issuedAt, setIssuedAt] = useState(""); const [expiresAt, setExpiresAt] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [touched, setTouched] = useState(false); const [busy, setBusy] = useState(""); const [error, setError] = useState<unknown>(null);
  const req = (v: unknown) => touched && !v ? (ar ? "هذا الحقل مطلوب." : "This field is required.") : undefined;
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setTouched(true);
    if (!issuer.trim() || !reference.trim() || !file || (requirement.expiryRequired && !expiresAt)) return;
    setError(null);
    try {
      setBusy(ar ? "جارٍ رفع المستند…" : "Uploading document…");
      const presign = await api<{ evidenceId: string; uploadUrl: string; requiredHeaders: Record<string, string> }>(`${base}/credential-evidence/presign`, { method: "POST", body: { fileName: file.name, contentType: file.type || "application/pdf", sizeBytes: file.size } });
      const put = await fetch(presign.uploadUrl, { method: "PUT", headers: presign.requiredHeaders, body: file });
      if (!put.ok) throw new ControlCenterError(ar ? "تعذّر رفع المستند. حاول مجددًا." : "The document could not be uploaded. Try again.", "UPLOAD_FAILED", 502);
      setBusy(ar ? "جارٍ الفحص الأمني…" : "Running security check…");
      await api(`/admin/providers/${organizationId}/credential-evidence/${presign.evidenceId}/confirm?version=0`, { method: "POST" });
      setBusy(ar ? "جارٍ الإرسال للمراجعة…" : "Sending for review…");
      await api(`${base}/credentials`, { method: "POST", headers: { "Idempotency-Key": crypto.randomUUID() }, body: { credentialType: requirement.type, issuer: issuer.trim(), referenceNumber: reference.trim(), issuedAt: toInstant(issuedAt), expiresAt: toInstant(expiresAt), evidenceId: presign.evidenceId } });
      onSubmitted();
    } catch (err) { setError(err); } finally { setBusy(""); }
  };
  return (
    <form className="cc-card" style={{ marginTop: 12 }} onSubmit={submit} noValidate aria-label={requirement.displayName}>
      <ErrorNotice error={error} locale={locale} />
      <div className="cc-form-grid">
        <Field label={ar ? "جهة الإصدار" : "Issued by"} required error={req(issuer.trim())}><input maxLength={300} value={issuer} onChange={(e) => setIssuer(e.target.value)} aria-required /></Field>
        <Field label={ar ? "رقم الترخيص أو المرجع" : "Licence or reference number"} required error={req(reference.trim())}><input dir="ltr" maxLength={200} value={reference} onChange={(e) => setReference(e.target.value)} aria-required /></Field>
        <Field label={ar ? "تاريخ الإصدار" : "Issue date"} optionalLabel={ar ? "اختياري" : "optional"}><input type="date" dir="ltr" value={issuedAt} onChange={(e) => setIssuedAt(e.target.value)} /></Field>
        <Field label={ar ? "تاريخ الانتهاء" : "Expiry date"} required={requirement.expiryRequired} optionalLabel={ar ? "اختياري" : "optional"} error={requirement.expiryRequired ? req(expiresAt) : undefined}><input type="date" dir="ltr" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} /></Field>
        <div className="cc-span"><Field label={ar ? "المستند" : "Document"} hint={ar ? "PDF أو JPG أو PNG. يُفحص أمنيًا قبل المراجعة." : "PDF, JPG or PNG. It is security-checked before review."} required error={req(file)}><input type="file" accept={ACCEPT} onChange={(e) => setFile(e.target.files?.[0] ?? null)} aria-required /></Field></div>
      </div>
      <div className="cc-form-actions">
        <button disabled={!!busy}>{busy || (ar ? "إرسال للمراجعة" : "Send for review")}</button>
        <button type="button" className="cc-secondary" disabled={!!busy} onClick={onCancel}>{ar ? "إلغاء" : "Cancel"}</button>
        {busy && <span role="status" className="cc-meta"><Clock size={14} aria-hidden /> {busy}</span>}
      </div>
    </form>
  );
}

/**
 * Practice relationships in business words. Keys stay as the backend defines them: SUPERVISES (consultant →
 * associate doctor), MANAGES (practice manager → consultant), ASSISTS (assistant → consultant).
 */
export function PracticeRelationships({ locale, api, detail, practitionerId, clinicianType, canManage, onChanged }: { locale: Locale; api: AdminApi; detail: ProviderDetail; practitionerId: string; clinicianType: string; canManage: boolean; onChanged: () => void }) {
  const ar = locale === "ar";
  const [adding, setAdding] = useState<"SUPERVISES" | "MANAGES" | "ASSISTS" | null>(null);
  const [choice, setChoice] = useState(""); const [busy, setBusy] = useState(false); const [error, setError] = useState<unknown>(null); const [done, setDone] = useState("");
  const orgId = detail.organization.id;
  const bySubject = (s: string) => detail.members.find((m) => m.subject === s);
  const self = detail.members.find((m) => m.practitionerId === practitionerId);
  const live = detail.relationships.filter((r) => r.status !== "REVOKED");
  const supervisors = live.filter((r) => r.type === "SUPERVISES" && r.targetPractitionerId === practitionerId);
  const supervised = live.filter((r) => r.type === "SUPERVISES" && self && r.subject === self.subject);
  const managers = live.filter((r) => r.type === "MANAGES" && r.targetPractitionerId === practitionerId);
  const assistants = live.filter((r) => r.type === "ASSISTS" && r.targetPractitionerId === practitionerId);
  const candidates = (role: string) => detail.members.filter((m) => m.roles.includes(role) && m.status !== "REVOKED" && m.practitionerId !== practitionerId);
  const nameOf = (s: string) => { const m = bySubject(s); return m ? personName(m, locale) : (ar ? "شخص غير معروف" : "Unknown person"); };
  const nameOfPractitioner = (pid: string) => { const m = detail.members.find((x) => x.practitionerId === pid); return m ? personName(m, locale) : (ar ? "طبيب غير معروف" : "Unknown clinician"); };
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); if (!adding || !choice) return;
    setBusy(true); setError(null); setDone("");
    try {
      await api(`/admin/providers/${orgId}/relationships`, { method: "POST", body: { subject: choice, type: adding, targetPractitionerId: practitionerId, effectiveFrom: new Date().toISOString(), reason: ar ? "إعداد علاقات العيادة من مركز التحكم" : "Practice relationship set up in the Control Center" } });
      setDone(ar ? "تم حفظ العلاقة." : "Relationship saved."); setAdding(null); setChoice(""); onChanged();
    } catch (err) { setError(err); } finally { setBusy(false); }
  };
  const group = (title: string, rows: { id: string; label: string; status: string }[], empty: string, add?: { type: "SUPERVISES" | "MANAGES" | "ASSISTS"; label: string }) => (
    <div className="cc-requirement">
      <div><h3>{title}</h3>{rows.length ? <ul className="cc-readiness">{rows.map((r) => <li key={r.id}><Check size={16} className="cc-ok" aria-hidden />{r.label}{r.status === "PENDING" && <StatusBadge tone="warning">{ar ? "بانتظار التفعيل" : "Pending activation"}</StatusBadge>}</li>)}</ul> : <p className="cc-meta">{empty}</p>}</div>
      {add && canManage && <div className="cc-row-actions"><button type="button" className="cc-secondary cc-small" onClick={() => { setAdding(add.type); setChoice(""); }}>{add.label}</button></div>}
    </div>
  );
  const role = adding === "SUPERVISES" ? "CONSULTANT" : adding === "MANAGES" ? "PRACTICE_MANAGER" : "CONSULTANT_ASSISTANT";
  return (
    <div>
      <SuccessNotice>{done || null}</SuccessNotice>
      <ErrorNotice error={error} locale={locale} />
      {clinicianType === "ASSOCIATE_DOCTOR"
        ? group(relationshipLabel("SUPERVISES", locale), supervisors.map((r) => ({ id: r.id, label: nameOf(r.subject), status: r.status })), ar ? "لا يوجد استشاري مشرف بعد — مطلوب لتفعيل الطبيب المشارك." : "No supervising consultant yet — required before an associate doctor can be activated.", { type: "SUPERVISES", label: ar ? "تعيين استشاري مشرف" : "Assign supervising consultant" })
        : <>
          {group(ar ? "مديرو العيادة" : "Practice managers", managers.map((r) => ({ id: r.id, label: nameOf(r.subject), status: r.status })), ar ? "لا يوجد مدير عيادة معيّن." : "No practice manager assigned.", { type: "MANAGES", label: ar ? "تعيين مدير عيادة" : "Assign practice manager" })}
          {group(ar ? "مساعدو الاستشاري" : "Consultant assistants", assistants.map((r) => ({ id: r.id, label: nameOf(r.subject), status: r.status })), ar ? "لا يوجد مساعد معيّن." : "No assistant assigned.", { type: "ASSISTS", label: ar ? "تعيين مساعد" : "Assign assistant" })}
          {group(ar ? "الأطباء المشاركون تحت إشرافه" : "Associate doctors they supervise", supervised.map((r) => ({ id: r.id, label: nameOfPractitioner(r.targetPractitionerId), status: r.status })), ar ? "لا يشرف على أطباء مشاركين." : "Not supervising any associate doctors.")}
        </>}
      {adding && (
        <form className="cc-card" onSubmit={submit} style={{ marginTop: 8 }}>
          {candidates(role).length ? (
            <Field label={adding === "SUPERVISES" ? (ar ? "الاستشاري المشرف" : "Supervising consultant") : adding === "MANAGES" ? (ar ? "مدير العيادة" : "Practice manager") : (ar ? "المساعد" : "Assistant")} required>
              <select required value={choice} onChange={(e) => setChoice(e.target.value)}><option value="">{ar ? "اختر شخصًا" : "Choose a person"}</option>{candidates(role).map((m) => <option key={m.subject} value={m.subject}>{personName(m, locale)}</option>)}</select>
            </Field>
          ) : <p className="cc-meta">{ar ? "لا يوجد أشخاص مناسبون في هذه المؤسسة بعد. أضفهم من صفحة المؤسسة أولًا." : "There is nobody suitable in this organization yet. Add them from the organization's people first."}</p>}
          <div className="cc-form-actions"><button disabled={busy || !choice}>{ar ? "حفظ العلاقة" : "Save relationship"}</button><button type="button" className="cc-secondary" onClick={() => setAdding(null)}>{ar ? "إلغاء" : "Cancel"}</button></div>
        </form>
      )}
      <p className="cc-meta">{ar ? "تنتهي العلاقات تلقائيًا عند إزالة أحد الطرفين من المؤسسة." : "Relationships end automatically when either person is removed from the organization."}</p>
    </div>
  );
}

/** The readiness checklist grouped by the four setup milestones. Values are the backend's, never recomputed. */
export function ReadinessChecklist({ locale, readiness, onGoTo }: { locale: Locale; readiness: Readiness; onGoTo?: (area: SetupArea) => void }) {
  const ar = locale === "ar";
  const rows: { area: SetupArea; ok: boolean; label: string }[] = [
    { area: "details", ok: readiness.identityProvisioned, label: ar ? "تم إنشاء حساب الدخول" : "Sign-in account created" },
    { area: "details", ok: readiness.organizationMembershipActive, label: ar ? "العضوية في المؤسسة نشطة" : "Organization membership active" },
    { area: "organization", ok: readiness.providerProfileComplete, label: ar ? "ملف المؤسسة مكتمل" : "Organization profile complete" },
    { area: "professional", ok: readiness.clinicianProfileComplete, label: ar ? "البيانات المهنية مكتملة" : "Professional details complete" },
    { area: "professional", ok: readiness.requiredCredentialsSubmitted, label: ar ? "كل الاعتمادات المطلوبة مُرسلة" : "All required credentials submitted" },
    { area: "professional", ok: readiness.requiredCredentialsVerified, label: ar ? "كل الاعتمادات المطلوبة تم التحقق منها" : "All required credentials verified" },
    { area: "professional", ok: readiness.mandatoryCredentialsUnexpired, label: ar ? "الاعتمادات سارية" : "Credentials in date" },
    { area: "professional", ok: readiness.requiredRelationshipsComplete, label: ar ? "علاقات العيادة المطلوبة موجودة" : "Required practice relationships in place" },
    ...(readiness.pricingSetupRequired ? [{ area: "working" as SetupArea, ok: readiness.pricingSetupComplete, label: ar ? "سعر منشور واحد على الأقل" : "At least one live price" }] : []),
    ...(readiness.availabilitySetupRequired ? [{ area: "working" as SetupArea, ok: readiness.availabilitySetupComplete, label: ar ? "التوافر الأسبوعي محدد" : "Weekly availability set" }] : []),
  ];
  const labels: Record<SetupArea, string> = ar ? { details: "بيانات الاستشاري", organization: "المؤسسة", professional: "الإعداد المهني", working: "إعداد العمل" } : { details: "Consultant details", organization: "Organization", professional: "Professional setup", working: "Working setup" };
  const areas: SetupArea[] = ["details", "organization", "professional", "working"];
  const extra = readiness.blockers.filter((b) => COMMERCIAL_ACCEPTANCE_IN_RELEASE || b.code !== COMMERCIAL_ACCEPTANCE_MISSING).map((b) => ({ ...blockerInfo(b.code, b.message, locale), code: b.code }));
  return (
    <div className="cc-readiness-groups">
      {areas.map((area) => {
        const items = rows.filter((r) => r.area === area); const issues = extra.filter((b) => b.area === area);
        if (!items.length && !issues.length) return null;
        const allOk = items.every((r) => r.ok) && !issues.length;
        return (
          <div key={area} className="cc-requirement">
            <div>
              <h3>{labels[area]}</h3>
              <ul className="cc-readiness">{items.map((r) => <li key={r.label}>{r.ok ? <Check size={16} className="cc-ok" aria-hidden /> : <Clock size={16} className="cc-todo" aria-hidden />}<span>{r.label}<span className="cc-sr">{r.ok ? (ar ? " — مكتمل" : " — done") : (ar ? " — غير مكتمل" : " — not yet")}</span></span></li>)}</ul>
              <SetupIssues issues={issues} locale={locale} />
            </div>
            <div className="cc-row-actions">
              <StatusBadge tone={allOk ? "success" : "warning"}>{allOk ? (ar ? "مكتمل" : "Complete") : (ar ? "يحتاج إجراء" : "Needs action")}</StatusBadge>
              {!allOk && onGoTo && area !== "organization" && <button type="button" className="cc-secondary cc-small" onClick={() => onGoTo(area)}>{ar ? "إكمال" : "Fix"}</button>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** Activation — the one business action at the end of setup, enabled only when the backend says the clinician is ready. */
export function ActivationPanel({ locale, api, organizationId, onboarding, readiness, organizationActive, canActivate, onActivated }: { locale: Locale; api: AdminApi; organizationId: string; onboarding: Onboarding; readiness: Readiness | null; organizationActive: boolean; canActivate: boolean; onActivated: () => void }) {
  const ar = locale === "ar";
  const [confirming, setConfirming] = useState(false); const [busy, setBusy] = useState(false); const [error, setError] = useState<unknown>(null);
  if (onboarding.status === "ACTIVE") return <SuccessNotice>{ar ? "هذا الاستشاري نشط ويمكن تعيينه." : "This consultant is active and can be assigned work."}</SuccessNotice>;
  const ready = !!readiness?.readyForActivation;
  const activate = async () => {
    setBusy(true); setError(null);
    try { await api(`/admin/providers/${organizationId}/clinicians/${onboarding.practitionerId}/activate?version=${onboarding.version}`, { method: "POST", headers: { "Idempotency-Key": crypto.randomUUID() } }); setConfirming(false); onActivated(); }
    catch (err) { setError(err); } finally { setBusy(false); }
  };
  // Case 3 — cannot complete in this release: information only, no button.
  if (activationUnavailable(readiness)) return <ActivationUnavailable locale={locale} subject="consultant" />;
  // Case 2 — relevant, waiting for achievable prerequisites: say exactly what it is waiting for.
  const waitingFor = [
    ...(readiness?.blockers ?? []).map((b) => blockerInfo(b.code, b.message, locale).label),
    ...(ready && !organizationActive ? [ar ? "تفعيل المؤسسة أولًا" : "The organization to be activated first"] : []),
  ];
  if (!readiness) return <p className="cc-meta">{ar ? "تعذّر التحقق من الجاهزية الآن، لذا لا يمكن التفعيل. حدّث الصفحة لاحقًا." : "Readiness couldn't be checked right now, so activation isn't offered. Refresh to try again."}</p>;
  return (
    <div>
      <ErrorNotice error={error} locale={locale} />
      {waitingFor.length > 0 && (
        <div aria-labelledby="activation-waiting">
          <p id="activation-waiting"><strong>{ar ? "غير جاهز للتفعيل" : "Not ready to activate"}</strong></p>
          <p className="cc-meta">{ar ? "بانتظار:" : "Waiting for:"}</p>
          <ul className="cc-readiness">{waitingFor.map((label) => <li key={label}><Clock size={16} className="cc-todo" aria-hidden /><span>{label}</span></li>)}</ul>
        </div>
      )}
      {/* Case 1 — the person can't activate: no control, just who can. */}
      {!canActivate ? <p className="cc-meta">{ar ? "يفعّل مدير عمليات مقدمي الرعاية الاستشاري عند اكتمال الإعداد." : "A provider operations manager activates the consultant once setup is complete."}</p>
        : confirming ? (
          <div className="cc-card" role="group" aria-label={ar ? "تأكيد التفعيل" : "Confirm activation"}>
            <p>{ar ? "بعد التفعيل يصبح الاستشاري مؤهلًا لاستقبال الحالات. هل تريد المتابعة؟" : "After activation the consultant becomes eligible to receive cases. Continue?"}</p>
            <div className="cc-form-actions"><button type="button" disabled={busy} onClick={() => void activate()}>{ar ? "نعم، فعّل الاستشاري" : "Yes, activate consultant"}</button><button type="button" className="cc-secondary" onClick={() => setConfirming(false)}>{ar ? "إلغاء" : "Cancel"}</button></div>
          </div>
        ) : <button type="button" disabled={waitingFor.length > 0} aria-describedby={waitingFor.length ? "activation-waiting" : undefined} onClick={() => setConfirming(true)}>{ar ? "تفعيل الاستشاري" : "Activate consultant"}</button>}
    </div>
  );
}
