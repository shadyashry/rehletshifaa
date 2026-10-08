import type { Dictionary } from "@/lib/dictionary";
import { intlLocale, type Locale } from "@/lib/i18n";

/** Staff work copy (`messages/*.json` → `portalWork`) plus the care-area titles for this locale, keyed by slug. */
export type WorkCopy = Dictionary["portalWork"] & { careAreas: Record<string, string> };
type PluralForms = Partial<Record<Intl.LDMLPluralRule, string>> & { other: string };

export const fillTemplate = (template: string, values: Record<string, string | number>) =>
  template.replace(/\{(\w+)\}/g, (_, key: string) => String(values[key] ?? ""));

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

/**
 * Who owes the next move, from the viewer's side and never as the raw value. "You" only when it is really this person:
 * the assigned Consultant, the patient themselves, or the coordinator who owns the case (a coordinator browsing the
 * team queue, or operations and finance, read "our team"). An unknown value reads "another party".
 */
export function waitingLabel(value: string, copy: WorkCopy["waiting"], viewer: { role?: string; ownsCase?: boolean } = {}) {
  const mine = (value === "CONSULTANT" && viewer.role === "doctor") || (value === "PATIENT" && viewer.role === "patient")
    || (value === "STAFF" && viewer.role === "coordinator" && !!viewer.ownsCase);
  if (mine) return copy.you;
  const known = copy as Record<string, string>;
  return Object.hasOwn(known, value) && !["label", "you", "other"].includes(value) ? known[value] : copy.other;
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
