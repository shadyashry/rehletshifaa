"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { useAdminApi } from "./admin-api";

export type Organization = { id: string; legalName: string; businessName?: string; displayName: string; type: string; status: string; countryCode: string; timeZone: string; defaultCurrency: string; legacyMappingStatus?: string | null; version: number };
export type Member = { subject: string; kind: "CLINICIAN" | "PRACTICE_STAFF" | "PLATFORM_STAFF"; practitionerId: string | null; status: string; effectiveFrom: string; effectiveTo: string | null; invitationStatus: string; revision: number; roles: string[]; displayName?: string | null };
export type Relationship = { id: string; subject: string; type: string; targetPractitionerId: string; status: string; revision: number };
export type ProviderDetail = { organization: Organization; members: Member[]; relationships: Relationship[] };
export type Person = Member & { organization: Organization };

export const CLINICIAN_ROLES = ["CONSULTANT", "ASSOCIATE_DOCTOR"];
export const PRACTICE_ROLES = ["ORGANIZATION_OWNER", "PRACTICE_MANAGER", "CONSULTANT_ASSISTANT"];

/** A person's name, falling back to a neutral label — never an account identifier as the primary text. */
export const personName = (m: Pick<Member, "displayName">, locale: string) => m.displayName?.trim() || (locale === "ar" ? "شخص بلا اسم مسجّل" : "Unnamed person");

/**
 * Every provider organization the caller can view, with its people. There is no cross-organization people
 * endpoint, so this reads the organization list and each organization's detail — the same reads the
 * organization pages already make, bounded to the organizations the backend returns for this caller.
 */
export function useProviderDirectory(enabled: boolean) {
  const { user } = useAuth();
  const api = useAdminApi();
  const [details, setDetails] = useState<ProviderDetail[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const subject = user?.profile?.sub;
  const signedIn = !!user;
  const load = useCallback(async () => {
    if (!enabled || !user) { setLoading(false); return; }
    setLoading(true); setError(null);
    try {
      const orgs = await api<Organization[]>("/admin/providers");
      const rows = await Promise.all(orgs.map((o) => api<ProviderDetail>(`/admin/providers/${o.id}`).catch(() => ({ organization: o, members: [], relationships: [] }))));
      setDetails(rows);
    } catch (e) { setError(e); } finally { setLoading(false); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, subject, signedIn]);
  useEffect(() => { void load(); }, [load]);
  const people: Person[] = useMemo(() => details.flatMap((d) => d.members.map((m) => ({ ...m, organization: d.organization }))), [details]);
  return { details, people, loading, error, reload: load };
}
