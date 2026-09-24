"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/components/AuthProvider";
import type { Locale } from "@/lib/i18n";
import { ControlCenterShell } from "./ControlCenterShell";
import { useControlCenterAccess } from "./control-center-access";
import { useAdminApi } from "./admin-api";
import { ControlCenterError, EmptyState, ErrorNotice, Facts, Field, Section, StatusBadge, TechnicalDetails } from "./cc-ui";
import { credentialDisplayStatus, credentialIsExpired, credentialReviewStatus, credentialTypeLabel, formatDate, personRoleLabel } from "./admin-labels";
import { clinicianHref } from "./clinician-model";
import { credentialValidity, historyEventLabel, latestEntry, type ReviewDetail } from "./credential-lifecycle";
import { CredentialHistory, EvidenceList, MoreInformationNotice, SubmittedInformation, ValidityLine } from "./credential-ui";

/** Which decisions each state allows, and the exact capability each one needs — unchanged; the backend re-checks both. */
const decisionsForStatus: Record<string, string[]> = { SUBMITTED: ["START_REVIEW"], UNDER_REVIEW: ["VERIFY", "REQUEST_INFORMATION", "REJECT"], VERIFIED: ["SUSPEND"], SUSPENDED: ["RESTORE"] };
const permissionFor: Record<string, string> = { START_REVIEW: "credential.review", VERIFY: "credential.verify", REQUEST_INFORMATION: "credential.request_information", REJECT: "credential.reject", SUSPEND: "credential.suspend", RESTORE: "credential.suspend" };
type Decision = "START_REVIEW" | "VERIFY" | "REQUEST_INFORMATION" | "REJECT" | "SUSPEND" | "RESTORE";

/** Per decision: the question, its real effect, what the reason field is for and who sees it (the backend requires a reason for all but Start review). */
function decisionCopy(d: Decision, ar: boolean) {
  const reviewersOnly = ar ? "يُحفظ في سجل المراجعة ويراه مراجعو الاعتمادات فقط." : "Kept in the review history; visible to credential reviewers only.";
  return ({
    START_REVIEW: { button: ar ? "بدء المراجعة" : "Start review", title: "", effect: "", field: "", hint: "", confirm: "" },
    VERIFY: {
      button: ar ? "التحقق من الاعتماد…" : "Verify…", title: ar ? "التحقق من هذا الاعتماد؟" : "Verify this credential?",
      effect: ar ? "أنت تؤكد أن الاعتماد المقدَّم أكمل المراجعة المستقلة المطلوبة. قد يستوفي ذلك أحد متطلبات جاهزية الطبيب، لكنه لا يجعله وحده مؤهلًا لاستقبال الحالات." : "You are confirming that the submitted credential has completed the required independent review. This may satisfy one of the clinician's readiness requirements. It does not by itself make the clinician eligible for cases.",
      field: ar ? "أساس التحقق" : "Basis for verification", hint: (ar ? "ما الذي تحققت منه، مثل سجل الجهة المُصدِرة. " : "What you checked, for example the issuing authority's register. ") + reviewersOnly, confirm: ar ? "تأكيد التحقق" : "Verify credential",
    },
    REQUEST_INFORMATION: {
      button: ar ? "طلب مزيد من المعلومات…" : "Request more information…", title: ar ? "طلب مزيد من المعلومات" : "Request more information",
      effect: ar ? "تنتقل حالة الاعتماد إلى «مطلوب مزيد من المعلومات». ترسل عمليات مقدمي الرعاية أو الطبيب نسخة جديدة، فتعود إلى قائمة المراجعة." : "The credential moves to More information required. Provider Operations or the clinician submits a new version, which returns to the review queue.",
      field: ar ? "المطلوب" : "What is needed", hint: ar ? "يظهر لفريق مقدم الرعاية وللطبيب كطلب المراجِع. اكتب بوضوح ما الذي يجب تقديمه." : "Shown to the provider team and the clinician as your request. Say exactly what they need to provide.", confirm: ar ? "إرسال الطلب" : "Send request",
    },
    REJECT: {
      button: ar ? "رفض…" : "Reject…", title: ar ? "رفض هذا الاعتماد؟" : "Reject this credential?",
      effect: ar ? "هذا ليس طلبًا لمعلومات ناقصة: لن يُقبل هذا الاعتماد. سيحتاج فريق مقدم الرعاية إلى إرسال نسخة جديدة، ولا يمكن أن يستوفي الطبيب هذا المتطلب حتى يُتحقق من نسخة مقبولة." : "This is not a request for missing information: this credential will not be accepted. The provider team will need to submit a new version, and the clinician can't meet this requirement until an acceptable version is verified.",
      field: ar ? "سبب الرفض" : "Reason for rejection", hint: (ar ? "يرى فريق مقدم الرعاية أنه رُفض. " : "The provider team sees that it was rejected. ") + reviewersOnly, confirm: ar ? "رفض الاعتماد" : "Reject credential",
    },
    SUSPEND: {
      button: ar ? "إيقاف الاعتماد…" : "Suspend credential…", title: ar ? "إيقاف هذا الاعتماد الموثّق؟" : "Suspend this verified credential?",
      effect: ar ? "يتوقف احتسابه فورًا: لا يستوفي الطبيب متطلبات الاعتماد حتى يُستعاد أو يُستبدل. يوقف هذا الاعتماد فقط — لا عضوية الطبيب في الجهة ولا حسابه." : "It stops counting immediately: the clinician no longer meets this credential requirement until it is restored or replaced. This suspends the credential only — not the clinician's organization membership or account.",
      field: ar ? "سبب الإيقاف" : "Reason for suspension", hint: reviewersOnly, confirm: ar ? "إيقاف الاعتماد" : "Suspend credential",
    },
    RESTORE: {
      button: ar ? "استعادة الاعتماد…" : "Restore credential…", title: ar ? "استعادة هذا الاعتماد؟" : "Restore this credential?",
      effect: ar ? "يُحتسب مجددًا إذا لم تنتهِ صلاحيته. يُعاد التحقق من الجاهزية؛ ولا يُفعَّل الطبيب تلقائيًا." : "It counts again if it has not expired. Readiness is re-checked; the clinician is not activated automatically.",
      field: ar ? "سبب الاستعادة" : "Reason for restoring", hint: reviewersOnly, confirm: ar ? "استعادة الاعتماد" : "Restore credential",
    },
  } as const)[d];
}

/**
 * Credential Reviews › one credential. Structure: Clinician · Submitted information · Evidence · Independent review ·
 * History · Decision. Submitted facts are never presented as verified; evidence (a scanned, attached document) is not
 * verification; only an independent reviewer's Verify decision is. Decisions are offered only to authorized reviewers
 * who are neither the credential's owner nor its submitter, in the states the backend allows.
 */
export function CredentialReview({ locale, organizationId, revisionId }: { locale: Locale; organizationId: string; revisionId: string }) {
  const ar = locale === "ar";
  const { user, loading: authLoading, signIn } = useAuth();
  const access = useControlCenterAccess();
  const api = useAdminApi();
  const [row, setRow] = useState<ReviewDetail | null | "not-found">(null);
  const [error, setError] = useState<unknown>(null); const [decisionError, setDecisionError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false); const [reason, setReason] = useState(""); const [reasonMissing, setReasonMissing] = useState(false);
  const [documentBusy, setDocumentBusy] = useState<string | null>(null); const [notice, setNotice] = useState("");
  const [choosing, setChoosing] = useState<Decision | null>(null);
  const statusRef = useRef<HTMLDivElement>(null); const summaryRef = useRef<HTMLDivElement>(null);
  // Expiry is judged against when the page was opened, a stable instant for the whole render.
  const [openedAt] = useState(() => Date.now());
  const load = useCallback(async () => {
    setError(null);
    try { setRow(await api<ReviewDetail>(`/admin/providers/${organizationId}/credential-reviews/${revisionId}`)); }
    catch (e) { if (e instanceof ControlCenterError && (e.status === 404 || e.status === 403)) setRow("not-found"); else setError(e); }
  }, [api, organizationId, revisionId]);
  useEffect(() => { if (user) void load(); }, [user, load]);
  useEffect(() => { if (notice) statusRef.current?.focus(); }, [notice]);
  useEffect(() => { if (reasonMissing) summaryRef.current?.focus(); }, [reasonMissing]);

  const viewDocument = async (evidenceId: string) => {
    setDocumentBusy(evidenceId); setDecisionError(null);
    try { const doc = await api<{ url: string }>(`/admin/providers/${organizationId}/credential-evidence/${evidenceId}/view`); window.open(doc.url, "_blank", "noopener,noreferrer"); }
    catch (e) { setDecisionError(e); } finally { setDocumentBusy(null); }
  };
  const decide = async (decision: Decision) => {
    if (!row || row === "not-found") return;
    if (decision !== "START_REVIEW" && !reason.trim()) { setReasonMissing(true); return; }
    setBusy(true); setDecisionError(null); setNotice("");
    try {
      const next = await api<{ status: string }>(`/admin/providers/${organizationId}/credential-reviews/${revisionId}/decision`, { method: "POST", headers: { "Idempotency-Key": crypto.randomUUID() }, body: { decision, reason: reason.trim() || null, version: row.version } });
      setReason(""); setReasonMissing(false); setChoosing(null);
      await load();
      setNotice(`${ar ? "تم تسجيل القرار. الحالة الآن:" : "Decision recorded. Status is now:"} ${credentialReviewStatus(next?.status, locale).label}.`);
    } catch (e) { setDecisionError(e); } finally { setBusy(false); }
  };

  const who = row && row !== "not-found" ? row.clinicianName || (ar ? "طبيب" : "Clinician") : "";
  const title = row && row !== "not-found" ? `${credentialTypeLabel(row.credentialType, locale)} — ${who}` : (ar ? "مراجعة اعتماد" : "Credential review");
  const crumbs = [{ label: row && row !== "not-found" ? who : (ar ? "مراجعة اعتماد" : "Credential review") }];
  const shell = (body: React.ReactNode, intro?: string) => <ControlCenterShell locale={locale} active="credentials" crumbs={crumbs} title={title} intro={intro}>{body}</ControlCenterShell>;
  if (authLoading || access.loading || (row === null && !error)) return shell(<p role="status">{ar ? "جارٍ التحميل…" : "Loading…"}</p>);
  if (!user) return shell(<button onClick={() => void signIn()}>{ar ? "تسجيل الدخول الآمن" : "Sign in securely"}</button>);
  if (error) return shell(<ErrorNotice error={error} locale={locale} action="load" onRetry={() => void load()} />);
  if (!access.can("credential.view")) return shell(<EmptyState title={ar ? "ليس لديك وصول إلى هذه المساحة" : "You do not have access to this area"} />);
  if (row === "not-found" || !row) return shell(<EmptyState title={ar ? "لم يُعثر على هذا الاعتماد" : "This credential could not be found"} body={ar ? "ربما أُزيل أو ليس لديك وصول إليه." : "It may have been removed, or you may not have access to it."} />);

  const status = credentialDisplayStatus(row.status, row.expiresAt, locale, openedAt);
  const validity = credentialValidity(row.expiresAt, openedAt);
  const reviewerView = !!row.reviewerView;
  const history = row.history;
  const started = latestEntry(history, "REVIEW_STARTED", row.revisionNumber);
  const request = latestEntry(history, "MORE_INFORMATION_REQUIRED", row.revisionNumber);
  const lastOutcome = history?.find((h) => h.revisionNumber === row.revisionNumber && ["VERIFIED", "REJECTED", "SUSPENDED", "RESTORED"].includes(h.event));
  const reviewer = row.reviewedBy && row.reviewedBy === user.profile.sub ? (ar ? "أنت" : "You") : row.reviewerName ? <bdi>{row.reviewerName}</bdi> : row.reviewedBy ? (ar ? "مراجع اعتمادات" : "A credential reviewer") : (ar ? "لم تبدأ المراجعة بعد" : "Review not started yet");
  const isSelf = user.profile.sub === row.ownerSubject, isSubmitter = user.profile.sub === row.submittedBy;
  const available = ((decisionsForStatus[row.status] ?? []) as Decision[]).filter((d) => access.can(permissionFor[d]));
  const copy = choosing ? decisionCopy(choosing, ar) : null;
  const reasonError = reasonMissing && !reason.trim() ? (ar ? `أدخل «${copy?.field}».` : `Enter the ${copy?.field.toLowerCase()}.`) : undefined;
  const clinicianLink = access.can("provider.view") ? <Link href={clinicianHref(locale, organizationId, row.practitionerId, "credentials")}><bdi>{who}</bdi></Link> : <bdi>{who}</bdi>;

  return shell(
    <>
      <div className="cc-review-status" ref={statusRef} tabIndex={-1} aria-labelledby="review-status-label">
        <span id="review-status-label" className="cc-sr">{ar ? "حالة الاعتماد" : "Credential status"}</span>
        <StatusBadge tone={status.tone}>{status.label}</StatusBadge>
        <ValidityLine validity={validity} locale={locale} />
      </div>
      <div role="status" aria-live="polite">{notice && <div className="cc-notice cc-notice-success"><p>{notice}</p></div>}</div>

      <Section title={ar ? "الطبيب" : "Clinician"} id="clinician">
        <Facts items={[
          [ar ? "الاسم" : "Name", clinicianLink],
          [ar ? "الدور المهني" : "Professional role", row.clinicianType ? personRoleLabel(row.clinicianType, locale) : "—"],
          [ar ? "الجهة" : "Provider organization", row.organizationName ? <bdi key="o">{row.organizationName}</bdi> : "—"],
        ]} />
      </Section>

      <Section title={ar ? "المعلومات المقدَّمة" : "Submitted information"} id="facts"
        description={`${ar ? "أُرسلت" : "Submitted"} ${formatDate(row.submittedAt, locale)}${row.submittedByName ? `${ar ? " بواسطة " : " by "}${row.submittedByName}` : ""}${row.revisionNumber > 1 ? (ar ? ` · النسخة ${row.revisionNumber}` : ` · version ${row.revisionNumber}`) : ""}`}>
        <SubmittedInformation detail={row} locale={locale} validity={validity} />
      </Section>

      <Section title={ar ? "المستندات" : "Evidence"} id="evidence" description={ar ? "تُفتح عبر رابط آمن قصير الصلاحية." : "Opens through a short-lived secure link."}>
        <EvidenceList detail={row} locale={locale} onView={(id) => void viewDocument(id)} busyId={documentBusy} />
      </Section>

      <Section title={ar ? "المراجعة المستقلة" : "Independent review"} id="review" description={ar ? "يجريها مراجع مستقل ليس صاحب الاعتماد ولا من قدّمه." : "Carried out by an independent reviewer who is neither the credential's owner nor the person who submitted it."}>
        <Facts items={[
          [ar ? "الحالة" : "Status", <StatusBadge key="s" tone={status.tone}>{status.label}</StatusBadge>],
          [ar ? "المراجِع" : "Reviewer", reviewer],
          [ar ? "بدأت المراجعة" : "Review started", started ? formatDate(started.at, locale) : row.status === "SUBMITTED" ? (ar ? "لم تبدأ بعد" : "Not started") : "—"],
          [ar ? "آخر قرار" : "Last decision", lastOutcome ? `${historyEventLabel(lastOutcome.event, locale)} · ${formatDate(lastOutcome.at, locale)}` : row.reviewedAt && row.status !== "UNDER_REVIEW" ? formatDate(row.reviewedAt, locale) : (ar ? "لا يوجد بعد" : "None yet")],
          ...(reviewerView && lastOutcome?.reason ? [[ar ? "أساس القرار" : "Basis recorded", <q key="r"><bdi>{lastOutcome.reason}</bdi></q>] as [string, React.ReactNode]] : []),
        ]} />
        {row.status === "MORE_INFORMATION_REQUIRED" && <MoreInformationNotice request={request} locale={locale} />}
        {row.status === "REJECTED" && <p className="cc-issue">{ar ? "رُفض هذا الاعتماد. يمكن لفريق مقدم الرعاية إرسال نسخة جديدة تعود إلى قائمة المراجعة." : "This credential was rejected. The provider team can submit a new version, which returns to the review queue."}</p>}
        {row.status === "SUSPENDED" && <p className="cc-issue">{ar ? "هذا الاعتماد موقوف ولا يُحتسب. الإيقاف يخص الاعتماد وحده — لا العضوية في الجهة ولا حساب الطبيب ولا أهليته للحالات بشكل منفصل." : "This credential is suspended and does not count. The suspension applies to this credential only — not the organization membership, the account or case eligibility as separate controls."}</p>}
        {credentialIsExpired(row.status, row.expiresAt, openedAt) && <p className="cc-issue">{ar ? "تحقق منه مراجع مستقل، لكن تاريخ انتهائه مضى فلم يعد يُحتسب. يبقى التحقق السابق في السجل." : "It was independently verified, but its expiry date has passed, so it no longer counts. The earlier verification stays in its history."}</p>}
        <p className="cc-meta">{ar ? "ما يُسجَّل لكل قرار: المراجِع والتاريخ والقرار والأساس الذي كتبه المراجِع. لا تسجّل المنصة مصدر تحقق منفصلًا أو مرجعًا خارجيًا." : "What is recorded for each decision: the reviewer, the date, the decision and the basis the reviewer wrote. The platform does not record a separate verification source or external reference."}</p>
      </Section>

      <Section title={ar ? "سجل القرارات" : "Decision history"} id="history">
        {history?.length ? <CredentialHistory history={history} locale={locale} reviewerView={reviewerView} /> : <p className="cc-meta">{ar ? "لا يوجد سجل بعد." : "No history yet."}</p>}
      </Section>

      <Section title={ar ? "القرار" : "Decision"} id="decision">
        <ErrorNotice error={decisionError} locale={locale} />
        {isSelf ? <p role="alert" className="cc-issue">{ar ? "أنت صاحب هذا الاعتماد. لا يمكنك مراجعة طلبك الخاص." : "You are the subject of this credential. You cannot review your own submission."}</p>
          : isSubmitter ? <p role="alert" className="cc-issue">{ar ? "أنت من قدّم هذا الاعتماد. يجب أن يراجعه شخص مستقل." : "You submitted this credential. An independent reviewer must review it."}</p>
          : !available.length ? <p className="cc-meta">{row.status === "MORE_INFORMATION_REQUIRED" ? (ar ? "لا قرار الآن: المراجعة بانتظار نسخة جديدة من فريق مقدم الرعاية." : "No decision now: the review is waiting for a new version from the provider team.") : (ar ? "لا يوجد قرار متاح لك في هذه المرحلة." : "There is no decision available to you at this stage.")}</p>
          : choosing && copy ? (
            <div className="cc-card cc-decision" role="group" aria-labelledby="decision-panel-title">
              <h3 id="decision-panel-title">{copy.title}</h3>
              <p>{copy.effect}</p>
              {reasonMissing && reasonError && (
                <div className="cc-error-summary" role="alert" tabIndex={-1} ref={summaryRef}>
                  <p><strong>{ar ? "هناك مشكلة" : "There is a problem"}</strong></p>
                  <ul><li><a href="#decision-reason">{reasonError}</a></li></ul>
                </div>
              )}
              <Field label={copy.field} hint={copy.hint} required error={reasonError}>
                <textarea id="decision-reason" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} aria-required />
              </Field>
              <div className="cc-form-actions">
                <button type="button" className={choosing === "REJECT" || choosing === "SUSPEND" ? "cc-danger-button" : undefined} disabled={busy} onClick={() => void decide(choosing)}>{copy.confirm}</button>
                <button type="button" className="cc-secondary" disabled={busy} onClick={() => { setChoosing(null); setReasonMissing(false); }}>{ar ? "إلغاء" : "Cancel"}</button>
              </div>
            </div>
          ) : (
            <>
              {available.includes("START_REVIEW") && <p className="cc-meta">{ar ? "بدء المراجعة يسندها إليك. لا يعني ذلك التحقق من الاعتماد." : "Starting the review assigns it to you. It does not verify the credential."}</p>}
              <div className="cc-form-actions">
                {available.map((d) => d === "START_REVIEW"
                  ? <button key={d} type="button" disabled={busy} onClick={() => void decide(d)}>{decisionCopy(d, ar).button}</button>
                  : <button key={d} type="button" className={d === "VERIFY" || d === "RESTORE" ? undefined : d === "REQUEST_INFORMATION" ? "cc-secondary" : "cc-secondary cc-danger-button cc-push"} disabled={busy} onClick={() => { setChoosing(d); setReason(""); setReasonMissing(false); }}>{decisionCopy(d, ar).button}</button>)}
              </div>
            </>
          )}
      </Section>
      <TechnicalDetails locale={locale} items={[[ar ? "رقم النسخة" : "Version number", String(row.revisionNumber)], [ar ? "حالة الملف" : "Dossier status", row.dossierStatus], [ar ? "رمز الحالة" : "Status code", row.status], [ar ? "رمز الاعتماد" : "Credential code", row.credentialType], [ar ? "معرّف المراجعة" : "Revision ID", row.id]]} />
    </>,
    row.organizationName ?? undefined,
  );
}
