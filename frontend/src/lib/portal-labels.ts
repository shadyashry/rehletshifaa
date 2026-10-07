import type { Dictionary } from "@/lib/dictionary";
import type { Locale } from "@/lib/i18n";

/** Staff work copy (`messages/*.json` → `portalWork`) plus the care-area titles for this locale, keyed by slug. */
export type WorkCopy = Dictionary["portalWork"] & { careAreas: Record<string, string> };
type PluralForms = Partial<Record<Intl.LDMLPluralRule, string>> & { other: string };

export const fillTemplate = (template: string, values: Record<string, string | number>) =>
  template.replace(/\{(\w+)\}/g, (_, key: string) => String(values[key] ?? ""));

/** A counted phrase in the locale's own plural category (Arabic has six); the number is formatted with Intl. */
export function plural(locale: Locale, count: number, forms: PluralForms) {
  const category = new Intl.PluralRules(locale).select(count);
  return fillTemplate(forms[category] ?? forms.other, { count: new Intl.NumberFormat(locale).format(count) });
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
