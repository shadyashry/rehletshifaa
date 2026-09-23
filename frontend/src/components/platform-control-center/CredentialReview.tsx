"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ExternalLink, FileText } from "lucide-react";
import { useAuth } from "@/components/AuthProvider";
import type { Locale } from "@/lib/i18n";
import { ControlCenterShell, ccCrumbs } from "./ControlCenterShell";
import { useControlCenterAccess } from "./control-center-access";
import { useAdminApi } from "./admin-api";
import { ccHref } from "./control-center-nav";
import { ControlCenterError, EmptyState, ErrorNotice, Facts, Field, Section, StatusBadge, SuccessNotice, TechnicalDetails } from "./cc-ui";
import { credentialReviewStatus, credentialTypeLabel, formatDate, personRoleLabel } from "./admin-labels";
import { personName, type ProviderDetail } from "./provider-directory";
import type { Onboarding, Revision } from "./consultant-setup";
import { consultantHref } from "./ConsultantOnboardingWizard";

/** Which decisions each state allows, and the exact capability each one needs — unchanged from the accepted review screen. */
const decisionsForStatus: Record<string, string[]> = { SUBMITTED: ["START_REVIEW"], UNDER_REVIEW: ["VERIFY", "REQUEST_INFORMATION", "REJECT"], VERIFIED: ["SUSPEND"], SUSPENDED: ["RESTORE"] };
const permissionFor: Record<string, string> = { START_REVIEW: "credential.review", VERIFY: "credential.verify", REQUEST_INFORMATION: "credential.request_information", REJECT: "credential.reject", SUSPEND: "credential.suspend", RESTORE: "credential.suspend" };
const destructive = new Set(["REJECT", "SUSPEND"]);

export function CredentialReview({ locale, organizationId, revisionId }: { locale: Locale; organizationId: string; revisionId: string }) {
  const ar = locale === "ar";
  const { user, loading: authLoading, signIn } = useAuth();
  const access = useControlCenterAccess();
  const api = useAdminApi();
  const [row, setRow] = useState<Revision | null | "not-found">(null);
  const [onboarding, setOnboarding] = useState<Onboarding | null>(null); const [detail, setDetail] = useState<ProviderDetail | null>(null);
  const [error, setError] = useState<unknown>(null); const [decisionError, setDecisionError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false); const [reason, setReason] = useState(""); const [reasonMissing, setReasonMissing] = useState(false); const [documentBusy, setDocumentBusy] = useState<string | null>(null); const [notice, setNotice] = useState("");
  const load = useCallback(async () => {
    setError(null);
    try {
      const revision = await api<Revision>(`/admin/providers/${organizationId}/credential-reviews/${revisionId}`);
      setRow(revision);
      const [ob, d] = await Promise.all([api<Onboarding>(`/admin/providers/${organizationId}/clinicians/${revision.practitionerId}/onboarding`).catch(() => null), api<ProviderDetail>(`/admin/providers/${organizationId}`).catch(() => null)]);
      setOnboarding(ob); setDetail(d);
    } catch (e) { if (e instanceof ControlCenterError && (e.status === 404 || e.status === 403)) setRow("not-found"); else setError(e); }
  }, [api, organizationId, revisionId]);
  useEffect(() => { if (user) void load(); }, [user, load]);

  const viewDocument = async (evidenceId: string) => {
    setDocumentBusy(evidenceId); setDecisionError(null);
    try { const doc = await api<{ url: string }>(`/admin/providers/${organizationId}/credential-evidence/${evidenceId}/view`); window.open(doc.url, "_blank", "noopener,noreferrer"); }
    catch (e) { setDecisionError(e); } finally { setDocumentBusy(null); }
  };
  const decide = async (decision: string) => {
    if (!row || row === "not-found") return;
    if (decision !== "START_REVIEW" && !reason.trim()) { setReasonMissing(true); return; }
    setBusy(true); setDecisionError(null); setNotice("");
    try {
      setRow(await api<Revision>(`/admin/providers/${organizationId}/credential-reviews/${revisionId}/decision`, { method: "POST", headers: { "Idempotency-Key": crypto.randomUUID() }, body: { decision, reason: reason.trim() || null, version: row.version } }));
      setReason(""); setReasonMissing(false); setNotice(ar ? "تم تسجيل القرار." : "Decision recorded.");
    } catch (e) { setDecisionError(e); } finally { setBusy(false); }
  };

  const member = row && row !== "not-found" ? detail?.members?.find((m) => m.practitionerId === row.practitionerId) : undefined;
  const who = member ? personName(member, locale) : (ar ? "طبيب" : "Clinician");
  const title = row && row !== "not-found" ? `${credentialTypeLabel(row.credentialType, locale)} — ${who}` : (ar ? "مراجعة اعتماد" : "Credential review");
  const crumbs = ccCrumbs(locale, { label: ar ? "مراجعة الاعتمادات" : "Credential reviews", href: ccHref(locale, "/credentials") }, { label: ar ? "مراجعة" : "Review" });
  const shell = (body: React.ReactNode, intro?: string) => <ControlCenterShell locale={locale} active="credentials" crumbs={crumbs} title={title} intro={intro}>{body}</ControlCenterShell>;
  if (authLoading || access.loading || (row === null && !error)) return shell(<p role="status">{ar ? "جارٍ التحميل…" : "Loading…"}</p>);
  if (!user) return shell(<button onClick={() => void signIn()}>{ar ? "تسجيل الدخول الآمن" : "Sign in securely"}</button>);
  if (error) return shell(<ErrorNotice error={error} locale={locale} action="load" onRetry={() => void load()} />);
  if (!access.can("credential.view")) return shell(<EmptyState title={ar ? "ليس لديك وصول إلى هذه المساحة" : "You do not have access to this area"} />);
  if (row === "not-found" || !row) return shell(<EmptyState title={ar ? "لم يُعثر على هذا الاعتماد" : "This credential could not be found"} body={ar ? "ربما أُزيل أو ليس لديك وصول إليه." : "It may have been removed, or you may not have access to it."} />);

  const status = credentialReviewStatus(row.status, locale);
  const isSelf = user.profile.sub === row.ownerSubject, isSubmitter = user.profile.sub === row.submittedBy;
  const available = (decisionsForStatus[row.status] ?? []).filter((d) => access.can(permissionFor[d]));
  const label = (d: string) => ({ START_REVIEW: ar ? "بدء المراجعة" : "Start review", VERIFY: ar ? "تأكيد الاعتماد" : "Verify credential", REQUEST_INFORMATION: ar ? "طلب تصحيح أو معلومات" : "Request a correction", REJECT: ar ? "رفض" : "Reject", SUSPEND: ar ? "إيقاف الاعتماد" : "Suspend credential", RESTORE: ar ? "استعادة الاعتماد" : "Restore credential" } as Record<string, string>)[d];
  const primary = available.filter((d) => !destructive.has(d) && d !== "REQUEST_INFORMATION");
  const secondary = available.filter((d) => d === "REQUEST_INFORMATION");
  const danger = available.filter((d) => destructive.has(d));

  return shell(
    <>
      <p style={{ marginTop: -8, marginBottom: 18 }}><StatusBadge tone={status.tone}>{status.label}</StatusBadge></p>
      <SuccessNotice>{notice || null}</SuccessNotice>
      <Section title={ar ? "الملخص" : "Summary"} id="summary">
        <Facts items={[
          [ar ? "الطبيب" : "Clinician", onboarding ? <Link key="p" href={consultantHref(locale, organizationId, row.practitionerId, "credentials")}>{who}</Link> : who],
          [ar ? "النوع" : "Type", onboarding ? personRoleLabel(onboarding.clinicianType, locale) : "—"],
          [ar ? "المؤسسة" : "Organization", detail?.organization?.displayName ?? "—"],
          [ar ? "أُرسل" : "Submitted", formatDate(row.submittedAt, locale)],
          [ar ? "ينتهي" : "Expires", formatDate(row.expiresAt, locale)],
        ]} />
      </Section>
      <Section title={ar ? "المستندات المقدمة" : "Submitted evidence"} description={ar ? "تُفتح عبر رابط آمن قصير الصلاحية." : "Opens through a short-lived secure link."} id="evidence">
        {!row.evidenceIds.length ? <EmptyState title={ar ? "لا توجد مستندات مرفقة" : "No evidence documents are attached"} /> : (
          <ul className="cc-doc-list">{row.evidenceIds.map((id, i) => <li key={id}><span><FileText size={16} aria-hidden /> {ar ? `المستند ${i + 1}` : `Document ${i + 1}`}</span>
            <button type="button" className="cc-secondary cc-small" disabled={documentBusy === id} onClick={() => void viewDocument(id)}><ExternalLink size={15} aria-hidden />{documentBusy === id ? (ar ? "جارٍ تجهيز رابط آمن…" : "Preparing a secure link…") : (ar ? "عرض المستند" : "View document")}</button></li>)}</ul>
        )}
      </Section>
      <Section title={ar ? "القرار" : "Decision"} id="decision">
        <ErrorNotice error={decisionError} locale={locale} />
        {isSelf ? <p role="alert" className="cc-issue">{ar ? "أنت صاحب هذا الاعتماد. لا يمكنك مراجعة طلبك الخاص." : "You are the subject of this credential. You cannot review your own submission."}</p>
          : isSubmitter ? <p role="alert" className="cc-issue">{ar ? "أنت من قدّم هذا الاعتماد. يجب أن يراجعه شخص مستقل." : "You submitted this credential. An independent reviewer must review it."}</p>
          : !available.length ? <p className="cc-meta">{ar ? "لا يوجد قرار متاح لك في هذه المرحلة." : "There is no decision available to you at this stage."}</p>
          : <>
            {available.some((d) => d !== "START_REVIEW") && <Field label={ar ? "أساس القرار" : "Reason for your decision"} hint={ar ? "يُحفظ في سجل التدقيق ويراه فريق مقدم الرعاية عند طلب تصحيح." : "Saved in the audit trail; the provider team sees it when you request a correction."} required error={reasonMissing && !reason.trim() ? (ar ? "السبب مطلوب لهذا القرار." : "A reason is required for this decision.") : undefined}>
              <textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} />
            </Field>}
            <div className="cc-form-actions">
              {primary.map((d) => <button key={d} type="button" disabled={busy} onClick={() => void decide(d)}>{label(d)}</button>)}
              {secondary.map((d) => <button key={d} type="button" className="cc-secondary" disabled={busy} onClick={() => void decide(d)}>{label(d)}</button>)}
              {danger.map((d) => <button key={d} type="button" className="cc-secondary cc-danger-button cc-push" disabled={busy} onClick={() => void decide(d)}>{label(d)}</button>)}
            </div>
          </>}
      </Section>
      <TechnicalDetails locale={locale} items={[[ar ? "رقم الإرسال" : "Submission number", String(row.revisionNumber)], [ar ? "حالة الملف" : "Dossier status", row.dossierStatus], [ar ? "رمز الحالة" : "Status code", row.status], [ar ? "رمز الاعتماد" : "Credential code", row.credentialType], [ar ? "معرّف المراجعة" : "Revision ID", row.id]]} />
    </>,
    detail?.organization?.displayName,
  );
}
