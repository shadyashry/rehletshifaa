"use client";

import { useState } from "react";
import { ArrowRight, CalendarClock, CircleAlert, FileText, MessageSquareText } from "lucide-react";

import type { Locale } from "@/lib/i18n";
import { waitingLabel } from "@/components/portal/MyWork";

export type CurrentWork = { id: string; type?: string; title: string; description?: string; dueAt?: string | null; overdue?: boolean; version: number };
export type ResponseContext = { message?: string | null; documentName?: string | null; receivedAt?: string | null };
export type SecondaryAction = { label: string; onClick: () => void };

/**
 * The single strongest element on a case page: where we are, who has the ball, and the one thing to do
 * next — labelled by its business outcome, never by the mechanics of the task ("complete task").
 *
 * <p>The action comes from the work item the domain actually opened; when nothing is assigned it falls
 * back to the stage the case is in. Future workflow steps are deliberately absent until this one is done.
 */
export function CurrentActionPanel({ locale, role, status, waitingOn, pendingAssignment, owned = true, work, response,
                                     busy, secondary = [], onComplete, onFocusAction, onClaim, onAcceptAssignment, onDeclineAssignment, viewerRole }: {
  locale: Locale; role: string; status: string; waitingOn?: string | null; pendingAssignment: boolean;
  owned?: boolean; work?: CurrentWork | null; response?: ResponseContext | null; busy?: boolean; viewerRole?: string;
  secondary?: SecondaryAction[]; onComplete?: (evidence: string) => void; onFocusAction?: () => void; onClaim?: () => void;
  onAcceptAssignment?: () => void; onDeclineAssignment?: () => void;
}) {
  const ar = locale === "ar";
  const [confirming, setConfirming] = useState(false);
  const [note, setNote] = useState("");
  if (role === "patient") return null;

  const primary = resolvePrimary({ role, status, waitingOn, pendingAssignment, owned, work, ar });
  const guidance = pendingAssignment ? assignmentGuidance(role, ar) : work ? null : stageGuidance(role, status, waitingOn, owned, ar);
  const title = pendingAssignment ? guidance!.title : (work?.title ?? guidance?.title ?? "");
  const body = pendingAssignment ? guidance!.body : (work?.description ?? guidance?.body);
  const showResponse = !pendingAssignment && !!response && (!!response.message || !!response.documentName);

  return (
    <section id="current-action" aria-labelledby="current-action-title"
             className="mt-4 rounded-xl border border-brand-200 bg-white p-4 shadow-[0_1px_2px_rgba(28,51,58,0.04)] sm:p-5">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-[0.7rem] font-bold uppercase tracking-[0.1em] text-brand-700">
          {ar ? "الإجراء الحالي" : "Current action"}
        </p>
        {waitingOn && waitingOn !== "NONE" && waitingOn !== "STAFF" && (
          <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-[0.72rem] font-bold text-amber-900">
            {ar ? "بانتظار" : "Waiting on"}: {waitingLabel(waitingOn, locale, viewerRole ?? role)}
          </span>
        )}
        {work?.dueAt && (
          <span className={`inline-flex items-center gap-1 text-[0.75rem] ${work.overdue ? "font-bold text-alert-700" : "text-ink-500"}`}>
            {work.overdue ? <CircleAlert size={13} aria-hidden/> : <CalendarClock size={13} aria-hidden/>}
            {work.overdue ? (ar ? "متأخر" : "Overdue") : (ar ? "الاستحقاق" : "Due")}{": "}
            {new Date(work.dueAt).toLocaleDateString(locale, { day: "numeric", month: "short" })}
          </span>
        )}
      </div>

      <h2 id="current-action-title" className="mt-1.5 text-[1.1rem] font-bold leading-6 text-brand-900">{title}</h2>
      {body && <p className="mt-1 max-w-2xl text-[0.88rem] leading-6 text-ink-600">{body}</p>}

      {/* What the coordinator has to look at, inline — reviewing should not require navigating away. */}
      {showResponse && (
        <div className="mt-3 rounded-lg border border-line bg-mist p-3">
          {response?.message && (
            <p className="flex gap-2 text-[0.88rem] leading-6 text-ink-700">
              <MessageSquareText size={15} aria-hidden className="mt-1 flex-none text-brand-600"/>
              <span className="line-clamp-3">{response.message}</span>
            </p>
          )}
          {response?.documentName && (
            <p className="mt-1.5 flex items-center gap-2 text-[0.85rem] font-semibold text-ink-700">
              <FileText size={15} aria-hidden className="flex-none text-brand-600"/>{response.documentName}
            </p>
          )}
        </div>
      )}

      {confirming && primary.kind === "complete" ? (
        <form className="mt-4" onSubmit={event => { event.preventDefault(); onComplete?.(note.trim() || primary.label); setConfirming(false); setNote(""); }}>
          <label className="block text-[0.8rem] font-bold text-ink-700">
            {ar ? "ملاحظة للسجل (اختياري)" : "Note for the record (optional)"}
            <input className="field mt-1.5" value={note} maxLength={2000} onChange={event => setNote(event.target.value)}
                   placeholder={ar ? "ما الذي راجعته؟" : "What did you review?"} autoFocus/>
          </label>
          <div className="mt-3 flex flex-wrap gap-2">
            <button className="btn-primary" disabled={busy}>{primary.label}</button>
            <button type="button" className="btn-secondary" onClick={() => setConfirming(false)}>{ar ? "إلغاء" : "Cancel"}</button>
          </div>
        </form>
      ) : (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          {primary.kind !== "none" && (
            <button type="button" className="btn-primary" disabled={busy}
                    onClick={() => { if (primary.kind === "complete") setConfirming(true); else if (primary.kind === "claim") onClaim?.(); else if (primary.kind === "accept") onAcceptAssignment?.(); else onFocusAction?.(); }}>
              {primary.label}<ArrowRight size={16} aria-hidden className="rtl:rotate-180"/>
            </button>
          )}
          {primary.kind === "accept" && onDeclineAssignment && (
            <button type="button" className="btn-secondary" disabled={busy} onClick={onDeclineAssignment}>{ar ? "رفض" : "Decline"}</button>
          )}
          {(primary.kind === "accept" ? [] : secondary).slice(0, 2).map(action => (
            <button key={action.label} type="button" className="btn-secondary" disabled={busy} onClick={action.onClick}>{action.label}</button>
          ))}
        </div>
      )}
    </section>
  );
}

type Primary = { label: string; kind: "complete" | "focus" | "claim" | "accept" | "none" };

/**
 * One action per state. A work item assigned to this person always wins — it is what the workflow is
 * actually waiting for — and its label names the outcome, not the mechanics.
 */
function resolvePrimary({ role, status, waitingOn, pendingAssignment, owned, work, ar }: {
  role: string; status: string; waitingOn?: string | null; pendingAssignment: boolean; owned: boolean;
  work?: CurrentWork | null; ar: boolean;
}): Primary {
  if (pendingAssignment) return { label: ar ? "قبول التعيين" : "Accept assignment", kind: "accept" };
  if (role === "coordinator" && !owned) {
    return status === "RECEIVED"
      ? { label: ar ? "استلام مسؤولية الحالة" : "Take ownership", kind: "claim" }
      : { label: "", kind: "none" };
  }
  if (work) {
    const label = WORK_LABELS[work.type ?? ""] ?? { en: "Mark reviewed", ar: "تأكيد المراجعة", kind: "complete" as const };
    return { label: ar ? label.ar : label.en, kind: label.kind };
  }
  // Blocked on somebody else: offering the next workflow step here is exactly the premature action
  // this panel exists to prevent. Secondary actions still let staff nudge or record a reply.
  if (waitingOn && ["PATIENT", "CONSULTANT", "HOSPITAL", "EXTERNAL", "PAYMENT"].includes(waitingOn)) return { label: "", kind: "none" };
  if (role === "coordinator") {
    if (["INTAKE_REVIEW", "INFORMATION_REQUIRED", "READY_FOR_CONSULTANT"].includes(status))
      return { label: ar ? "تعيين استشاري" : "Assign consultant", kind: "focus" };
    if (["CLINICAL_RECOMMENDATION_READY", "PROPOSAL_PREPARATION", "REVISION_REQUESTED"].includes(status))
      return { label: ar ? "تجهيز العرض" : "Prepare proposal", kind: "focus" };
    if (["ACCEPTED", "TRAVEL_COORDINATION"].includes(status))
      return { label: ar ? "بدء تنسيق العلاج" : "Start treatment coordination", kind: "focus" };
    return { label: "", kind: "none" };
  }
  if (role === "doctor" && status === "CONSULTANT_REVIEW") return { label: ar ? "تسجيل القرار السريري" : "Record clinical decision", kind: "focus" };
  if (role === "operations" && ["ACCEPTED", "TRAVEL_COORDINATION"].includes(status)) return { label: ar ? "استكمال الترتيبات" : "Complete arrangements", kind: "focus" };
  if (role === "finance" && status === "PROPOSAL_PREPARATION") return { label: ar ? "اعتماد الشروط المالية" : "Approve commercial terms", kind: "focus" };
  return { label: "", kind: "none" };
}

/**
 * Work-item types map to the business outcome of finishing them. Some are acknowledged here (the review
 * happened in this panel); others hand off to the form that does the real work, so the CTA focuses it
 * rather than pretending the item is done.
 */
const WORK_LABELS: Record<string, { en: string; ar: string; kind: "complete" | "focus" }> = {
  REVIEW_PATIENT_RESPONSE: { en: "Accept & continue", ar: "قبول ومتابعة", kind: "complete" },
  CLINICAL_REVIEW: { en: "Start clinical review", ar: "بدء المراجعة السريرية", kind: "focus" },
  PREPARE_PROPOSAL: { en: "Prepare proposal", ar: "تجهيز العرض", kind: "focus" },
  PROPOSAL_REVISION: { en: "Revise proposal", ar: "تعديل العرض", kind: "focus" },
  PROPOSAL_DECLINED_REVIEW: { en: "Acknowledge outcome", ar: "تأكيد الاطلاع", kind: "complete" },
  CLINICAL_OUTCOME_REVIEW: { en: "Acknowledge outcome", ar: "تأكيد الاطلاع", kind: "complete" },
  TRAVEL: { en: "Start treatment coordination", ar: "بدء تنسيق العلاج", kind: "focus" },
  REASSIGN_CONSULTANT: { en: "Reassign consultant", ar: "إعادة تعيين استشاري", kind: "focus" },
  REVIEW: { en: "Mark reviewed", ar: "تأكيد المراجعة", kind: "complete" },
  INFORMATION_REQUEST: { en: "Mark handled", ar: "تأكيد المعالجة", kind: "complete" },
};

/** When nothing is assigned, describe the stage — including the honest "nothing to do yet" cases. */
function stageGuidance(role: string, status: string, waitingOn: string | null | undefined, owned: boolean, ar: boolean) {
  if (role === "coordinator" && !owned) return status === "RECEIVED"
    ? { title: ar ? "هذه الحالة بلا منسق" : "This case has no coordinator", body: ar ? "راجع بيانات الاستقبال ثم استلم الحالة لبدء العمل." : "Review the intake details, then take ownership to start work." }
    : { title: ar ? "حالة يملكها منسق آخر" : "Owned by another coordinator", body: ar ? "لديك صلاحية العرض فقط." : "You have view-only access to this case." };
  if (waitingOn === "PATIENT") return {
    title: ar ? "بانتظار رد المريض" : "Waiting for the patient",
    body: ar ? "لا يلزمك إجراء الآن. يمكنك التذكير أو تسجيل رده إن وصل عبر واتساب أو الهاتف." : "Nothing is needed from you right now. You can send a reminder, or record their reply if it arrives by WhatsApp or phone.",
  };
  if (waitingOn === "CONSULTANT") return {
    title: ar ? "بانتظار الاستشاري" : "Waiting for the consultant",
    body: ar ? "ستعود الحالة إليك فور تسجيل التوصية السريرية." : "The case returns to you as soon as the clinical recommendation is recorded.",
  };
  if (waitingOn === "PAYMENT") return {
    title: ar ? "بانتظار وديعة التنسيق" : "Waiting for the coordination deposit",
    body: ar ? "تستكمل الرحلة تلقائيًا فور تأكيد الدفع." : "The journey continues automatically once the payment is confirmed.",
  };
  if (role === "coordinator" && ["INTAKE_REVIEW", "INFORMATION_REQUIRED", "READY_FOR_CONSULTANT"].includes(status)) return {
    title: ar ? "جهّز الحالة للاستشاري" : "Prepare the case for a consultant",
    body: ar ? "أكمل ما ينقص ثم عيّن استشاريًا معتمدًا لمجال الرعاية." : "Complete anything missing, then assign a verified consultant for the care area.",
  };
  if (role === "coordinator" && ["CLINICAL_RECOMMENDATION_READY", "PROPOSAL_PREPARATION", "REVISION_REQUESTED"].includes(status)) return {
    title: ar ? "جهّز عرض المريض" : "Prepare the patient proposal",
    body: ar ? "راجع التوصية المعتمدة والمتطلبات الداخلية قبل الإصدار." : "Review the approved recommendation and internal requirements before releasing it.",
  };
  if (role === "coordinator" && ["ACCEPTED", "TRAVEL_COORDINATION"].includes(status)) return {
    title: ar ? "ابدأ تنسيق العلاج" : "Start treatment coordination",
    body: ar ? "تابع الترتيبات المطلوبة لبدء رحلة العلاج." : "Continue the arrangements needed to start the treatment journey.",
  };
  if (role === "doctor" && status === "CONSULTANT_REVIEW") return {
    title: ar ? "سجّل قرارك السريري" : "Record your clinical decision",
    body: ar ? "راجع ملخص الاستقبال والمستندات ثم سجّل التوصية." : "Review the intake summary and documents, then record your recommendation.",
  };
  return {
    title: ar ? "لا يوجد إجراء مطلوب الآن" : "Nothing needs you right now",
    body: ar ? "ستظهر الخطوة التالية هنا فور توفرها." : "The next step appears here as soon as it is due.",
  };
}

/** Before acceptance the page is an assignment decision, not clinical work. */
function assignmentGuidance(role: string, ar: boolean) {
  return role === "doctor"
    ? { title: ar ? "تعيين سريري جديد" : "New clinical assignment",
        body: ar ? "راجع ملخص الحالة والمستندات، ثم اقبل التعيين لبدء المراجعة السريرية أو ارفضه ليعيد المنسق تعيينه."
                 : "Review the case summary and documents, then accept to begin your clinical review — or decline so the coordinator can reassign it." }
    : { title: ar ? "تعيين جديد" : "New assignment",
        body: ar ? "راجع الحالة ثم اقبل التعيين أو ارفضه ليعيد المنسق تعيينه."
                 : "Review the case, then accept the assignment or decline so the coordinator can reassign it." };
}
