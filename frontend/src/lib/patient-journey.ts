import type { Dictionary } from "@/lib/dictionary";

/** The status link's journey words, from messages/{en,ar}.json (`secureLink.journey`), passed by the server page. */
export type JourneyCopy = Dictionary["secureLink"]["journey"];

/**
 * The patient's public journey phases, in order: the secure status link receives one of these from the backend (never
 * an internal status) and draws it with `CaseJourney`; the words are `secureLink.journey.phases`.
 */
export const PATIENT_PHASES = ["received", "coordinator", "consultant", "proposal", "deposit", "treatment", "followup"] as const;

export type PatientPhase = (typeof PATIENT_PHASES)[number];

export function phasePosition(phase?: string | null) {
  const index = PATIENT_PHASES.indexOf(phase as PatientPhase);
  return index < 0 ? 0 : index;
}

/** The phase names in journey order, for `CaseJourney`. */
export function phaseLabels(copy: JourneyCopy): string[] {
  return PATIENT_PHASES.map(key => copy.phases[key]);
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
