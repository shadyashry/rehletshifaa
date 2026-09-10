"use client";

import { useState } from "react";
import { Check, CircleAlert, Clock3, FileText, Plane, Stethoscope, UserRound } from "lucide-react";

import type { Locale } from "@/lib/i18n";

type CaseSummary = {
  id: string; caseNumber: string; status: string; careCategory?: string; patientName?: string;
  coordinatorName?: string | null; doctorName?: string | null; waitingOn?: string | null;
  updatedAt: string; travelPackageRequested?: boolean;
};
type PatientTask = { id: string; title: string; status: string; dueAt?: string | null; overdue?: boolean };
type CaseDocument = { documentId: string; fileName: string; status: string; sizeBytes: number; createdAt: string };
type TimelineEvent = { status: string; occurredAt: string };

/**
 * The patient's view of their own case: where it is, who has it, whether they need to do anything, and
 * what happens next — in their language, never in workflow vocabulary. Deliberately separate from the
 * staff workspace, because a patient needs reassurance and orientation, not an operational console.
 */
export function PatientCaseView({ locale, caseSummary, tasks, documents, timeline, hasProposal, children }: {
  locale: Locale; caseSummary: CaseSummary; tasks: PatientTask[]; documents: CaseDocument[];
  timeline: TimelineEvent[]; hasProposal: boolean; children?: React.ReactNode;
}) {
  const ar = locale === "ar";
  const c = caseSummary;
  const t = ar
    ? { caseLabel: "الحالة", careArea: "مجال الرعاية", coordinator: "منسق حالتك", consultant: "الاستشاري",
        updated: "آخر تحديث", stage: "المرحلة الحالية", journey: "مسار حالتك", now: "ما يحدث الآن",
        next: "الخطوة التالية", actionNeeded: "مطلوب منك إجراء", noAction: "لا يلزم منك أي إجراء الآن.",
        tabs: { overview: "نظرة عامة", documents: "المستندات", updates: "التحديثات", plan: "خطة الرعاية" },
        docs: "المستندات التي شاركتها", noDocs: "لم تشارك أي مستندات بعد.",
        travel: "تفضيل دعم السفر", travelYes: "مطلوب", travelNo: "لم يُطلب بعد",
        travelHint: "يُرتَّب دعم السفر بعد الاتفاق على الخطة الطبية.",
        updatesTitle: "ما حدث حتى الآن", assigned: "لم يُسند بعد", due: "الاستحقاق", overdue: "متأخر" }
    : { caseLabel: "Case", careArea: "Care area", coordinator: "Your coordinator", consultant: "Consultant",
        updated: "Last update", stage: "Current stage", journey: "Your case", now: "What happens now",
        next: "Next", actionNeeded: "Something is needed from you", noAction: "No action is required from you right now.",
        tabs: { overview: "Overview", documents: "Documents", updates: "Updates", plan: "Care plan" },
        docs: "Documents you shared", noDocs: "You have not shared any documents yet.",
        travel: "Travel support preference", travelYes: "Requested", travelNo: "Not selected yet",
        travelHint: "Travel support is arranged after the medical plan is agreed.",
        updatesTitle: "What has happened so far", assigned: "Not assigned yet", due: "Due", overdue: "Overdue" };

  const openTask = tasks.find(task => ["OPEN", "IN_PROGRESS"].includes(task.status));
  const step = currentStep(c.status, !!openTask, hasProposal, ar);
  const phaseNow = phaseIndex(c.status);
  const [tab, setTab] = useState<"overview" | "documents" | "updates" | "plan">("overview");
  const tabs = [
    { id: "overview" as const, label: t.tabs.overview },
    { id: "documents" as const, label: t.tabs.documents, count: documents.length },
    { id: "updates" as const, label: t.tabs.updates },
    ...(hasProposal ? [{ id: "plan" as const, label: t.tabs.plan, count: 0 }] : []),
  ];

  return (
    <div>
      {/* Case summary: identity and the people responsible, above everything else. */}
      <header className="card p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[0.78rem] font-bold text-brand-700" dir="ltr">{t.caseLabel} {c.caseNumber}</p>
            <h2 id="case-heading" tabIndex={-1} className="mt-0.5 text-[1.3rem] font-bold leading-7 text-brand-900 outline-none">
              {step.stage}
            </h2>
            <dl className="mt-3 grid gap-x-6 gap-y-2 text-[0.85rem] sm:grid-cols-2 lg:grid-cols-4">
              {c.careCategory && <Fact label={t.careArea} value={prettyArea(c.careCategory, locale)}/>}
              <Fact label={t.coordinator} value={c.coordinatorName ?? t.assigned} Icon={UserRound}/>
              {c.doctorName && <Fact label={t.consultant} value={c.doctorName} Icon={Stethoscope}/>}
              <Fact label={t.updated} value={new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(new Date(c.updatedAt))} Icon={Clock3}/>
            </dl>
          </div>
          {openTask && (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-[0.75rem] font-bold text-amber-900">
              <CircleAlert size={14} aria-hidden/>{t.actionNeeded}
            </span>
          )}
        </div>
      </header>

      {/* What happens now: the single most important thing on this page. */}
      <section aria-labelledby="patient-current-step" className="mt-4 rounded-xl border border-brand-200 bg-brand-50 p-4 sm:p-5">
        <p className="text-[0.7rem] font-bold uppercase tracking-[0.1em] text-brand-700">{t.now}</p>
        <h3 id="patient-current-step" className="mt-1 text-[1.05rem] font-bold leading-6 text-brand-900">{step.title}</h3>
        <p className="mt-1.5 max-w-2xl text-[0.9rem] leading-6 text-ink-700">{step.body}</p>
        {!openTask && <p className="mt-2 text-[0.88rem] font-semibold text-brand-800">{t.noAction}</p>}
        {step.next && (
          <p className="mt-3 border-t border-brand-200 pt-3 text-[0.85rem] leading-6 text-ink-600">
            <span className="font-bold text-ink-800">{t.next}:</span> {step.next}
          </p>
        )}
        {openTask && (
          <div className="mt-3 rounded-lg border border-amber-200 bg-white p-3">
            <p className="font-semibold text-ink-900">{openTask.title}</p>
            {openTask.dueAt && (
              <p className={`mt-1 text-[0.82rem] ${openTask.overdue ? "font-semibold text-alert-700" : "text-ink-500"}`}>
                {openTask.overdue ? t.overdue : t.due}: {new Date(openTask.dueAt).toLocaleDateString(locale, { day: "numeric", month: "short" })}
              </p>
            )}
          </div>
        )}
      </section>

      <JourneyTracker locale={locale} current={phaseNow} waitingOnPatient={!!openTask} label={t.journey}/>

      <div className="mt-6">
        <div role="tablist" aria-label={t.journey} className="flex flex-wrap gap-1 border-b border-line-strong">
          {tabs.map((item, index) => (
            <button key={item.id} type="button" role="tab" id={`patient-tab-${item.id}`} aria-controls="patient-tab-panel"
                    aria-selected={tab === item.id} tabIndex={tab === item.id ? 0 : -1}
                    className={`-mb-px border-b-2 px-3.5 py-2 text-[0.88rem] font-bold transition ${
                      tab === item.id ? "border-brand-600 text-brand-800" : "border-transparent text-ink-500 hover:text-ink-800"}`}
                    onKeyDown={event => {
                      const step = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
                      if (!step) return;
                      event.preventDefault();
                      const next = tabs[(index + step + tabs.length) % tabs.length];
                      setTab(next.id);
                      requestAnimationFrame(() => document.getElementById(`patient-tab-${next.id}`)?.focus());
                    }}
                    onClick={() => setTab(item.id)}>
              {item.label}
              {"count" in item && item.count ? <span className="ms-1.5 text-[0.75rem] font-semibold text-ink-400">{item.count}</span> : null}
            </button>
          ))}
        </div>

        <div id="patient-tab-panel" role="tabpanel" aria-labelledby={`patient-tab-${tab}`} tabIndex={0} className="mt-4 space-y-4">
          {tab === "overview" && <>
            {children}
            <TravelPreference locale={locale} requested={!!c.travelPackageRequested} labels={t}/>
          </>}

          {tab === "documents" && (
            <section className="card p-4">
              <h3 className="text-[0.7rem] font-bold uppercase tracking-[0.1em] text-ink-500">{t.docs}</h3>
              {documents.length === 0
                ? <p className="mt-2 text-[0.9rem] text-ink-500">{t.noDocs}</p>
                : <ul className="mt-2">
                    {documents.map(doc => (
                      <li key={doc.documentId} className="flex items-center gap-3 border-b border-line py-2.5 last:border-0">
                        <FileText size={16} aria-hidden className="flex-none text-brand-600"/>
                        <span className="min-w-0 flex-1 truncate font-semibold text-ink-800">{doc.fileName}</span>
                        <span className="text-[0.78rem] text-ink-500">
                          {new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(new Date(doc.createdAt))}
                        </span>
                      </li>
                    ))}
                  </ul>}
            </section>
          )}

          {tab === "updates" && (
            <section className="card p-4">
              <h3 className="text-[0.7rem] font-bold uppercase tracking-[0.1em] text-ink-500">{t.updatesTitle}</h3>
              <ol className="relative mt-3 space-y-3.5 border-s border-line ps-4">
                {[...timeline].reverse().map(event => (
                  <li key={`${event.status}-${event.occurredAt}`} className="relative">
                    <span aria-hidden className="absolute -start-[1.32rem] top-1.5 h-2.5 w-2.5 rounded-full bg-brand-200"/>
                    <p className="text-[0.9rem] font-semibold leading-5 text-ink-800">{patientStageLabel(event.status, locale)}</p>
                    <p className="mt-0.5 text-[0.78rem] text-ink-500">
                      {new Date(event.occurredAt).toLocaleString(locale, { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}
                    </p>
                  </li>
                ))}
              </ol>
            </section>
          )}

          {tab === "plan" && children}
        </div>
      </div>
    </div>
  );
}

function Fact({ label, value, Icon }: { label: string; value: string; Icon?: typeof UserRound }) {
  return (
    <div className="min-w-0">
      <dt className="text-[0.7rem] font-bold uppercase tracking-[0.08em] text-ink-500">{label}</dt>
      <dd className="mt-0.5 flex items-center gap-1.5 truncate font-semibold text-ink-800">
        {Icon && <Icon size={14} aria-hidden className="flex-none text-ink-400"/>}{value}
      </dd>
    </div>
  );
}

/** Travel support is a preference, not a step: calm, read-only, and clearly secondary to the care. */
function TravelPreference({ locale, requested, labels }: {
  locale: Locale; requested: boolean; labels: { travel: string; travelYes: string; travelNo: string; travelHint: string };
}) {
  return (
    <section className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-line bg-mist p-4">
      <Plane size={17} aria-hidden className="flex-none text-brand-600"/>
      <div className="min-w-0 flex-1">
        <p className="text-[0.7rem] font-bold uppercase tracking-[0.08em] text-ink-500">{labels.travel}</p>
        <p className="mt-0.5 font-semibold text-ink-800">{requested ? labels.travelYes : labels.travelNo}</p>
      </div>
      <p className="basis-full text-[0.82rem] leading-6 text-ink-500 sm:basis-auto sm:text-end" lang={locale}>{labels.travelHint}</p>
    </section>
  );
}

/** Major phases only — horizontal on desktop, a compact vertical list on small screens. */
function JourneyTracker({ locale, current, waitingOnPatient, label }: {
  locale: Locale; current: number; waitingOnPatient: boolean; label: string;
}) {
  const ar = locale === "ar";
  return (
    <section aria-label={label} className="mt-5 card p-4 sm:p-5">
      <ol className="flex flex-col gap-2.5 sm:flex-row sm:items-start sm:gap-0">
        {PHASES.map((phase, index) => {
          const done = index < current, now = index === current;
          const tone = done ? "text-ink-600" : now ? (waitingOnPatient ? "text-amber-900" : "text-brand-900") : "text-ink-400";
          return (
            <li key={phase.key} className="flex items-start gap-2.5 sm:flex-1 sm:flex-col sm:items-center sm:gap-2 sm:text-center">
              <span aria-hidden className="relative flex h-5 w-5 flex-none items-center justify-center sm:w-full">
                <span className="hidden sm:block absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-line first:hidden"/>
                <span className={`relative z-10 grid h-5 w-5 place-items-center rounded-full ${
                  done ? "bg-brand-100 text-brand-700" : now ? (waitingOnPatient ? "bg-amber-500 text-white" : "bg-brand-600 text-white") : "border border-line-strong bg-white"}`}>
                  {done ? <Check size={11} strokeWidth={3}/> : now ? <span className="h-1.5 w-1.5 rounded-full bg-white"/> : null}
                </span>
              </span>
              <span className={`text-[0.8rem] leading-5 ${now ? "font-bold" : "font-medium"} ${tone}`}>
                {ar ? phase.ar : phase.en}
              </span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

/** Patient-facing phases. Internal workflow states are mapped into these and never shown directly. */
const PHASES = [
  { key: "received", en: "Case received", ar: "استلمنا حالتك", statuses: ["DRAFT", "RECEIVED"] },
  { key: "coordinator", en: "Coordinator review", ar: "مراجعة المنسق", statuses: ["INTAKE_REVIEW", "INFORMATION_REQUIRED", "READY_FOR_CONSULTANT"] },
  { key: "consultant", en: "Consultant review", ar: "مراجعة الاستشاري", statuses: ["CONSULTANT_ASSIGNMENT_PENDING", "CONSULTANT_REVIEW", "CLINICAL_RECOMMENDATION_READY", "CLINICALLY_NOT_SUITABLE"] },
  { key: "proposal", en: "Your proposal", ar: "عرضك", statuses: ["PROPOSAL_PREPARATION", "PROPOSAL_INTERNAL_APPROVAL", "REVISION_REQUESTED", "PATIENT_DECISION", "DECLINED", "EXPIRED"] },
  { key: "deposit", en: "Deposit", ar: "الوديعة", statuses: ["ACCEPTED"] },
  { key: "treatment", en: "Treatment", ar: "العلاج", statuses: ["TRAVEL_COORDINATION", "ARRIVAL_CONFIRMED", "TREATMENT_IN_PROGRESS"] },
  { key: "followup", en: "Follow-up", ar: "المتابعة", statuses: ["DISCHARGED", "FOLLOW_UP", "CLOSED", "CANCELLED"] },
];

export function phaseIndex(status: string) {
  const found = PHASES.findIndex(phase => phase.statuses.includes(status));
  return found < 0 ? 0 : found;
}

export function patientStageLabel(status: string, locale: Locale) {
  const phase = PHASES[phaseIndex(status)];
  return locale === "ar" ? phase.ar : phase.en;
}

/**
 * What is happening, whether the patient must act, and what comes next — one honest paragraph per state.
 * An open request for the patient always wins, because that is the only time they need to do something.
 */
function currentStep(status: string, actionRequired: boolean, hasProposal: boolean, ar: boolean) {
  const stage = ar ? PHASES[phaseIndex(status)].ar : PHASES[phaseIndex(status)].en;
  if (actionRequired) return {
    stage,
    title: ar ? "نحتاج منك معلومة" : "We need something from you",
    body: ar ? "طلب منسقك معلومة أو مستندًا لمتابعة حالتك. التفاصيل أدناه." : "Your coordinator has asked for information or a document so your case can continue. The details are below.",
    next: ar ? "بعد إرسالها، يراجعها منسقك ويكمل الخطوة التالية." : "Once you send it, your coordinator reviews it and continues.",
  };
  const map: Record<string, { title: [string, string]; body: [string, string]; next?: [string, string] }> = {
    RECEIVED: {
      title: ["We have your case", "استلمنا حالتك"],
      body: ["Your case has been received and is waiting for a coordinator to look at it.", "تم استلام حالتك وهي بانتظار مراجعة أحد المنسقين."],
      next: ["A coordinator will check what you sent and tell you if anything is missing.", "سيتحقق المنسق مما أرسلته ويخبرك إن كان ينقص شيء."],
    },
    INTAKE_REVIEW: {
      title: ["Your coordinator is reviewing your case", "منسقك يراجع حالتك"],
      body: ["Your coordinator is going through what you sent and preparing it for a Consultant.", "يطّلع منسقك على ما أرسلته ويجهّزه لعرضه على استشاري."],
      next: ["Your case will be sent to a Consultant in the right specialty.", "ستُرسل حالتك إلى استشاري في التخصص المناسب."],
    },
    READY_FOR_CONSULTANT: {
      title: ["Your case is ready for a Consultant", "حالتك جاهزة للاستشاري"],
      body: ["Your coordinator has prepared your case and is assigning the right Consultant.", "جهّز منسقك حالتك ويجري إسنادها إلى الاستشاري المناسب."],
      next: ["A Consultant will review your case and record a recommendation.", "سيراجع الاستشاري حالتك ويسجّل توصيته."],
    },
    CONSULTANT_ASSIGNMENT_PENDING: {
      title: ["A Consultant has been asked to review your case", "طُلب من استشاري مراجعة حالتك"],
      body: ["We have sent your case to a Consultant in the relevant specialty.", "أرسلنا حالتك إلى استشاري في التخصص المناسب."],
      next: ["You will hear from us once the Consultant has reviewed it.", "سنوافيك فور انتهاء الاستشاري من المراجعة."],
    },
    CONSULTANT_REVIEW: {
      title: ["Your Consultant is reviewing your case", "الاستشاري يراجع حالتك"],
      body: ["A Consultant is going through your reports and history now.", "يطّلع الاستشاري الآن على تقاريرك وتاريخك الطبي."],
      next: ["You will receive a recommendation and an initial cost estimate.", "ستصلك التوصية مع تقدير أولي للتكلفة."],
    },
    CLINICAL_RECOMMENDATION_READY: {
      title: ["Your recommendation is ready", "توصيتك جاهزة"],
      body: ["The Consultant has finished reviewing your case. Your coordinator is preparing what we send you.", "أنهى الاستشاري مراجعة حالتك، ويجهّز منسقك ما سنرسله إليك."],
      next: ["You will receive the recommendation, the estimated cost and the practical steps.", "ستصلك التوصية والتكلفة التقديرية والخطوات العملية."],
    },
    PROPOSAL_PREPARATION: {
      title: ["We are preparing your proposal", "نجهّز عرضك"],
      body: ["Your coordinator is putting together the treatment plan and its estimated cost.", "يجمع منسقك خطة العلاج وتكلفتها التقديرية."],
      next: ["You will receive the proposal to review in your own time.", "ستصلك خطة العلاج لتراجعها في وقتك."],
    },
    PATIENT_DECISION: {
      title: ["Your proposal is ready to review", "عرضك جاهز للمراجعة"],
      body: ["Take the time you need. Nothing happens until you decide.", "خذ وقتك. لن يحدث شيء قبل أن تقرر."],
      next: ["If you accept, we start arranging your care.", "إذا وافقت، نبدأ ترتيب رعايتك."],
    },
    ACCEPTED: {
      title: ["We are waiting for the coordination deposit", "بانتظار وديعة التنسيق"],
      body: ["Your coordinator will share the payment details and confirm it once received.", "سيشارك منسقك تفاصيل الدفع ويؤكد الاستلام."],
      next: ["Once confirmed, your coordinator starts arranging your treatment.", "بعد التأكيد، يبدأ منسقك ترتيب علاجك."],
    },
    TRAVEL_COORDINATION: {
      title: ["We are arranging your treatment", "نرتّب علاجك"],
      body: ["Your coordinator is organising your appointments and, if you asked for it, the practical side of your trip.", "ينظّم منسقك مواعيدك، وإن طلبت ذلك، الجوانب العملية لرحلتك."],
      next: ["You will receive your dates and arrival details.", "ستصلك المواعيد وتفاصيل الوصول."],
    },
    ARRIVAL_CONFIRMED: {
      title: ["Your arrival is confirmed", "تم تأكيد وصولك"],
      body: ["Everything is set for your arrival.", "كل شيء جاهز لوصولك."],
      next: ["Your treatment begins as planned.", "يبدأ علاجك حسب الخطة."],
    },
    TREATMENT_IN_PROGRESS: {
      title: ["Your treatment is under way", "علاجك جارٍ"],
      body: ["Your care team is with you throughout your treatment.", "فريق الرعاية معك طوال فترة العلاج."],
      next: ["After discharge we stay in contact for follow-up.", "بعد الخروج نبقى على تواصل للمتابعة."],
    },
    DISCHARGED: {
      title: ["You have been discharged", "تم خروجك"],
      body: ["Your treatment is complete and your follow-up plan is in place.", "اكتمل علاجك وخطة المتابعة جاهزة."],
      next: ["Your coordinator will check in with you.", "سيتواصل معك منسقك للاطمئنان."],
    },
    FOLLOW_UP: {
      title: ["You are in follow-up", "أنت في مرحلة المتابعة"],
      body: ["We stay in contact while you recover.", "نبقى على تواصل معك أثناء تعافيك."],
    },
    INFORMATION_REQUIRED: {
      title: ["We need something from you", "نحتاج منك معلومة"],
      body: ["Your coordinator has asked for more information to continue.", "طلب منسقك معلومات إضافية لمتابعة حالتك."],
      next: ["Once we have it, your case continues.", "فور استلامها تستكمل حالتك."],
    },
    CLINICALLY_NOT_SUITABLE: {
      title: ["This case is not clinically suitable for treatment with us", "هذه الحالة غير مناسبة سريريًا للعلاج لدينا"],
      body: ["The Consultant reviewed your case and advised against treatment here. Your coordinator can explain what this means.", "راجع الاستشاري حالتك ولم ينصح بالعلاج لدينا. يمكن لمنسقك أن يشرح لك ما يعنيه ذلك."],
    },
    DECLINED: {
      title: ["You declined the proposal", "لم توافق على العرض"],
      body: ["Your case is closed for now. You can contact your coordinator if you change your mind.", "حالتك مغلقة حاليًا. يمكنك التواصل مع منسقك إن غيّرت رأيك."],
    },
    CLOSED: {
      title: ["This case is closed", "هذه الحالة مغلقة"],
      body: ["If you would like to look at your options again, contact your coordinator.", "إذا رغبت في مراجعة خياراتك مجددًا، تواصل مع منسقك."],
    },
  };
  const entry = map[status];
  if (!entry) return {
    stage,
    title: ar ? "حالتك قيد المتابعة" : "Your case is in progress",
    body: ar ? "فريقك يعمل على الخطوة التالية وسيوافيك بالمستجدات." : "Your team is working on the next step and will keep you updated.",
    next: hasProposal ? (ar ? "راجع خطة العلاج عندما تكون جاهزًا." : "Review your proposal when you are ready.") : undefined,
  };
  const pick = (pair: [string, string]) => ar ? pair[1] : pair[0];
  return { stage, title: pick(entry.title), body: pick(entry.body), next: entry.next ? pick(entry.next) : undefined };
}

function prettyArea(value: string, locale: Locale) {
  const map: Record<string, { en: string; ar: string }> = {
    cardiology: { en: "Cardiology", ar: "أمراض القلب" },
    orthopedics: { en: "Orthopedics", ar: "جراحة العظام" },
    "rheumatology-rehabilitation": { en: "Rehabilitation & rheumatology", ar: "التأهيل والروماتيزم" },
  };
  const entry = map[value];
  return entry ? (locale === "ar" ? entry.ar : entry.en) : value.replaceAll("-", " ");
}
