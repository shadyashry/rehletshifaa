"use client";

import { useEffect, useRef } from "react";
import { Check, X } from "lucide-react";

import type { Locale } from "@/lib/i18n";
import { waitingLabel } from "@/components/portal/MyWork";

export type TimelineEvent = {
  type: string; label: string; occurredAt: string; status: string;
  actorName?: string | null; actorRole?: string | null; note?: string | null;
};

/**
 * Orientation in about a second: where this case sits across the seven phases people actually talk
 * about. Deliberately holds no owner, assignee, next action or history — those live where they belong,
 * so the pulse never competes with the current action or repeats it.
 */
export function JourneyPulse({ locale, stage, waitingOn, viewerRole, onViewJourney }: {
  locale: Locale; stage: string; waitingOn?: string | null; viewerRole?: string; onViewJourney: () => void;
}) {
  const ar = locale === "ar";
  const currentIndex = phaseIndex(stage);
  const blocked = !!waitingOn && ["PATIENT", "HOSPITAL", "EXTERNAL", "PAYMENT"].includes(waitingOn);

  return (
    <section aria-labelledby="journey-pulse-title" className="card p-4">
      <h2 id="journey-pulse-title" className="text-[0.7rem] font-bold uppercase tracking-[0.1em] text-ink-500">
        {ar ? "الرحلة" : "Journey"}
      </h2>

      <ol className="mt-3 space-y-0.5">
        {PHASES.map((phase, index) => {
          const done = index < currentIndex;
          const current = index === currentIndex;
          const tone = done ? "text-ink-600" : current ? (blocked ? "text-amber-900" : "text-brand-900") : "text-ink-400";
          return (
            <li key={phase.key} className="flex items-center gap-2.5">
              <span aria-hidden className="flex h-4 w-4 flex-none items-center justify-center">
                {done
                  ? <span className="grid h-4 w-4 place-items-center rounded-full bg-brand-100 text-brand-700"><Check size={10} strokeWidth={3}/></span>
                  : current
                    ? <span className={`h-3 w-3 rounded-full ring-4 ${blocked ? "bg-amber-500 ring-amber-100" : "bg-brand-600 ring-brand-100"}`}/>
                    : <span className="h-2.5 w-2.5 rounded-full border border-line-strong bg-white"/>}
              </span>
              <span className={`text-[0.82rem] leading-6 ${current ? "font-bold" : "font-medium"} ${tone}`}>
                {ar ? phase.ar : phase.en}
              </span>
            </li>
          );
        })}
      </ol>

      {waitingOn && waitingOn !== "NONE" && (
        <p className={`mt-3 inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[0.72rem] font-bold ${
          blocked ? "border-amber-200 bg-amber-50 text-amber-900" : "border-brand-200 bg-brand-50 text-brand-800"}`}>
          {ar ? "بانتظار" : "Waiting on"}: {waitingLabel(waitingOn, locale, viewerRole)}
        </p>
      )}

      <button type="button" className="mt-3 block w-full rounded-lg border border-line px-3 py-1.5 text-[0.8rem] font-semibold text-brand-800 transition hover:border-brand-300 hover:bg-brand-50"
              onClick={onViewJourney}>
        {ar ? "عرض الرحلة كاملة" : "View full journey"}
      </button>
    </section>
  );
}

/**
 * The detailed history, on demand only: timestamps, who acted and in what role, grouped by the same
 * phases the pulse shows. Modal so it never competes with the page's primary action.
 */
export function FullJourneyDialog({ locale, timeline, caseNumber, onClose }: {
  locale: Locale; timeline: TimelineEvent[]; caseNumber: string; onClose: () => void;
}) {
  const ar = locale === "ar";
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { dialog.current?.showModal(); }, []);
  const groups = groupByPhase(timeline, locale);

  return (
    <dialog ref={dialog} className="account-dialog !w-[min(34rem,calc(100%-2rem))]" aria-labelledby="full-journey-title" onClose={onClose}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 id="full-journey-title" className="title">{ar ? "رحلة الحالة" : "Case journey"}</h2>
          <p className="mt-0.5 text-[0.8rem] font-semibold text-brand-700" dir="ltr">{caseNumber}</p>
        </div>
        <button type="button" className="icon-button" aria-label={ar ? "إغلاق" : "Close"} onClick={() => dialog.current?.close()}><X size={20}/></button>
      </div>

      <div className="mt-5">
        {groups.length === 0 && <p className="text-[0.9rem] text-ink-500">{ar ? "لا يوجد سجل بعد." : "No history yet."}</p>}
        {groups.map(group => (
          <section key={group.key} className="mb-5 last:mb-0">
            <h3 className="text-[0.7rem] font-bold uppercase tracking-[0.1em] text-ink-500">{group.label}</h3>
            <ol className="relative mt-2.5 space-y-3.5 border-s border-line ps-4">
              {group.events.map(event => (
                <li key={`${event.status}-${event.occurredAt}`} className="relative">
                  <span aria-hidden className={`absolute -start-[1.32rem] top-1 grid h-3.5 w-3.5 place-items-center rounded-full ${
                    event.current ? "bg-brand-600 text-white" : "bg-brand-100 text-brand-700"}`}>
                    {event.current ? <span className="h-1.5 w-1.5 rounded-full bg-white"/> : <Check size={9} strokeWidth={3}/>}
                  </span>
                  <p className={`text-[0.9rem] leading-5 ${event.current ? "font-bold text-brand-900" : "font-semibold text-ink-800"}`}>
                    {stageLabel(event.status, locale)}
                  </p>
                  <p className="mt-0.5 text-[0.78rem] leading-5 text-ink-500">
                    {new Date(event.occurredAt).toLocaleString(locale, { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}
                    {event.actorName ? ` · ${event.actorName}` : ""}
                    {event.actorRole && event.actorName && event.actorRole !== "SYSTEM" ? ` · ${roleLabel(event.actorRole, locale)}` : ""}
                  </p>
                  {event.note && <p className="mt-1 text-[0.78rem] leading-5 text-ink-600">{event.note}</p>}
                </li>
              ))}
            </ol>
          </section>
        ))}
      </div>
    </dialog>
  );
}

/** Seven business phases; every technical status maps into one of them. */
const PHASES: { key: string; en: string; ar: string; statuses: string[] }[] = [
  { key: "intake", en: "Intake", ar: "الاستقبال", statuses: ["DRAFT", "RECEIVED", "INTAKE_REVIEW", "INFORMATION_REQUIRED"] },
  { key: "consultant", en: "Consultant", ar: "الاستشاري", statuses: ["READY_FOR_CONSULTANT", "CONSULTANT_ASSIGNMENT_PENDING", "CONSULTANT_REVIEW", "CLINICAL_RECOMMENDATION_READY", "CLINICALLY_NOT_SUITABLE"] },
  { key: "proposal", en: "Proposal", ar: "العرض", statuses: ["PROPOSAL_PREPARATION", "PROPOSAL_INTERNAL_APPROVAL", "REVISION_REQUESTED"] },
  { key: "decision", en: "Patient decision", ar: "قرار المريض", statuses: ["PATIENT_DECISION", "DECLINED", "EXPIRED"] },
  { key: "deposit", en: "Deposit", ar: "الوديعة", statuses: ["ACCEPTED"] },
  { key: "treatment", en: "Treatment", ar: "العلاج", statuses: ["TRAVEL_COORDINATION", "ARRIVAL_CONFIRMED", "TREATMENT_IN_PROGRESS"] },
  { key: "followup", en: "Follow-up", ar: "المتابعة", statuses: ["DISCHARGED", "FOLLOW_UP", "CLOSED", "CANCELLED"] },
];

export function phaseIndex(status: string) {
  const found = PHASES.findIndex(phase => phase.statuses.includes(status));
  return found < 0 ? 0 : found;
}

type PhasedEvent = TimelineEvent & { current: boolean };

function groupByPhase(timeline: TimelineEvent[], locale: Locale) {
  const last = timeline.length - 1;
  const groups = new Map<string, PhasedEvent[]>();
  timeline.forEach((event, index) => {
    const phase = PHASES[phaseIndex(event.status)];
    const list = groups.get(phase.key) ?? [];
    list.push({ ...event, current: index === last });
    groups.set(phase.key, list);
  });
  return PHASES.filter(phase => groups.has(phase.key))
    .map(phase => ({ key: phase.key, label: locale === "ar" ? phase.ar : phase.en, events: groups.get(phase.key)! }));
}

/** Never show a raw enum: every stage and role reads as language a person would use. */
const STAGES: Record<string, { en: string; ar: string }> = {
  DRAFT: { en: "Draft", ar: "مسودة" },
  RECEIVED: { en: "Received", ar: "تم الاستلام" },
  INTAKE_REVIEW: { en: "Intake review", ar: "مراجعة الاستقبال" },
  INFORMATION_REQUIRED: { en: "Waiting for patient information", ar: "بانتظار معلومات المريض" },
  READY_FOR_CONSULTANT: { en: "Ready for consultant", ar: "جاهزة للاستشاري" },
  CONSULTANT_ASSIGNMENT_PENDING: { en: "Assigned to consultant", ar: "تم التعيين للاستشاري" },
  CONSULTANT_REVIEW: { en: "Under consultant review", ar: "قيد مراجعة الاستشاري" },
  CLINICAL_RECOMMENDATION_READY: { en: "Clinical recommendation ready", ar: "التوصية السريرية جاهزة" },
  CLINICALLY_NOT_SUITABLE: { en: "Not clinically suitable", ar: "غير مناسبة سريريًا" },
  PROPOSAL_PREPARATION: { en: "Preparing proposal", ar: "تجهيز العرض" },
  PROPOSAL_INTERNAL_APPROVAL: { en: "Internal approval", ar: "الاعتماد الداخلي" },
  REVISION_REQUESTED: { en: "Revision requested", ar: "طلب تعديل" },
  PATIENT_DECISION: { en: "With the patient", ar: "لدى المريض" },
  ACCEPTED: { en: "Proposal accepted", ar: "تم قبول العرض" },
  DECLINED: { en: "Declined", ar: "مرفوض" },
  EXPIRED: { en: "Expired", ar: "منتهي" },
  TRAVEL_COORDINATION: { en: "Treatment coordination", ar: "تنسيق العلاج" },
  ARRIVAL_CONFIRMED: { en: "Arrival confirmed", ar: "تم تأكيد الوصول" },
  TREATMENT_IN_PROGRESS: { en: "Treatment in progress", ar: "العلاج جارٍ" },
  DISCHARGED: { en: "Discharged", ar: "تم الخروج" },
  FOLLOW_UP: { en: "Follow-up", ar: "المتابعة" },
  CLOSED: { en: "Closed", ar: "مغلقة" },
  CANCELLED: { en: "Cancelled", ar: "ملغاة" },
};

export function stageLabel(value: string, locale: Locale) {
  const entry = STAGES[value];
  return entry ? (locale === "ar" ? entry.ar : entry.en) : value.replaceAll("_", " ").toLowerCase();
}

const ROLES: Record<string, { en: string; ar: string }> = {
  COORDINATOR: { en: "Coordinator", ar: "منسق" },
  COORDINATOR_LEAD: { en: "Coordination lead", ar: "قائد التنسيق" },
  DOCTOR: { en: "Consultant", ar: "استشاري" },
  OPERATIONS: { en: "Operations", ar: "العمليات" },
  FINANCE: { en: "Finance", ar: "المالية" },
  PATIENT: { en: "Patient", ar: "المريض" },
  SYSTEM: { en: "System", ar: "النظام" },
};

export function roleLabel(value: string, locale: Locale) {
  const entry = ROLES[value];
  return entry ? (locale === "ar" ? entry.ar : entry.en) : value.replaceAll("_", " ").toLowerCase();
}
