"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ExternalLink, FileText } from "lucide-react";
import { useAuth } from "@/components/AuthProvider";
import type { Locale } from "@/lib/i18n";
import { ControlCenterShell } from "./ControlCenterShell";
import { useControlCenterAccess } from "./control-center-access";
import { useAdminApi } from "./admin-api";
import { ControlCenterError, EmptyState, ErrorNotice, Facts, Field, Section, StatusBadge, SuccessNotice, TechnicalDetails } from "./cc-ui";
import { credentialDisplayStatus, credentialTypeLabel, formatDate, personRoleLabel } from "./admin-labels";
import { personName, type ProviderDetail } from "./provider-directory";
import type { Onboarding, Revision } from "./consultant-setup";
import { clinicianHref } from "./clinician-model";

/** Which decisions each state allows, and the exact capability each one needs — unchanged from the accepted review screen. */
const decisionsForStatus: Record<string, string[]> = { SUBMITTED: ["START_REVIEW"], UNDER_REVIEW: ["VERIFY", "REQUEST_INFORMATION", "REJECT"], VERIFIED: ["SUSPEND"], SUSPENDED: ["RESTORE"] };
const permissionFor: Record<string, string> = { START_REVIEW: "credential.review", VERIFY: "credential.verify", REQUEST_INFORMATION: "credential.request_information", REJECT: "credential.reject", SUSPEND: "credential.suspend", RESTORE: "credential.suspend" };
const destructive = new Set(["REJECT", "SUSPEND"]);

/** The facts the submitter declared with this revision. Displayed for comparison with the evidence — never as verified. */
type SubmittedFacts = { issuer: string | null; referenceNumber: string | null; issuedAt: string | null; expiresAt: string | null; jurisdiction: string | null };
type ReviewDetail = Revision & { submittedFacts?: SubmittedFacts | null; reviewedBy?: string | null; reviewedAt?: string | null };

export function CredentialReview({ locale, organizationId, revisionId }: { locale: Locale; organizationId: string; revisionId: string }) {
  const ar = locale === "ar";
  const { user, loading: authLoading, signIn } = useAuth();
  const access = useControlCenterAccess();
  const api = useAdminApi();
  const [row, setRow] = useState<ReviewDetail | null | "not-found">(null);
  const [onboarding, setOnboarding] = useState<Onboarding | null>(null); const [detail, setDetail] = useState<ProviderDetail | null>(null);
  const [error, setError] = useState<unknown>(null); const [decisionError, setDecisionError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false); const [reason, setReason] = useState(""); const [reasonMissing, setReasonMissing] = useState(false); const [documentBusy, setDocumentBusy] = useState<string | null>(null); const [notice, setNotice] = useState("");
  const [confirming, setConfirming] = useState<string | null>(null);
  // Expiry is judged against when the page was opened, a stable instant for the whole render.
  const [openedAt] = useState(() => Date.now());
  const load = useCallback(async () => {
    setError(null);
    try {
      const revision = await api<ReviewDetail>(`/admin/providers/${organizationId}/credential-reviews/${revisionId}`);
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
    if (decision !== "START_REVIEW" && !reason.trim()) { setReasonMissing(true); setConfirming(null); return; }
    // Rejecting or suspending changes whether the clinician can work: state the consequence and ask first.
    if (destructive.has(decision) && confirming !== decision) { setConfirming(decision); return; }
    setBusy(true); setDecisionError(null); setNotice("");
    try {
      await api<Revision>(`/admin/providers/${organizationId}/credential-reviews/${revisionId}/decision`, { method: "POST", headers: { "Idempotency-Key": crypto.randomUUID() }, body: { decision, reason: reason.trim() || null, version: row.version } });
      setReason(""); setReasonMissing(false); setConfirming(null); setNotice(ar ? "تم تسجيل القرار." : "Decision recorded.");
      await load();
    } catch (e) { setDecisionError(e); } finally { setBusy(false); }
  };

  const member = row && row !== "not-found" ? detail?.members?.find((m) => m.practitionerId === row.practitionerId) : undefined;
  const who = member ? personName(member, locale) : (ar ? "طبيب" : "Clinician");
  const title = row && row !== "not-found" ? `${credentialTypeLabel(row.credentialType, locale)} — ${who}` : (ar ? "مراجعة اعتماد" : "Credential review");
  const crumbs = [{ label: row && row !== "not-found" ? who : (ar ? "مراجعة اعتماد" : "Credential review") }];
  const shell = (body: React.ReactNode, intro?: string) => <ControlCenterShell locale={locale} active="credentials" crumbs={crumbs} title={title} intro={intro}>{body}</ControlCenterShell>;
  if (authLoading || access.loading || (row === null && !error)) return shell(<p role="status">{ar ? "جارٍ التحميل…" : "Loading…"}</p>);
  if (!user) return shell(<button onClick={() => void signIn()}>{ar ? "تسجيل الدخول الآمن" : "Sign in securely"}</button>);
  if (error) return shell(<ErrorNotice error={error} locale={locale} action="load" onRetry={() => void load()} />);
  if (!access.can("credential.view")) return shell(<EmptyState title={ar ? "ليس لديك وصول إلى هذه المساحة" : "You do not have access to this area"} />);
  if (row === "not-found" || !row) return shell(<EmptyState title={ar ? "لم يُعثر على هذا الاعتماد" : "This credential could not be found"} body={ar ? "ربما أُزيل أو ليس لديك وصول إليه." : "It may have been removed, or you may not have access to it."} />);

  const status = credentialDisplayStatus(row.status, row.expiresAt, locale);
  const facts = row.submittedFacts;
  const notProvided = <span className="cc-meta">{ar ? "لم يُقدَّم" : "Not provided"}</span>;
  const fact = (value: string | null | undefined, ltr = false) => (value ? (ltr ? <bdi dir="ltr">{value}</bdi> : <bdi>{value}</bdi>) : notProvided);
  const expiryPassed = !!row.expiresAt && new Date(row.expiresAt).getTime() <= openedAt;
  const consequence: Record<string, [string, string]> = {
    REJECT: [ar ? "رفض هذا الاعتماد؟" : "Reject this credential?", ar ? "سيحتاج مقدّم الطلب إلى إرسال نسخة جديدة. لا يمكن أن يصبح الطبيب جاهزًا حتى يتم التحقق من نسخة مقبولة." : "The submitter will need to send a new version. The clinician can't become ready until an acceptable version is verified."],
    SUSPEND: [ar ? "إيقاف هذا الاعتماد الموثّق؟" : "Suspend this verified credential?", ar ? "يتوقف احتسابه فورًا: يفقد الطبيب جاهزيته لاستقبال الحالات حتى يُستعاد الاعتماد أو يُستبدل." : "It stops counting immediately: the clinician loses readiness to receive cases until the credential is restored or replaced."],
  };
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
          [ar ? "الطبيب" : "Clinician", onboarding ? <Link key="p" href={clinicianHref(locale, organizationId, row.practitionerId, "credentials")}>{who}</Link> : who],
          [ar ? "النوع" : "Type", onboarding ? personRoleLabel(onboarding.clinicianType, locale) : "—"],
          [ar ? "المؤسسة" : "Organization", detail?.organization?.displayName ?? "—"],
          [ar ? "أُرسل" : "Submitted", formatDate(row.submittedAt, locale)],
        ]} />
      </Section>
      <Section title={ar ? "البيانات المقدَّمة" : "Submitted facts"} description={ar ? "ما صرّح به مقدّم الطلب. قارنها بالمستندات — عرضها هنا لا يعني أنه تم التحقق منها." : "What the submitter declared. Compare them with the documents — showing them here doesn't mean they have been verified."} id="facts">
        {facts ? <Facts items={[
          [ar ? "نوع الاعتماد" : "Credential type", credentialTypeLabel(row.credentialType, locale)],
          [ar ? "رقم الترخيص أو المرجع" : "Licence or reference number", fact(facts.referenceNumber, true)],
          [ar ? "جهة الإصدار" : "Issued by", fact(facts.issuer)],
          [ar ? "دولة الترخيص" : "Licensing country", fact(facts.jurisdiction, true)],
          [ar ? "تاريخ الإصدار" : "Issue date", facts.issuedAt ? formatDate(facts.issuedAt, locale) : notProvided],
          [ar ? "تاريخ الانتهاء" : "Expiry date", row.expiresAt ? <span key="exp">{formatDate(row.expiresAt, locale)}{expiryPassed && <> <StatusBadge tone="danger">{ar ? "انتهى" : "Expired"}</StatusBadge></>}</span> : (ar ? "لا ينتهي حسب ما قُدّم" : "No expiry declared")],
        ]} /> : <p className="cc-meta">{ar ? "تعذّر عرض البيانات المقدَّمة لهذا الاعتماد. لا تتحقق منه دون مقارنة البيانات بالمستندات." : "The submitted facts for this credential couldn't be shown. Don't verify it without comparing the declared facts with the documents."}</p>}
      </Section>
      <Section title={ar ? "مستندات الإثبات" : "Evidence documents"} description={ar ? "تُفتح عبر رابط آمن قصير الصلاحية." : "Opens through a short-lived secure link."} id="evidence">
        {!row.evidenceIds.length ? <EmptyState title={ar ? "لا توجد مستندات مرفقة" : "No evidence documents are attached"} /> : (
          <ul className="cc-doc-list">{row.evidenceIds.map((id, i) => <li key={id}><span><FileText size={16} aria-hidden /> {ar ? `المستند ${i + 1}` : `Document ${i + 1}`}</span>
            <button type="button" className="cc-secondary cc-small" disabled={documentBusy === id} onClick={() => void viewDocument(id)}><ExternalLink size={15} aria-hidden />{documentBusy === id ? (ar ? "جارٍ تجهيز رابط آمن…" : "Preparing a secure link…") : (ar ? "عرض المستند" : "View document")}</button></li>)}</ul>
        )}
      </Section>
      <Section title={ar ? "قرار المراجعة المستقلة" : "Independent review decision"} description={ar ? "يتخذه مراجع مستقل ليس صاحب الاعتماد ولا من قدّمه." : "Made by an independent reviewer who is neither the credential's owner nor the person who submitted it."} id="decision">
        <p className="cc-meta">{row.reviewedAt ? <>{ar ? "آخر قرار في" : "Last decision on"} {formatDate(row.reviewedAt, locale)}{row.reviewedBy && row.reviewedBy === user.profile.sub ? (ar ? " (بواسطتك)" : " (by you)") : ""}</> : (ar ? "لم يُتخذ قرار بعد." : "No decision yet.")}</p>
        <ErrorNotice error={decisionError} locale={locale} />
        {isSelf ? <p role="alert" className="cc-issue">{ar ? "أنت صاحب هذا الاعتماد. لا يمكنك مراجعة طلبك الخاص." : "You are the subject of this credential. You cannot review your own submission."}</p>
          : isSubmitter ? <p role="alert" className="cc-issue">{ar ? "أنت من قدّم هذا الاعتماد. يجب أن يراجعه شخص مستقل." : "You submitted this credential. An independent reviewer must review it."}</p>
          : !available.length ? <p className="cc-meta">{ar ? "لا يوجد قرار متاح لك في هذه المرحلة." : "There is no decision available to you at this stage."}</p>
          : <>
            {available.some((d) => d !== "START_REVIEW") && <Field label={ar ? "أساس القرار" : "Reason for your decision"} hint={ar ? "يُحفظ في سجل التدقيق ويراه فريق مقدم الرعاية عند طلب تصحيح." : "Saved in the audit trail; the provider team sees it when you request a correction."} required error={reasonMissing && !reason.trim() ? (ar ? "السبب مطلوب لهذا القرار." : "A reason is required for this decision.") : undefined}>
              <textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} />
            </Field>}
            {available.includes("START_REVIEW") && <p className="cc-meta">{ar ? "بدء المراجعة يسندها إليك." : "Starting the review assigns it to you."}</p>}
            {confirming && consequence[confirming] ? (
              <div className="cc-card" role="group" aria-label={consequence[confirming][0]}>
                <p><strong>{consequence[confirming][0]}</strong></p>
                <p>{consequence[confirming][1]}</p>
                <div className="cc-form-actions"><button type="button" className="cc-danger-button" disabled={busy} onClick={() => void decide(confirming)}>{confirming === "REJECT" ? (ar ? "نعم، ارفض" : "Yes, reject") : (ar ? "نعم، أوقف الاعتماد" : "Yes, suspend")}</button><button type="button" className="cc-secondary" onClick={() => setConfirming(null)}>{ar ? "إلغاء" : "Cancel"}</button></div>
              </div>
            ) : (
            <div className="cc-form-actions">
              {primary.map((d) => <button key={d} type="button" disabled={busy} onClick={() => void decide(d)}>{label(d)}</button>)}
              {secondary.map((d) => <button key={d} type="button" className="cc-secondary" disabled={busy} onClick={() => void decide(d)}>{label(d)}</button>)}
              {danger.map((d) => <button key={d} type="button" className="cc-secondary cc-danger-button cc-push" disabled={busy} onClick={() => void decide(d)}>{label(d)}…</button>)}
            </div>)}
          </>}
      </Section>
      <TechnicalDetails locale={locale} items={[[ar ? "رقم الإرسال" : "Submission number", String(row.revisionNumber)], [ar ? "حالة الملف" : "Dossier status", row.dossierStatus], [ar ? "رمز الحالة" : "Status code", row.status], [ar ? "رمز الاعتماد" : "Credential code", row.credentialType], [ar ? "معرّف المراجعة" : "Revision ID", row.id]]} />
    </>,
    detail?.organization?.displayName,
  );
}
