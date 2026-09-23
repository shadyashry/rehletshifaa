"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { apiFetchAs } from "@/lib/api";
import { legacyAdministration } from "@/lib/portal-role-access";

export type Decision = { permission: string; allowed: boolean; reason?: string };

export type ControlCenterAccess = {
  loading: boolean;
  decisions: Decision[];
  /** Exact backend capability key, fail-closed. */
  can: (permission: string) => boolean;
  canAny: (permissions: string[]) => boolean;
  legacy: ReturnType<typeof legacyAdministration>;
};

/** Every "view" capability of the assignment family; any one of them opens Care Coordination. */
export const COORDINATION_VIEW = ["assignment.team.view", "assignment.policy.view", "assignment.queue.manage", "assignment.audit.view", "assignment.simulate"];

/**
 * One `/admin/access/me` read per shell render instead of one per navigation section. Navigation only
 * hides what the caller cannot use; every page and every API call is still authorized by the backend.
 */
export function useControlCenterAccess(): ControlCenterAccess {
  const { user, roles } = useAuth();
  const [decisions, setDecisions] = useState<Decision[]>([]);
  const [loading, setLoading] = useState(true);
  const token = user?.access_token;
  const subject = user?.profile?.sub;
  const signedIn = !!token;
  useEffect(() => {
    let live = true;
    setDecisions([]);
    if (!token) { setLoading(false); return; }
    setLoading(true);
    void apiFetchAs(token, "/admin/access/me")
      .then(async (r) => (r.ok ? (await r.json()) as Decision[] : []))
      .catch(() => [] as Decision[])
      .then((d) => { if (live) { setDecisions(Array.isArray(d) ? d : []); setLoading(false); } });
    return () => { live = false; };
    // Re-read on a new signed-in subject, not on every silent token renewal.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subject, signedIn]);
  const can = useCallback((permission: string) => decisions.some((d) => d.permission === permission && d.allowed), [decisions]);
  const canAny = useCallback((permissions: string[]) => permissions.some((p) => can(p)), [can]);
  return { loading, decisions, can, canAny, legacy: legacyAdministration(roles ?? []) };
}
