"use client";

import { useState } from "react";
import { ArrowRight, CalendarClock, CircleAlert, FileText, MessageSquareText } from "lucide-react";

import type { Locale } from "@/lib/i18n";

/** The backend's resolution of what this person should do now — rendered, never re-derived here. */
export type CurrentActionView = {
  code: string; kind: "COMPLETE" | "FOCUS" | "CLAIM" | "ACCEPT" | "WAIT" | "NONE";
  title?: string | null; context?: string | null; workItemId?: string | null; workItemVersion?: number | null;
  workType?: string | null; dueAt?: string | null; overdue?: boolean; blockerCode?: string | null;
};
export type BlockerView = { code: string; labelEn: string; labelAr: string; owner: "PATIENT" | "STAFF" | "LATER"; gating: boolean };
export type CaseActions = { journeyStage: string; waitingOn?: string | null; waitingReason?: string | null; currentAction: CurrentActionView; blockers: BlockerView[]; availableActions: string[] };
export type ResponseContext = { message?: string | null; documentName?: string | null; receivedAt?: string | null };
export type SecondaryAction = { label: string; onClick: () => void };

/**
 * The single strongest element on a case page: the one thing to do next, labelled by its business
 * outcome. Who has the ball is stated once, in the case header; this panel explains why.
 *
 * <p>Everything here comes from the backend's action contract. Future workflow steps are absent until
 * they become the current action, and nothing is offered that the backend would refuse.
 */
export function CurrentActionPanel({ locale, role, action, response, busy, secondary = [], onComplete, onFocusAction, onClaim, onAcceptAssignment, onDeclineAssignment }: {
  locale: Locale; role: string; action: CurrentActionView; response?: ResponseContext | null; busy?: boolean;
  secondary?: SecondaryAction[]; onComplete?: (evidence: string) => void; onFocusAction?: () => void; onClaim?: () => void;
  onAcceptAssignment?: () => void; onDeclineAssignment?: () => void;
}) {
  const ar = locale === "ar";
  const [confirming, setConfirming] = useState(false);
  const [note, setNote] = useState("");
  if (role === "patient") return null;

  const copy = describe(action, role, ar);
  const primary = primaryFor(action, ar);
  const showResponse = !!response && (!!response.message || !!response.documentName);
  const waiting = action.kind === "WAIT" || action.kind === "NONE";

  return (
    <section id="current-action" aria-labelledby="current-action-title"
             className={`mt-4 rounded-xl border bg-white p-4 shadow-[0_1px_2px_rgba(28,51,58,0.04)] sm:p-5 ${waiting ? "border-line" : "border-brand-200"}`}>
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-[0.7rem] font-bold uppercase tracking-[0.1em] text-brand-700">
          {ar ? "الإجراء الحالي" : "Current action"}
        </p>
        {action.dueAt && (
          <span className={`inline-flex items-center gap-1 text-[0.75rem] ${action.overdue ? "font-bold text-alert-700" : "text-ink-500"}`}>
            {action.overdue ? <CircleAlert size={13} aria-hidden/> : <CalendarClock size={13} aria-hidden/>}
            {action.overdue ? (ar ? "متأخر" : "Overdue") : (ar ? "الاستحقاق" : "Due")}{": "}
            {new Date(action.dueAt).toLocaleDateString(locale, { day: "numeric", month: "short" })}
          </span>
        )}
      </div>

      <h2 id="current-action-title" className="mt-1.5 text-[1.1rem] font-bold leading-6 text-brand-900">{copy.title}</h2>
      {copy.body && <p className="mt-1 max-w-2xl text-[0.88rem] leading-6 text-ink-600">{copy.body}</p>}

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
                   placeholder={ar ? "ما الذي أنجزته؟" : "What did you do?"} autoFocus/>
          </label>
          <div className="mt-3 flex flex-wrap gap-2">
            <button className="btn-primary" disabled={busy}>{primary.label}</button>
            <button type="button" className="btn-secondary" onClick={() => setConfirming(false)}>{ar ? "إلغاء" : "Cancel"}</button>
          </div>
        </form>
      ) : (primary.kind !== "none" || secondary.length > 0) && (
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
          {(primary.kind === "accept" ? [] : secondary).slice(0, 2).map(item => (
            <button key={item.label} type="button" className="btn-secondary" disabled={busy} onClick={item.onClick}>{item.label}</button>
          ))}
        </div>
      )}
    </section>
  );
}

type Primary = { label: string; kind: "complete" | "focus" | "claim" | "accept" | "none" };

/** One button per state, named for the outcome. Waiting states have none: offering a future step here is the premature action this panel exists to prevent. */
function primaryFor(action: CurrentActionView, ar: boolean): Primary {
  switch (action.kind) {
    case "CLAIM": return { label: ar ? "استلام مسؤولية الحالة" : "Take ownership", kind: "claim" };
    case "ACCEPT": return { label: ar ? "قبول التعيين" : "Accept assignment", kind: "accept" };
    case "COMPLETE": case "FOCUS": {
      const byWork = action.workType ? WORK_LABELS[action.workType] : undefined;
      const label = byWork ?? ACTION_LABELS[action.code] ?? { en: "Mark done", ar: "تأكيد الإنجاز" };
      return { label: ar ? label.ar : label.en, kind: action.kind === "COMPLETE" ? "complete" : "focus" };
    }
    default: return { label: "", kind: "none" };
  }
}

/** Work-item types map to the business outcome of finishing them. */
const WORK_LABELS: Record<string, { en: string; ar: string }> = {
  REVIEW_PATIENT_RESPONSE: { en: "Accept & continue", ar: "قبول ومتابعة" },
  CLINICAL_REVIEW: { en: "Start clinical review", ar: "بدء المراجعة السريرية" },
  PREPARE_PROPOSAL: { en: "Prepare proposal", ar: "تجهيز العرض" },
  PROPOSAL_REVISION: { en: "Revise proposal", ar: "تعديل العرض" },
  PROPOSAL_DECLINED_REVIEW: { en: "Acknowledge outcome", ar: "تأكيد الاطلاع" },
  CLINICAL_OUTCOME_REVIEW: { en: "Acknowledge outcome", ar: "تأكيد الاطلاع" },
  DEPOSIT_ARRANGEMENT: { en: "Payment instructions sent", ar: "تم إرسال تعليمات الدفع" },
  TRAVEL: { en: "Assign Operations", ar: "تعيين فريق العمليات" },
  REASSIGN_CONSULTANT: { en: "Reassign consultant", ar: "إعادة تعيين استشاري" },
  REVIEW: { en: "Mark reviewed", ar: "تأكيد المراجعة" },
  INFORMATION_REQUEST: { en: "Mark handled", ar: "تأكيد المعالجة" },
};

const ACTION_LABELS: Record<string, { en: string; ar: string }> = {
  ASSIGN_CONSULTANT: { en: "Assign consultant", ar: "تعيين استشاري" },
  PREPARE_PROPOSAL: { en: "Prepare proposal", ar: "تجهيز العرض" },
  RELEASE_PROPOSAL: { en: "Review & release", ar: "مراجعة وإصدار" },
  ASSIGN_OPERATIONS: { en: "Assign Operations", ar: "تعيين فريق العمليات" },
  ASSIGN_FINANCE: { en: "Assign Finance", ar: "تعيين المالية" },
  RECORD_CLINICAL_DECISION: { en: "Record clinical decision", ar: "تسجيل القرار السريري" },
  UPDATE_TRAVEL_PLAN: { en: "Complete arrangements", ar: "استكمال الترتيبات" },
  APPROVE_COMMERCIAL_TERMS: { en: "Approve commercial terms", ar: "اعتماد الشروط المالية" },
};

/** Title and explanation per resolved action. A work item speaks for itself; everything else is described here. */
function describe(action: CurrentActionView, role: string, ar: boolean): { title: string; body?: string | null } {
  if (action.code === "WORK_ITEM") return { title: action.title ?? "", body: action.context };
  const t = (en: string, arabic: string) => (ar ? arabic : en);
  switch (action.code) {
    case "CLAIM_CASE": return { title: t("This case has no coordinator", "هذه الحالة بلا منسق"), body: t("Review the intake details, then take ownership to start work.", "راجع بيانات الاستقبال ثم استلم الحالة لبدء العمل.") };
    case "VIEW_ONLY": return { title: t("Owned by another coordinator", "حالة يملكها منسق آخر"), body: t("You have view-only access to this case.", "لديك صلاحية العرض فقط.") };
    case "ACCEPT_ASSIGNMENT": return role === "doctor"
      ? { title: t("New clinical assignment", "تعيين سريري جديد"), body: t("Review the case summary and documents, then accept to begin your clinical review — or decline so the coordinator can reassign it.", "راجع ملخص الحالة والمستندات، ثم اقبل التعيين لبدء المراجعة السريرية أو ارفضه ليعيد المنسق تعيينه.") }
      : { title: t("New assignment", "تعيين جديد"), body: t("Review the case, then accept the assignment or decline so the coordinator can reassign it.", "راجع الحالة ثم اقبل التعيين أو ارفضه ليعيد المنسق تعيينه.") };
    case "WAIT_PATIENT_INFORMATION": return { title: t("Waiting for the patient's information", "بانتظار معلومات المريض"), body: t("Nothing is needed from you right now. If their reply arrives by WhatsApp or phone, record it from More actions.", "لا يلزمك إجراء الآن. إن وصل رد المريض عبر واتساب أو الهاتف، سجّله من «إجراءات إضافية».") };
    case "WAIT_PATIENT_READINESS": return readinessWait(action.blockerCode, ar);
    case "WAIT_CONSULTANT": return { title: t("Waiting for the consultant", "بانتظار الاستشاري"), body: t("The case returns to you as soon as the clinical recommendation is recorded.", "ستعود الحالة إليك فور تسجيل التوصية السريرية.") };
    case "WAIT_PATIENT_DECISION": return { title: t("With the patient", "لدى المريض"), body: t("The proposal was delivered. The case returns to you when they decide.", "تم تسليم العرض. ستعود الحالة إليك عند قرار المريض.") };
    case "WAIT_PAYMENT": return { title: t("Waiting for the coordination deposit", "بانتظار وديعة التنسيق"), body: t("Finance records the receipt; the journey continues automatically once it is confirmed.", "يسجّل قسم المالية الاستلام وتستكمل الرحلة تلقائيًا فور التأكيد.") };
    case "WAIT_OPERATIONS": return { title: t("Operations is arranging travel and arrival", "فريق العمليات يرتّب السفر والوصول"), body: t("The case continues once the arrangements are confirmed.", "تستكمل الحالة فور تأكيد الترتيبات.") };
    case "ASSIGN_CONSULTANT": return { title: t("Prepare the case for a consultant", "جهّز الحالة للاستشاري"), body: t("Complete anything missing, then assign a verified consultant for the care area.", "أكمل ما ينقص ثم عيّن استشاريًا معتمدًا لمجال الرعاية.") };
    case "PREPARE_PROPOSAL": return { title: t("Prepare the patient proposal", "جهّز عرض المريض"), body: t("Review the approved recommendation and internal requirements before releasing it.", "راجع التوصية المعتمدة والمتطلبات الداخلية قبل الإصدار.") };
    case "RELEASE_PROPOSAL": return { title: t("Release the proposal to the patient", "أصدر العرض للمريض"), body: t("Check the release requirements, then release the secure link.", "تحقق من متطلبات الإصدار ثم أرسل الرابط الآمن.") };
    case "ASSIGN_OPERATIONS": return { title: t("Start treatment coordination", "ابدأ تنسيق العلاج"), body: t("The deposit is settled. Assign Operations to arrange travel and arrival.", "تم تسوية الوديعة. عيّن فريق العمليات لترتيب السفر والوصول.") };
    case "ASSIGN_FINANCE": return { title: t("Finance must approve the commercial terms", "يلزم اعتماد المالية للشروط التجارية"), body: t("A manually priced service needs Finance sign-off before release. Assign who should approve it.", "خدمة مسعّرة يدويًا تحتاج إلى اعتماد المالية قبل الإصدار. عيّن من يعتمدها.") };
    case "WAIT_INTERNAL_APPROVAL": return { title: t("Waiting for internal sign-off", "بانتظار الاعتماد الداخلي"), body: t("The assigned team completes their part; release unlocks once every requirement is met.", "يستكمل الفريق المعيّن دوره، ويُتاح الإصدار بعد استيفاء كل المتطلبات.") };
    case "RECORD_CLINICAL_DECISION": return { title: t("Record your clinical decision", "سجّل قرارك السريري"), body: t("Review the intake summary and documents, then record your recommendation.", "راجع ملخص الاستقبال والمستندات ثم سجّل التوصية.") };
    case "UPDATE_TRAVEL_PLAN": return { title: t("Arrange travel and arrival", "رتّب السفر والوصول"), body: t("Keep the travel plan current; confirm it once every requirement is met.", "حدّث خطة السفر وأكّدها عند استيفاء المتطلبات.") };
    case "APPROVE_COMMERCIAL_TERMS": return { title: t("Approve the commercial terms", "اعتمد الشروط المالية"), body: t("Review the manually priced services before the proposal can be released.", "راجع الخدمات المسعّرة يدويًا قبل إصدار العرض.") };
    default: return { title: t("Nothing needs you right now", "لا يوجد إجراء مطلوب الآن"), body: t("The next step appears here as soon as it is due.", "ستظهر الخطوة التالية هنا فور توفرها.") };
  }
}

function readinessWait(code: string | null | undefined, ar: boolean): { title: string; body: string } {
  const t = (en: string, arabic: string) => (ar ? arabic : en);
  switch (code) {
    case "CONTACT_NOT_VERIFIED": return { title: t("Waiting for contact verification", "بانتظار تأكيد وسيلة التواصل"), body: t("The patient verifies their contact channel through the secure link. The coordination deposit is arranged once that is done.", "يؤكد المريض وسيلة تواصله عبر الرابط الآمن، ثم تُرتَّب وديعة التنسيق.") };
    case "CONSENTS_INCOMPLETE": return { title: t("Waiting for the patient's consents", "بانتظار موافقات المريض"), body: t("Required consents are captured through the secure profile link.", "تُسجَّل الموافقات المطلوبة عبر رابط الملف الآمن.") };
    case "ONBOARDING_INCOMPLETE": return { title: t("Waiting for the patient to submit onboarding", "بانتظار إرسال المريض بيانات التسجيل"), body: t("The patient reviews and submits their onboarding through the secure link.", "يراجع المريض بيانات التسجيل ويرسلها عبر الرابط الآمن.") };
    case "REPRESENTATIVE_AUTH_MISSING": return { title: t("Waiting for representative authorization", "بانتظار تفويض الممثّل"), body: t("A valid representative authorization is required before coordination continues.", "يلزم تفويض ممثّل ساري قبل متابعة التنسيق.") };
    default: return { title: t("Waiting for the patient to activate their profile", "بانتظار تفعيل المريض لملفه"), body: t("The secure profile link was sent to the patient. The coordination deposit is arranged once the profile is active.", "أُرسل رابط الملف الآمن إلى المريض، وتُرتَّب وديعة التنسيق بعد تفعيل الملف.") };
  }
}
