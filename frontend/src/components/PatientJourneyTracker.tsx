"use client";

import { Check } from "lucide-react";

import type { Locale } from "@/lib/i18n";

/**
 * The patient's view of their case journey, shared by the signed-in portal and the secure no-login
 * status link so both tell the same story. Only major phases appear here — internal workflow statuses
 * are mapped to these on the server or in the portal, and never rendered directly.
 */
export const PATIENT_PHASES = [
  { key: "received", en: "Case received", ar: "استلمنا حالتك" },
  { key: "coordinator", en: "Coordinator review", ar: "مراجعة المنسق" },
  { key: "consultant", en: "Consultant review", ar: "مراجعة الاستشاري" },
  { key: "proposal", en: "Your proposal", ar: "عرضك" },
  { key: "deposit", en: "Deposit", ar: "الوديعة" },
  { key: "treatment", en: "Treatment", ar: "العلاج" },
  { key: "followup", en: "Follow-up", ar: "المتابعة" },
] as const;

export type PatientPhase = (typeof PATIENT_PHASES)[number]["key"];

export function phasePosition(phase?: string | null) {
  const index = PATIENT_PHASES.findIndex(entry => entry.key === phase);
  return index < 0 ? 0 : index;
}

export function phaseLabel(phase: string | null | undefined, locale: Locale) {
  const entry = PATIENT_PHASES[phasePosition(phase)];
  return locale === "ar" ? entry.ar : entry.en;
}

export function PatientJourneyTracker({ locale, phase, waitingOnPatient = false, label }: {
  locale: Locale; phase?: string | null; waitingOnPatient?: boolean; label: string;
}) {
  const ar = locale === "ar";
  const current = phasePosition(phase);
  return (
    <section aria-label={label} className="card p-4 sm:p-5">
      <ol className="flex flex-col gap-2.5 sm:flex-row sm:items-start sm:gap-0">
        {PATIENT_PHASES.map((entry, index) => {
          const done = index < current, now = index === current;
          const tone = done ? "text-ink-600" : now ? (waitingOnPatient ? "text-amber-900" : "text-brand-900") : "text-ink-400";
          return (
            <li key={entry.key} className="flex items-start gap-2.5 sm:flex-1 sm:flex-col sm:items-center sm:gap-2 sm:text-center">
              <span aria-hidden className="relative flex h-5 w-5 flex-none items-center justify-center sm:w-full">
                <span className="absolute inset-x-0 top-1/2 hidden h-px -translate-y-1/2 bg-line sm:block"/>
                <span className={`relative z-10 grid h-5 w-5 place-items-center rounded-full ${
                  done ? "bg-brand-100 text-brand-700"
                    : now ? (waitingOnPatient ? "bg-amber-500 text-white" : "bg-brand-600 text-white")
                    : "border border-line-strong bg-white"}`}>
                  {done ? <Check size={11} strokeWidth={3}/> : now ? <span className="h-1.5 w-1.5 rounded-full bg-white"/> : null}
                </span>
              </span>
              <span className={`text-[0.8rem] leading-5 ${now ? "font-bold" : "font-medium"} ${tone}`}>
                {ar ? entry.ar : entry.en}
              </span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

/**
 * What is happening and what comes next, keyed by phase so the secure link can explain the case without
 * ever receiving an internal status. Deliberately says nothing about who is handling it: this page is
 * reached with a one-time code rather than a sign-in.
 */
export function phaseExplanation(phase: string | null | undefined, actionRequired: boolean, locale: Locale) {
  const ar = locale === "ar";
  if (actionRequired) return {
    title: ar ? "نحتاج منك معلومة" : "We need something from you",
    body: ar ? "طلب منسقك ما يلي لمتابعة حالتك." : "Your coordinator has asked for the following so your case can continue.",
    next: ar ? "بعد إرسالها، يراجعها منسقك ويكمل الخطوة التالية." : "Once you send it, your coordinator reviews it and continues.",
  };
  const copy: Record<string, { en: [string, string, string?]; ar: [string, string, string?] }> = {
    received: {
      en: ["We have your case", "Your case has been received and is waiting for a coordinator to look at it.", "A coordinator will check what you sent and tell you if anything is missing."],
      ar: ["استلمنا حالتك", "تم استلام حالتك وهي بانتظار مراجعة أحد المنسقين.", "سيتحقق المنسق مما أرسلته ويخبرك إن كان ينقص شيء."],
    },
    coordinator: {
      en: ["Your coordinator is reviewing your case", "Your coordinator is going through what you sent and preparing it for a Consultant.", "Your case will be sent to a Consultant in the right specialty."],
      ar: ["منسقك يراجع حالتك", "يطّلع منسقك على ما أرسلته ويجهّزه لعرضه على استشاري.", "ستُرسل حالتك إلى استشاري في التخصص المناسب."],
    },
    consultant: {
      en: ["A Consultant is reviewing your case", "A Consultant is going through your reports and history now.", "You will receive a recommendation and an initial cost estimate."],
      ar: ["استشاري يراجع حالتك", "يطّلع الاستشاري الآن على تقاريرك وتاريخك الطبي.", "ستصلك التوصية مع تقدير أولي للتكلفة."],
    },
    proposal: {
      en: ["Your proposal", "Your treatment plan and its estimated cost are being prepared, or are ready for you to review.", "Take the time you need. Nothing happens until you decide."],
      ar: ["عرضك", "يجري تجهيز خطة علاجك وتكلفتها التقديرية، أو أنها جاهزة لمراجعتك.", "خذ وقتك. لن يحدث شيء قبل أن تقرر."],
    },
    deposit: {
      en: ["We are waiting for the coordination deposit", "Your coordinator will share the payment details and confirm it once received.", "Once confirmed, your coordinator starts arranging your treatment."],
      ar: ["بانتظار وديعة التنسيق", "سيشارك منسقك تفاصيل الدفع ويؤكد الاستلام.", "بعد التأكيد، يبدأ منسقك ترتيب علاجك."],
    },
    treatment: {
      en: ["We are arranging your treatment", "Your coordinator is organising your appointments and arrival.", "You will receive your dates and arrival details."],
      ar: ["نرتّب علاجك", "ينظّم منسقك مواعيدك وترتيبات وصولك.", "ستصلك المواعيد وتفاصيل الوصول."],
    },
    followup: {
      en: ["You are in follow-up", "We stay in contact while you recover.", undefined],
      ar: ["أنت في مرحلة المتابعة", "نبقى على تواصل معك أثناء تعافيك.", undefined],
    },
  };
  const entry = copy[phase ?? "received"] ?? copy.received;
  const [title, body, next] = ar ? entry.ar : entry.en;
  return { title, body, next };
}
