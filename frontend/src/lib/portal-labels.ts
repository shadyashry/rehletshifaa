import type { Dictionary } from "@/lib/dictionary";
import { intlLocale, type Locale } from "@/lib/i18n";

/** Staff work copy (`messages/*.json` → `portalWork`) plus the care-area titles for this locale, keyed by slug. */
/** `guardianConsent`: P1-13, the GUARDIAN_AUTHORIZATION wording (`guardianConsent.text`, one key per locale; placeholder pending counsel). */
export type WorkCopy = Dictionary["portalWork"] & { careAreas: Record<string, string>; guardianConsent: string };
type PluralForms = Partial<Record<Intl.LDMLPluralRule, string>> & { other: string };

export const fillTemplate = (template: string, values: Record<string, string | number>) =>
  template.replace(/\{(\w+)\}/g, (_, key: string) => String(values[key] ?? ""));

/** P1-7: an erased person's profile keeps the literal name "Erased" (backend `PatientProfile.ERASED_NAME`); staff screens word it in their language. */
export const ERASED_NAME = "Erased";
export const patientNameLabel = (name: string | null | undefined, work: { retention: { erasedPerson: string } }) =>
  name?.trim() === ERASED_NAME ? work.retention.erasedPerson : name;

/** A counted phrase in the locale's own plural category (Arabic has six); the number is formatted with Intl. */
/** A work item's wording from the backend: a message code plus parameters (names, the patient's own words). */
export type WorkItemCopy = { code: string; params?: Record<string, string> | null };
/** `extras`: a sentence per optional parameter, added only when that parameter is present. */
type WordedEntry = { title: string; context?: string; extras?: Record<string, string> };

/**
 * A work item's title and context in this locale, or null when the code is unknown here — the caller then shows the
 * backend's English. Parameters are bidi-isolated so a Latin name or a quoted comment keeps its order on an Arabic page;
 * a missing name reads as the message's neutral default ("The Consultant").
 */
export function workCopyText(copy: WorkItemCopy | null | undefined, messages: WorkCopy["workCopy"]): { title: string; context: string | null } | null {
  if (!copy) return null;
  const items: Record<string, WordedEntry> = messages.items;
  const entry = Object.hasOwn(items, copy.code) ? items[copy.code] : undefined;
  if (!entry) return null;
  const params = copy.params ?? {};
  const values: Record<string, string> = { ...messages.fallback };
  for (const [key, value] of Object.entries(params)) if (key !== "said" && value) values[key] = `\u2068${value}\u2069`;
  const said = params.said ? fillTemplate(messages.said, { text: `\u2068${params.said}\u2069` }) : null;
  const extras = Object.entries(entry.extras ?? {}).filter(([key]) => params[key]).map(([, template]) => fillTemplate(template, values));
  const context = [entry.context ? fillTemplate(entry.context, values) : null, ...extras, said].filter(Boolean).join(" ");
  return { title: fillTemplate(entry.title, values), context: context || null };
}

/**
 * A My work item in this locale: from its wording code when the copy knows it; otherwise the backend's English, titled by
 * its work type in Arabic (or, for a type named after a step, the step's own title: UX 5-3). Shared by My work and the case
 * cover's "Also open on this case".
 */
export function workItemText(item: { copy?: WorkItemCopy | null; type: string; title: string; context: string | null },
                             locale: Locale, work: Pick<WorkCopy, "workCopy" | "workTitles" | "currentAction">) {
  const known = workCopyText(item.copy, work.workCopy);
  if (known) return known;
  const titles: Record<string, string> = work.workTitles;
  // Only a step's own title: never a state that describes waiting or nothing to do.
  const steps: Record<string, { title: string }> = work.currentAction.states;
  const step = Object.hasOwn(steps, item.type) && !/^(WAIT_|VIEW_ONLY|default$)/.test(item.type) ? steps[item.type].title : undefined;
  const localized = Object.hasOwn(titles, item.type) ? titles[item.type] : step;
  return { title: (locale === "ar" ? localized : undefined) ?? (item.title || localized || ""), context: item.context };
}

/**
 * Why the case waits, in this locale: a fixed reason, the title of the work item the team owes (`WORK:<code>`), or a
 * patient step named by its blocker (`PATIENT_STEP:<code>`, labelled from the case's own blockers). Unknown codes and
 * reasons without a code keep the backend's English.
 */
export function waitingReasonText(actions: { waitingReason?: string | null; waitingReasonCode?: string | null; blockers?: { code: string; labelEn: string; labelAr: string }[] },
                                  work: Pick<WorkCopy, "waitingReason" | "workCopy">, locale: Locale): string | null {
  const code = actions.waitingReasonCode;
  if (code) {
    const reasons: Record<string, string> = work.waitingReason.reasons;
    if (Object.hasOwn(reasons, code)) return reasons[code];
    if (code.startsWith("WORK:")) { const known = workCopyText({ code: code.slice(5) }, work.workCopy); if (known) return known.title; }
    if (code.startsWith("PATIENT_STEP:")) {
      const step = actions.blockers?.find(b => b.code === code.slice(13));
      if (step) return fillTemplate(work.waitingReason.patientStep, { step: locale === "ar" ? step.labelAr : step.labelEn.toLocaleLowerCase("en") });
    }
  }
  return actions.waitingReason ?? null;
}

export function plural(locale: Locale, count: number, forms: PluralForms) {
  const category = new Intl.PluralRules(intlLocale(locale)).select(count);
  return fillTemplate(forms[category] ?? forms.other, { count: new Intl.NumberFormat(intlLocale(locale)).format(count) });
}

/** The viewer's resolved current action, when the page has one: who owes the move follows from it (QA #13, W-5). */
export type ActionHint = { code: string; kind: string };
/** Kinds where the viewer themselves must act now. */
const ACTING = new Set(["FOCUS", "COMPLETE", "CLAIM", "ACCEPT"]);
/** Waiting actions that say on whom the case waits, more precisely than the stored responsibility. */
const WAITS_ON: Record<string, string> = {
  WAIT_INTERNAL_APPROVAL: "INTERNAL_APPROVAL", WAIT_OPERATIONS: "OPERATIONS", WAIT_CONSULTANT: "CONSULTANT", WAIT_PAYMENT: "PAYMENT",
  WAIT_PATIENT_DECISION: "PATIENT", WAIT_PATIENT_INFORMATION: "PATIENT", WAIT_PATIENT_READINESS: "PATIENT",
};
const NOT_VALUES = ["label", "you", "other", "CARE_TEAM"];

/**
 * Who owes the next move, from the viewer's side and never as the raw value. With the viewer's current action it is the
 * action that answers: "you" when they must act, otherwise whom their wait is on (internal sign-off, Operations, …), and
 * never "you" while they wait. Without one, "you" only when it is really this person: the assigned Consultant, the patient
 * themselves, the coordinator who owns the case, or whoever holds the work item ({@code holdsWork}). Our own team reads
 * "the care team" to a Consultant (QA #11). An unknown value reads "another party".
 */
export function waitingLabel(value: string, copy: WorkCopy["waiting"],
                             viewer: { role?: string; ownsCase?: boolean; holdsWork?: boolean; action?: ActionHint | null } = {}) {
  const action = viewer.action;
  if (action && ACTING.has(action.kind)) return copy.you;
  const key = (action && WAITS_ON[action.code]) || value;
  const mine = !action && ((value === "CONSULTANT" && viewer.role === "doctor") || (value === "PATIENT" && viewer.role === "patient")
    || (value === "STAFF" && ((viewer.role === "coordinator" && !!viewer.ownsCase) || !!viewer.holdsWork)));
  if (mine) return copy.you;
  if (key === "STAFF" && viewer.role === "doctor") return copy.CARE_TEAM;
  const known = copy as Record<string, string>;
  return Object.hasOwn(known, key) && !NOT_VALUES.includes(key) ? known[key] : copy.other;
}

/** Where an arrow, Home or End key moves focus in a tablist, following the reading direction; -1 when it does not. */
export function tabKeyTarget(key: string, index: number, length: number, rtl: boolean) {
  const forward = rtl ? "ArrowLeft" : "ArrowRight", backward = rtl ? "ArrowRight" : "ArrowLeft";
  if (key === forward) return (index + 1) % length;
  if (key === backward) return (index - 1 + length) % length;
  if (key === "Home") return 0;
  if (key === "End") return length - 1;
  return -1;
}

/** Priority in words; an unknown value says so instead of pretending to be "Normal". */
export function priorityLabel(value: string, copy: WorkCopy["priority"]) {
  const known = copy as Record<string, string>;
  return Object.hasOwn(known, value) && value !== "other" ? known[value] : copy.other;
}

/** A care-area slug as its title in this locale; an unknown slug is humanised, never shown raw. */
export function careAreaLabel(slug: string, careAreas: Record<string, string>) {
  return careAreas[slug] ?? slug.replace(/-/g, " ").replace(/^\p{L}/u, (letter) => letter.toLocaleUpperCase());
}

/**
 * The coordinator as this viewer should read it: "You" on your own case, the name when known, a clear fallback when
 * the case has an owner whose name is missing, and "Unassigned" only when nobody owns it.
 */
export function coordinatorLabel(item: { coordinatorSubject?: string | null; coordinatorName?: string | null }, viewerSubject: string | undefined, copy: WorkCopy["queue"]) {
  if (item.coordinatorSubject && viewerSubject && item.coordinatorSubject === viewerSubject) return copy.ownerYou;
  if (item.coordinatorName) return item.coordinatorName;
  return item.coordinatorSubject ? copy.ownerUnnamed : copy.unassigned;
}
