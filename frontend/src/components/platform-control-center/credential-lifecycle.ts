import type { Locale } from "@/lib/i18n";
import { credentialExpired, formatDate, type Tone } from "./admin-labels";

/**
 * Provider credential lifecycle, for display only. Every state here is a stored backend fact or derived from one with the
 * backend's own rule; nothing here decides readiness (the backend readiness does).
 *
 * - Verification (who reviewed, what they decided) and validity (the expiry date) are separate facts. A credential that was
 *   independently verified but whose expiry has passed is shown as **Expired** — never as currently valid — while its
 *   verification stays visible in its history.
 * - Expiry: `credentialExpired` (admin-labels) — expired from the expiry instant onwards, as `CredentialValidity` on the backend.
 */

/**
 * Days before the expiry date that a credential is labelled "Expiring soon". Display only — defined here and nowhere
 * else. It matches the first expiry reminder the backend already sends (`app.credentials.reminder-days`, default 30,7,1).
 */
export const EXPIRING_SOON_DAYS = 30;
const DAY = 86_400_000;

export type Validity = { kind: "none" } | { kind: "valid" | "expiring" | "expired"; expiresAt: string; days: number };

const localMidnight = (t: number) => { const d = new Date(t); return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime(); };
/** Whole calendar days (in the viewer's time zone, the same one dates are shown in) from today to the expiry date. */
const calendarDays = (from: number, to: number) => Math.round((localMidnight(to) - localMidnight(from)) / DAY);

export function credentialValidity(expiresAt: string | null | undefined, now = Date.now()): Validity {
  if (!expiresAt) return { kind: "none" };
  const days = calendarDays(now, new Date(expiresAt).getTime());
  if (credentialExpired(expiresAt, now)) return { kind: "expired", expiresAt, days };
  return { kind: days <= EXPIRING_SOON_DAYS ? "expiring" : "valid", expiresAt, days };
}

/** "Expires 14 Oct 2026" · "Expires in 21 days" (expiring soon) · "Expired 14 Sep 2026". Null when no expiry was declared. */
export function validityText(v: Validity, locale: Locale): { label: string; tone: Tone; soon: boolean } | null {
  const ar = locale === "ar";
  if (v.kind === "none") return null;
  if (v.kind === "expired") return { label: v.days === 0 ? (ar ? "انتهت الصلاحية اليوم" : "Expired today") : `${ar ? "انتهت الصلاحية في" : "Expired"} ${formatDate(v.expiresAt, locale)}`, tone: "danger", soon: false };
  if (v.kind === "valid") return { label: `${ar ? "تنتهي الصلاحية في" : "Expires"} ${formatDate(v.expiresAt, locale)}`, tone: "neutral", soon: false };
  const when = v.days === 0 ? (ar ? "تنتهي الصلاحية اليوم" : "Expires today") : v.days === 1 ? (ar ? "تنتهي الصلاحية غدًا" : "Expires tomorrow") : (ar ? `تنتهي الصلاحية خلال ${v.days} يومًا` : `Expires in ${v.days} days`);
  return { label: when, tone: "warning", soon: true };
}

/** One submitted revision, as `GET …/credentials` and the review queue return it. */
export type Revision = { id: string; organizationId: string; practitionerId: string; ownerSubject: string; credentialType: string; revisionNumber: number; status: string; dossierStatus: string; expiresAt: string | null; submittedBy: string; submittedAt: string; version: number; evidenceIds: string[] };

export type HistoryEntry = { event: string; revisionNumber: number; at: string; actorName: string | null; byYou: boolean; reason: string | null };
export type EvidenceSummary = { id: string; fileName: string; contentType: string; sizeBytes: number; securityCheck: string; checkedAt: string | null; uploadedByName: string | null; uploadedAt: string };
export type SubmittedFacts = { issuer: string | null; referenceNumber: string | null; issuedAt: string | null; expiresAt: string | null; jurisdiction: string | null };
/**
 * `GET /admin/providers/{org}/credential-reviews/{revision}`. `reviewerView`: the caller holds independent-review access, so
 * reasons and reviewer names are included. Otherwise only the reviewer's request for more information is shared.
 */
export type ReviewDetail = Revision & {
  submittedFacts?: SubmittedFacts | null; reviewedBy?: string | null; reviewedAt?: string | null;
  clinicianName?: string | null; clinicianType?: string | null; organizationName?: string | null; submittedByName?: string | null; reviewerName?: string | null;
  reviewerView?: boolean; evidence?: EvidenceSummary[]; history?: HistoryEntry[];
};
/** `GET /admin/providers/credential-reviews` — every organization the caller can review. */
export type QueueRow = {
  id: string; organizationId: string; organizationName: string; practitionerId: string; clinicianName: string | null; clinicianType: string | null; credentialType: string;
  revisionNumber: number; status: string; dossierStatus: string; jurisdiction: string | null; expiresAt: string | null; submittedAt: string;
  reviewedBy: string | null; reviewerName: string | null; reviewedAt: string | null; evidenceCount: number;
};

/**
 * Where one required credential stands, from all its submitted versions — the same precedence the backend readiness and the
 * Clinicians directory use: an explicit suspension › an effective independently verified version (a newer version under
 * review does not hide it) › a verified version that has expired › the latest version's status.
 */
export type RequirementState = { key: "NOT_SUBMITTED" | "SUSPENDED" | "VERIFIED" | "EXPIRED" | string; shown?: Revision; latest?: Revision; newer?: Revision; validity: Validity };
export function requirementState(revisions: Revision[], now = Date.now()): RequirementState {
  if (!revisions.length) return { key: "NOT_SUBMITTED", validity: { kind: "none" } };
  const sorted = [...revisions].sort((a, b) => b.revisionNumber - a.revisionNumber);
  const latest = sorted[0];
  const newerThan = (r: Revision) => (latest !== r && latest.revisionNumber > r.revisionNumber ? latest : undefined);
  if (sorted.some((r) => r.dossierStatus === "SUSPENDED")) {
    const shown = sorted.find((r) => r.status === "SUSPENDED") ?? latest;
    return { key: "SUSPENDED", shown, latest, newer: newerThan(shown), validity: credentialValidity(shown.expiresAt, now) };
  }
  const effective = sorted.find((r) => r.status === "VERIFIED" && r.dossierStatus === "VERIFIED" && credentialValidity(r.expiresAt, now).kind !== "expired");
  if (effective) return { key: "VERIFIED", shown: effective, latest, newer: newerThan(effective), validity: credentialValidity(effective.expiresAt, now) };
  const expired = sorted.find((r) => r.status === "VERIFIED");
  if (expired) return { key: "EXPIRED", shown: expired, latest, newer: newerThan(expired), validity: credentialValidity(expired.expiresAt, now) };
  return { key: latest.status, shown: latest, latest, validity: credentialValidity(latest.expiresAt, now) };
}

const HISTORY: Record<string, [string, string]> = {
  SUBMITTED: ["Submitted for review", "أُرسل للمراجعة"], RESUBMITTED: ["New version submitted", "أُرسلت نسخة جديدة"],
  REVIEW_STARTED: ["Review started", "بدأت المراجعة"], MORE_INFORMATION_REQUIRED: ["More information requested", "طُلبت معلومات إضافية"],
  VERIFIED: ["Verified by an independent reviewer", "تحقق منه مراجع مستقل"], REJECTED: ["Rejected", "رُفض"], SUSPENDED: ["Suspended", "أُوقف"], RESTORED: ["Restored", "أُعيد"],
};
export const historyEventLabel = (event: string, locale: Locale) => HISTORY[event]?.[locale === "ar" ? 1 : 0] ?? event;
/** The latest entry of one kind for a given version, e.g. the reviewer's request for more information. */
export const latestEntry = (history: HistoryEntry[] | undefined, event: string, revisionNumber?: number) =>
  (history ?? []).find((h) => h.event === event && (revisionNumber === undefined || h.revisionNumber === revisionNumber));
