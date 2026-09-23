"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { apiFetchAs } from "@/lib/api";
import { legacyAdministration } from "@/lib/portal-role-access";

/**
 * One of the caller's own capabilities from `/admin/access/me`: held at the platform or in an organization where the
 * caller has an active role. `recentAuthentication` marks actions that ask for a fresh sign-in when performed.
 * Navigation only — every endpoint still authorizes its own request.
 */
export type Decision = { permission: string; allowed: boolean; reason?: string; recentAuthentication?: boolean };

/** The backend's recent-authentication window is 15 minutes; warn a little before it runs out. */
const FRESH_SIGN_IN_MS = 14 * 60_000;

/** True when the current sign-in is older than the recent-authentication window (or its time is unknown). */
export function signInIsStale(authTime: unknown, now = Date.now()) {
  return typeof authTime !== "number" || now - authTime * 1000 > FRESH_SIGN_IN_MS;
}

export type ControlCenterAccess = {
  loading: boolean;
  /** The capability read itself failed (network or server error). Never shown as "no access". */
  failed: boolean;
  retry: () => void;
  decisions: Decision[];
  /** Exact backend capability key, fail-closed. */
  can: (permission: string) => boolean;
  canAny: (permissions: string[]) => boolean;
  /** The caller holds this capability, but performing it will ask them to sign in again first. */
  needsFreshSignIn: (permission: string) => boolean;
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
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const token = user?.access_token;
  const subject = user?.profile?.sub;
  const signedIn = !!token;
  useEffect(() => {
    let live = true;
    setDecisions([]); setFailed(false);
    if (!token) { setLoading(false); return; }
    setLoading(true);
    // 401/403 mean "no Control Center capabilities"; anything else is a failed read, not an access answer.
    void apiFetchAs(token, "/admin/access/me")
      .then(async (r) => (r.ok ? { d: (await r.json()) as Decision[], bad: false } : { d: [] as Decision[], bad: r.status !== 401 && r.status !== 403 }))
      .catch(() => ({ d: [] as Decision[], bad: true }))
      .then(({ d, bad }) => { if (live) { setDecisions(Array.isArray(d) ? d : []); setFailed(bad); setLoading(false); } });
    return () => { live = false; };
    // Re-read on a new signed-in subject, not on every silent token renewal.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subject, signedIn, attempt]);
  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  const can = useCallback((permission: string) => decisions.some((d) => d.permission === permission && d.allowed), [decisions]);
  const canAny = useCallback((permissions: string[]) => permissions.some((p) => can(p)), [can]);
  const authTime = user?.profile?.auth_time;
  const needsFreshSignIn = useCallback((permission: string) => decisions.some((d) => d.permission === permission && d.allowed && d.recentAuthentication) && signInIsStale(authTime), [decisions, authTime]);
  return { loading, failed, retry, decisions, can, canAny, needsFreshSignIn, legacy: legacyAdministration(roles ?? []) };
}
