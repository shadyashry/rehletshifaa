"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { apiFetchAs } from "@/lib/api";
import type { Locale } from "@/lib/i18n";

/**
 * The consultant's virtual clinic. The backend decides every permission; these types only mirror what it returns.
 * No identity-provider subject is ever part of this contract: consultants are addressed by practitioner id,
 * practice managers by delegation id, and people are shown by name.
 */
export type ClinicPermission = "SCHEDULE" | "PROFILE" | "SERVICES";
export type ClinicSummary = { practitionerId: string; consultantName: string; relation: "OWNER" | "PRACTICE_MANAGER"; permissions: ClinicPermission[] };
export type Capability = { type: string; code: string; label: string };
export type Professional = {
  displayName: string; specialty?: string | null; subspecialty?: string | null; careArea?: string | null; careAreaEn?: string | null; careAreaAr?: string | null;
  credentialingStatus: string; credentialsCurrent: boolean; capabilities: Capability[]; languages?: string | null;
  availabilityStatus?: string | null; expectedReviewHours?: number | null; assignable: boolean; practitionerVersion: number;
};
export type PublicProfile = { displayName?: string | null; headline?: string | null; bio?: string | null; languages?: string | null; publishedAt?: string | null };
export type ProfileDraft = PublicProfile & { status: string; updatedAt?: string | null; updatedByName?: string | null; updatedByRole?: string | null };
export type ClinicService = {
  id: string; serviceCode: string; serviceName: string; serviceKind?: string | null; description?: string | null; includedScope?: string | null;
  excludedScope?: string | null; currency: string; priceEgp: number; priceMaxEgp?: number | null; effectiveFrom?: string | null; validUntil?: string | null;
  active: boolean; approvalStatus: string; revision: number;
};
export type ServiceChange = {
  id: string; serviceId?: string | null; changeType: string; serviceCode: string; serviceName: string; serviceKind: string; description?: string | null;
  includedScope?: string | null; excludedScope?: string | null; currency: string; priceEgp: number; priceMaxEgp?: number | null; effectiveFrom: string;
  validUntil?: string | null; status: string; proposedByName?: string | null; proposedByRole: string; proposedAt: string; decidedByName?: string | null;
  decidedAt?: string | null; decisionReason?: string | null; appliedRevision?: number | null; version: number;
};
export type Slot = { id: string; startsAt: string; endsAt: string; mode: "VIDEO" | "IN_PERSON"; status: string; note?: string | null; version: number };
export type Manager = { id: string; name: string; email?: string | null; status: string; permissions: ClinicPermission[]; invitedAt: string; version: number };
export type Clinic = {
  practitionerId: string; relation: "OWNER" | "PRACTICE_MANAGER"; permissions: ClinicPermission[]; professional: Professional; publicProfile: PublicProfile;
  draft?: ProfileDraft | null; managerChangesRequireApproval: boolean; services: ClinicService[]; pendingChanges: ServiceChange[]; slots: Slot[];
  managers: Manager[]; version: number;
};
export type ClinicAuditEntry = { event: string; action: string; actorName?: string | null; actorRole: string; detail?: string | null; occurredAt: string };

export const SERVICE_KINDS = ["INITIAL_CASE_REVIEW", "VIDEO_CONSULTATION", "IN_PERSON_CONSULTATION", "FOLLOW_UP_CONSULTATION", "PROFESSIONAL_FEE", "OTHER_PROFESSIONAL_SERVICE"] as const;

export const virtualClinicHref = (locale: Locale, practitionerId?: string) =>
  `/${locale}/portal/virtual-clinic${practitionerId ? `?clinic=${encodeURIComponent(practitionerId)}` : ""}`;

/** The clinics the signed-in account may open (own + managed). One read per signed-in subject. */
export function useVirtualClinics(enabled = true) {
  const { user } = useAuth();
  const token = user?.access_token;
  const key = enabled && token ? user?.profile?.sub ?? "" : null;
  const [result, setResult] = useState<{ key: string; clinics: ClinicSummary[] } | null>(null);
  useEffect(() => {
    if (key === null || !token) return;
    let live = true;
    void apiFetchAs(token, "/clinics/mine")
      .then(async (r) => (r.ok ? ((await r.json()) as ClinicSummary[]) : []))
      .catch(() => [] as ClinicSummary[])
      .then((clinics) => { if (live) setResult({ key, clinics: Array.isArray(clinics) ? clinics : [] }); });
    return () => { live = false; };
    // Re-read on a new signed-in subject, not on every silent token renewal.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  const current = result && result.key === key ? result : null;
  return { clinics: current?.clinics ?? [], loading: key !== null && !current };
}

export function formatEgp(value: number | null | undefined, locale: Locale) {
  if (value === null || value === undefined) return "";
  return new Intl.NumberFormat(locale === "ar" ? "ar-EG" : "en-EG", { style: "currency", currency: "EGP", maximumFractionDigits: 2 }).format(value);
}
