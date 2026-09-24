"use client";

import type { ReactNode } from "react";
import { AlertTriangle, ExternalLink, FileText, Info } from "lucide-react";
import type { Locale } from "@/lib/i18n";
import { EmptyState, StatusBadge } from "./cc-ui";
import { countryName, credentialTypeLabel, formatDate } from "./admin-labels";
import { historyEventLabel, validityText, type HistoryEntry, type ReviewDetail, type Validity } from "./credential-lifecycle";

/** Validity in words, never colour alone: "Expires 14 Oct 2026", "Expiring soon · Expires in 21 days", "Expired 14 Sep 2026". */
export function ValidityLine({ validity, locale, none }: { validity: Validity; locale: Locale; none?: string }) {
  const v = validityText(validity, locale);
  if (!v) return none ? <span className="cc-meta">{none}</span> : null;
  return (
    <span className={`cc-validity cc-validity-${validity.kind}`}>
      {v.soon && <StatusBadge tone="warning">{locale === "ar" ? "تنتهي قريبًا" : "Expiring soon"}</StatusBadge>}
      {validity.kind === "expired" && <AlertTriangle size={14} aria-hidden />}
      <span>{v.label}</span>
    </span>
  );
}

const notProvided = (ar: boolean) => <span className="cc-meta">{ar ? "لم يُقدَّم" : "Not provided"}</span>;

/**
 * What the submitter declared. Presented as submitted information — neutral, never with a verified treatment — because
 * entering or showing a value is not verification.
 */
export function SubmittedInformation({ detail, locale, validity }: { detail: ReviewDetail; locale: Locale; validity: Validity }) {
  const ar = locale === "ar";
  const f = detail.submittedFacts;
  if (!f) return <p className="cc-meta">{ar ? "تعذّر عرض المعلومات المقدَّمة لهذا الاعتماد. لا تتحقق منه دون مقارنة المعلومات بالمستندات." : "The submitted information for this credential couldn't be shown. Don't verify it without comparing the declared facts with the documents."}</p>;
  const text = (value: string | null, ltr = false) => (value ? (ltr ? <bdi dir="ltr">{value}</bdi> : <bdi>{value}</bdi>) : notProvided(ar));
  const rows: [string, ReactNode][] = [
    [ar ? "نوع الاعتماد" : "Credential type", credentialTypeLabel(detail.credentialType, locale)],
    [ar ? "رقم الترخيص أو المرجع" : "Licence or reference number", text(f.referenceNumber, true)],
    [ar ? "جهة الإصدار" : "Issued by", text(f.issuer)],
    [ar ? "دولة الترخيص" : "Licensing country", f.jurisdiction ? <bdi>{countryName(f.jurisdiction, locale)}</bdi> : notProvided(ar)],
    [ar ? "تاريخ الإصدار" : "Issue date", f.issuedAt ? formatDate(f.issuedAt, locale) : notProvided(ar)],
    [ar ? "تاريخ الانتهاء" : "Expiry date", detail.expiresAt ? <span className="cc-fact-stack">{formatDate(detail.expiresAt, locale)}<ValidityLine validity={validity} locale={locale} /></span> : (ar ? "لم يُصرَّح بتاريخ انتهاء" : "No expiry date declared")],
  ];
  return (
    <div className="cc-submitted">
      <p className="cc-submitted-note"><Info size={15} aria-hidden />{ar ? "أدخلها مقدّم الطلب. تبقى معلومات مقدَّمة — وليست معلومات تم التحقق منها — إلى أن يتحقق مراجع مستقل من الاعتماد." : "Entered by the submitter. This is submitted information — not verified information — until an independent reviewer verifies the credential."}</p>
      <dl className="cc-facts">{rows.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>
    </div>
  );
}

const size = (bytes: number) => (bytes >= 1_048_576 ? `${(bytes / 1_048_576).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`);
const typeName = (contentType: string) => (contentType.includes("pdf") ? "PDF" : contentType.includes("png") ? "PNG" : contentType.includes("jpeg") || contentType.includes("jpg") ? "JPG" : contentType);

/** Evidence = a document is attached and passed the security scan. What it proves is checked in the independent review. */
export function EvidenceList({ detail, locale, onView, busyId }: { detail: ReviewDetail; locale: Locale; onView?: (id: string) => void; busyId?: string | null }) {
  const ar = locale === "ar";
  const items = detail.evidence ?? detail.evidenceIds.map((id) => ({ id, fileName: "", contentType: "", sizeBytes: 0, securityCheck: "CLEAN", checkedAt: null, uploadedByName: null, uploadedAt: detail.submittedAt }));
  if (!items.length) return <EmptyState title={ar ? "لا توجد مستندات مرفقة" : "No evidence documents are attached"} />;
  return (
    <>
      <p className="cc-meta">{ar ? "المستند مرفق واجتاز الفحص الأمني. التحقق مما يثبته جزء من المراجعة المستقلة." : "Evidence submitted: the document is attached and passed the security scan. Checking what it shows is part of the independent review."}</p>
      <ul className="cc-doc-list">
        {items.map((e, i) => {
          const name = e.fileName || (ar ? `المستند ${i + 1}` : `Document ${i + 1}`);
          return (
            <li key={e.id}>
              <span className="cc-doc-main">
                <span><FileText size={16} aria-hidden /> <bdi dir="ltr">{name}</bdi>{e.contentType && <span className="cc-meta"> · <bdi dir="ltr">{typeName(e.contentType)}{e.sizeBytes ? ` · ${size(e.sizeBytes)}` : ""}</bdi></span>}</span>
                <span className="cc-row-sub">
                  {ar ? "رُفع" : "Uploaded"} {formatDate(e.uploadedAt, locale)}{e.uploadedByName && <> {ar ? "بواسطة" : "by"} <bdi>{e.uploadedByName}</bdi></>}
                  {" · "}{e.securityCheck === "CLEAN" ? (ar ? "اجتاز الفحص الأمني" : "Passed the security scan") : (ar ? "لم يكتمل الفحص الأمني" : "Security scan not complete")}
                </span>
              </span>
              {onView && <button type="button" className="cc-secondary cc-small" disabled={busyId === e.id} aria-label={`${ar ? "عرض المستند" : "View document"}: ${name}`} onClick={() => onView(e.id)}><ExternalLink size={15} aria-hidden />{busyId === e.id ? (ar ? "جارٍ تجهيز رابط آمن…" : "Preparing a secure link…") : (ar ? "عرض المستند" : "View document")}</button>}
            </li>
          );
        })}
      </ul>
    </>
  );
}

/**
 * Credential history under progressive disclosure. Reviewers see reviewer names and reasons; the provider side sees outcomes
 * and dates, and only the reviewer's request for more information (the backend already filters what it returns).
 */
export function CredentialHistory({ history, locale, reviewerView, open }: { history: HistoryEntry[] | undefined; locale: Locale; reviewerView: boolean; open?: boolean }) {
  const ar = locale === "ar";
  if (!history?.length) return null;
  const who = (h: HistoryEntry) => {
    if (h.byYou) return ar ? "أنت" : "you";
    const submission = h.event === "SUBMITTED" || h.event === "RESUBMITTED";
    if (h.actorName) return <bdi>{h.actorName}</bdi>;
    return submission ? (ar ? "عضو في فريق مقدم الرعاية" : "a provider team member") : (ar ? "فريق مراجعة الاعتمادات" : "the Credential Review Team");
  };
  return (
    <details className="cc-history" open={open}>
      <summary>{ar ? `السجل (${history.length})` : `History (${history.length})`}</summary>
      <ol aria-label={ar ? "سجل الاعتماد" : "Credential history"}>
        {history.map((h, i) => (
          <li key={`${h.event}-${h.at}-${i}`}>
            <span className="cc-history-date">{formatDate(h.at, locale)}</span>
            <span>
              <strong>{historyEventLabel(h.event, locale)}</strong>
              <span className="cc-row-sub">{ar ? `النسخة ${h.revisionNumber}` : `Version ${h.revisionNumber}`} · {ar ? "بواسطة" : "by"} {who(h)}</span>
              {h.reason && <span className="cc-history-reason">{h.event === "MORE_INFORMATION_REQUIRED" ? (ar ? "الطلب: " : "Request: ") : (ar ? "السبب: " : "Reason: ")}<q><bdi>{h.reason}</bdi></q></span>}
            </span>
          </li>
        ))}
      </ol>
      {!reviewerView && <p className="cc-meta">{ar ? "ملاحظات المراجعين الداخلية لا تظهر هنا؛ يظهر فقط طلب المعلومات الموجّه إلى فريق مقدم الرعاية." : "Reviewers' internal notes are not shown here; only a request for more information, which is addressed to the provider team, is shown."}</p>}
    </details>
  );
}

/**
 * More information required, in business terms: what the reviewer asked for, who provides it and how the review resumes.
 * `request` is the reviewer's stored request; nothing is invented when it is missing.
 */
export function MoreInformationNotice({ request, locale, action, responsible, headingLevel = 3 }: { request: HistoryEntry | undefined; locale: Locale; action?: ReactNode; responsible?: string; headingLevel?: 3 | 4 }) {
  const ar = locale === "ar";
  const H = headingLevel === 3 ? "h3" : "h4";
  return (
    <div className="cc-notice cc-notice-warning" role="note" aria-label={ar ? "مطلوب مزيد من المعلومات" : "More information required"}>
      <AlertTriangle size={18} aria-hidden />
      <div>
        <H className="cc-notice-title">{ar ? "مطلوب مزيد من المعلومات" : "More information required"}</H>
        {request?.reason ? <><p>{ar ? "طلب المراجِع:" : "The reviewer requested:"}</p><blockquote><bdi>{request.reason}</bdi></blockquote></>
          : <p>{ar ? "طلب المراجِع معلومات إضافية." : "The reviewer asked for more information."}</p>}
        {request && <p className="cc-meta">{ar ? "طُلب في" : "Requested on"} {formatDate(request.at, locale)}</p>}
        <p><strong>{ar ? "المسؤول: " : "Responsible: "}</strong>{responsible ?? (ar ? "عمليات مقدمي الرعاية أو الطبيب" : "Provider Operations or the clinician")}</p>
        <p className="cc-meta">{ar ? "تُستأنف المراجعة عند إرسال نسخة جديدة من هذا الاعتماد؛ تعود النسخة الجديدة إلى قائمة المراجعة." : "The review resumes when a new version of this credential is submitted; the new version returns to the review queue."}</p>
        {action}
      </div>
    </div>
  );
}
