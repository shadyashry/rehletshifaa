"use client";

import { Check } from "lucide-react";

import type { Dictionary } from "@/lib/dictionary";

/** The status link's journey words, from messages/{en,ar}.json (`secureLink.journey`), passed by the server page. */
export type JourneyCopy = Dictionary["secureLink"]["journey"];

/**
 * The patient's view of their case journey, shared by the signed-in portal and the secure no-login
 * status link so both tell the same story. Only major phases appear here — internal workflow statuses
 * are mapped to these on the server or in the portal, and never rendered directly.
 */
export const PATIENT_PHASES = [
  { key: "received" }, { key: "coordinator" }, { key: "consultant" }, { key: "proposal" }, { key: "deposit" }, { key: "treatment" }, { key: "followup" },
] as const;

export type PatientPhase = (typeof PATIENT_PHASES)[number]["key"];

export function phasePosition(phase?: string | null) {
  const index = PATIENT_PHASES.findIndex(entry => entry.key === phase);
  return index < 0 ? 0 : index;
}

export function PatientJourneyTracker({ copy, phase, waitingOnPatient = false, label }: {
  copy: JourneyCopy; phase?: string | null; waitingOnPatient?: boolean; label: string;
}) {
  const current = phasePosition(phase);
  return (
    <section aria-label={label} className="card p-4 sm:p-5">
      <ol className="flex flex-col gap-2.5 sm:flex-row sm:items-start sm:gap-0">
        {PATIENT_PHASES.map((entry, index) => {
          const done = index < current, now = index === current;
          const tone = done ? "text-ink-600" : now ? (waitingOnPatient ? "text-status-warning-fg" : "text-brand-900") : "text-ink-400";
          return (
            <li key={entry.key} aria-current={now ? "step" : undefined} className="flex items-start gap-2.5 sm:flex-1 sm:flex-col sm:items-center sm:gap-2 sm:text-center">
              <span aria-hidden className="relative flex h-5 w-5 flex-none items-center justify-center sm:w-full">
                <span className="absolute inset-x-0 top-1/2 hidden h-px -translate-y-1/2 bg-line sm:block"/>
                <span className={`relative z-10 grid h-5 w-5 place-items-center rounded-full ${
                  done ? "bg-brand-100 text-brand-700"
                    : now ? (waitingOnPatient ? "bg-status-warning-fg text-white" : "bg-brand-600 text-white")
                    : "border border-line-strong bg-white"}`}>
                  {done ? <Check size={11} strokeWidth={3}/> : now ? <span className="h-1.5 w-1.5 rounded-full bg-white"/> : null}
                </span>
              </span>
              <span className={`text-[0.8rem] leading-5 ${now ? "font-bold" : "font-medium"} ${tone}`}>
                {copy.phases[entry.key]}
              </span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

/**
 * P1-6 (D-02): what the patient can usefully do while the team has the step, per phase; nothing while they owe the step
 * themselves, or once the journey is in follow-up.
 */
export function phaseMeanwhile(phase: string | null | undefined, actionRequired: boolean, copy: JourneyCopy): string | null {
  if (actionRequired || !phase) return null;
  return (copy.meanwhile as Record<string, string>)[phase] ?? null;
}

/**
 * What is happening and what comes next, keyed by phase so the secure link can explain the case without
 * ever receiving an internal status. Deliberately says nothing about who is handling it: this page is
 * reached with a one-time code rather than a sign-in.
 */
export function phaseExplanation(phase: string | null | undefined, actionRequired: boolean, copy: JourneyCopy): { title: string; body: string; next?: string } {
  if (actionRequired) return copy.needed;
  const explain = copy.explain as Record<string, { title: string; body: string; next?: string }>;
  return explain[phase ?? "received"] ?? explain.received;
}
