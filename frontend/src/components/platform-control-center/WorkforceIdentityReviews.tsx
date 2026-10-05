"use client";

import { useState } from "react";
import type { Locale } from "@/lib/i18n";
import type { AdminApi } from "./admin-api";
import { EmptyState, ErrorNotice, Section, StatusBadge, SuccessNotice } from "./cc-ui";
import { ActionDialog, WorkforcePage, json, useRead } from "./workforce-ui";
import { when } from "./workforce-model";

type ReviewStatus = "PENDING_REVIEW" | "AWAITING_ACCEPTANCE" | "RESOLVED" | "REJECTED";
export type WorkforceIdentityReview = {
  id: string; invitationId: string; name: string; email: string; status: ReviewStatus;
  subject: string | null; reviewer: string | null; reason: string; revision: number;
  history: { status: ReviewStatus; actor: string; reason: string; at: string; revision: number }[];
};
const PATH = "/admin/platform-access/staff/identity-reviews";
const t = (locale: Locale, en: string, ar: string) => locale === "ar" ? ar : en;
const labels: Record<ReviewStatus, [string, string]> = {
  PENDING_REVIEW: ["Pending review", "بانتظار المراجعة"],
  AWAITING_ACCEPTANCE: ["Awaiting holder acceptance", "بانتظار قبول صاحب الهوية"],
  RESOLVED: ["Resolved", "تمت المعالجة"], REJECTED: ["Rejected", "مرفوض"],
};
const label = (status: ReviewStatus, locale: Locale) => labels[status]?.[locale === "ar" ? 1 : 0] ?? status;

export function WorkforceIdentityReviewsPage({ locale }: { locale: Locale }) {
  return <WorkforcePage locale={locale} active="workforceIdentity" title={t(locale, "Workforce Identity Reviews", "مراجعات هوية الموظفين")}
    intro={t(locale, "Review workforce invitation identity conflicts. An existing account must be accepted by its authenticated holder before workforce activation.", "راجع تعارضات هوية دعوات الموظفين. يجب أن يقبل صاحب الحساب الحالي الدعوة بعد تسجيل الدخول قبل تفعيل الموظف.")}
    allowed={(a) => a.can("WORKFORCE_ADMINISTER")}>
    {({ api }) => <Reviews api={api} locale={locale} />}
  </WorkforcePage>;
}

function Reviews({ api, locale }: { api: AdminApi; locale: Locale }) {
  const { data, error, reload } = useRead<WorkforceIdentityReview[]>(api, PATH);
  const [notice, setNotice] = useState("");
  const [dialog, setDialog] = useState<{ review: WorkforceIdentityReview; outcome: "RESOLVE" | "REJECT" } | null>(null);
  if (!data && error) return <ErrorNotice error={error} locale={locale} action="load" onRetry={reload} />;
  if (!data) return <p role="status">{t(locale, "Loading…", "جارٍ التحميل…")}</p>;
  const groups: { id: string; title: string; states: ReviewStatus[] }[] = [
    { id: "pending", title: label("PENDING_REVIEW", locale), states: ["PENDING_REVIEW"] },
    { id: "acceptance", title: label("AWAITING_ACCEPTANCE", locale), states: ["AWAITING_ACCEPTANCE"] },
    { id: "closed", title: t(locale, "Resolved and rejected", "المعالجة والمرفوضة"), states: ["RESOLVED", "REJECTED"] },
  ];
  return <>
    <SuccessNotice>{notice || null}</SuccessNotice>
    <ErrorNotice error={error} locale={locale} action="load" onRetry={reload} />
    <button type="button" className="cc-secondary" onClick={reload}>{t(locale, "Refresh reviews", "تحديث المراجعات")}</button>
    {groups.map((group) => {
      const rows = data.filter((review) => group.states.includes(review.status));
      return <Section key={group.id} id={group.id} title={group.title}>
        {!rows.length ? <EmptyState title={t(locale, "No reviews in this state", "لا توجد مراجعات بهذه الحالة")} /> : <ul className="cc-cards">{rows.map((review) => <li className="cc-card" key={review.id}>
          <h3><bdi>{review.name}</bdi></h3>
          <p className="cc-meta"><bdi dir="ltr">{review.email}</bdi></p>
          <p><StatusBadge tone={review.status === "REJECTED" ? "danger" : review.status === "RESOLVED" ? "success" : "warning"}>{label(review.status, locale)}</StatusBadge></p>
          <p>{t(locale, "Reason", "السبب")}: <bdi>{review.reason}</bdi></p>
          <p className="cc-meta">{t(locale, "Reviewer", "المراجع")}: <bdi>{review.reviewer ?? t(locale, "Not yet reviewed", "لم تتم المراجعة بعد")}</bdi></p>
          {review.subject && <p className="cc-meta">{t(locale, "Identity holder", "صاحب الهوية")}: <bdi dir="ltr">{review.subject}</bdi></p>}
          {review.status === "AWAITING_ACCEPTANCE" && <p>{t(locale, "The identity holder must sign in and accept the invitation. Workforce access remains inactive until activation requirements pass.", "يجب على صاحب الهوية تسجيل الدخول وقبول الدعوة. تبقى صلاحيات الموظف غير مفعلة حتى استيفاء متطلبات التفعيل.")}</p>}
          <details><summary>{t(locale, "Review history", "سجل المراجعة")}</summary>
            <ol>{review.history.map((entry) => <li key={entry.revision}>
              <p>{label(entry.status, locale)} · {when(entry.at, locale)} · <bdi>{entry.actor}</bdi></p>
              <p><bdi>{entry.reason}</bdi></p>
            </li>)}</ol>
          </details>
          {(review.status === "PENDING_REVIEW" || review.status === "AWAITING_ACCEPTANCE") && <div className="cc-step-actions">
            {review.status === "PENDING_REVIEW" && <button type="button" className="cc-secondary cc-small" onClick={() => setDialog({ review, outcome: "RESOLVE" })}>{t(locale, "Resolve identity", "معالجة الهوية")}</button>}
            <button type="button" className="cc-secondary cc-small cc-danger-button" onClick={() => setDialog({ review, outcome: "REJECT" })}>{t(locale, "Reject invitation", "رفض الدعوة")}</button>
          </div>}
        </li>)}</ul>}
      </Section>;
    })}
    {dialog && <ActionDialog locale={locale} title={dialog.outcome === "RESOLVE" ? t(locale, "Resolve this workforce identity?", "معالجة هوية هذا الموظف؟") : t(locale, "Reject this workforce invitation?", "رفض دعوة هذا الموظف؟")}
      confirm={dialog.outcome === "RESOLVE" ? t(locale, "Resolve identity", "معالجة الهوية") : t(locale, "Reject invitation", "رفض الدعوة")} danger={dialog.outcome === "REJECT"} onClose={() => setDialog(null)}
      onSubmit={async (reason) => {
        const result = await api<WorkforceIdentityReview>(`${PATH}/${encodeURIComponent(dialog.review.id)}/decision`, json("POST", { revision: dialog.review.revision, outcome: dialog.outcome, reason }));
        setNotice(result.status === "AWAITING_ACCEPTANCE" ? t(locale, "Identity confirmed; waiting for the holder to accept.", "تم تأكيد الهوية؛ بانتظار قبول صاحبها.") : t(locale, "Review decision recorded.", "تم تسجيل قرار المراجعة."));
        setDialog(null); reload();
      }}>
      <p><bdi>{dialog.review.name}</bdi> · <bdi dir="ltr">{dialog.review.email}</bdi></p>
      <p>{dialog.outcome === "RESOLVE" ? t(locale, "The identity directory is checked again. A matching existing identity needs holder acceptance; if no identity exists, account creation is queued. This decision does not activate workforce access.", "يتم التحقق من دليل الهوية مجدداً. تتطلب الهوية الحالية المطابقة قبول صاحبها؛ وإذا لم توجد هوية، يُدرج إنشاء الحساب في قائمة الانتظار. لا يفعّل هذا القرار صلاحيات الموظف.") : t(locale, "The invitation is rejected. The existing identity account is not changed.", "تُرفض الدعوة. لا يتغير حساب الهوية الحالي.")}</p>
    </ActionDialog>}
  </>;
}
