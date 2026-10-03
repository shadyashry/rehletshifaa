"use client";

import { useCallback } from "react";
import { useAuth } from "@/components/AuthProvider";
import { satisfiesReauthenticationAcr, type Me } from "@/lib/access";

/** The backend's step-up window is 10 minutes; warn a little before it runs out. */
const FRESH_SIGN_IN_MS = 9 * 60_000;

/** True when the current sign-in is older than the step-up window (or its time is unknown). */
export function signInIsStale(authTime: unknown, now = Date.now()) {
  return typeof authTime !== "number" || now - authTime * 1000 > FRESH_SIGN_IN_MS;
}

export type ControlCenterAccess = {
  loading: boolean;
  /** The access read itself failed (network or server error). Never shown as "no access". */
  failed: boolean;
  retry: () => void;
  me: Me | null;
  /** Holds this platform permission (e.g. `WORKFORCE_READ`), fail-closed. */
  can: (permission: string) => boolean;
  canAny: (permissions: string[]) => boolean;
  /** Holds the permission, and performing it will ask for a fresh sign-in first. */
  needsFreshSignIn: (permission: string) => boolean;
};

/**
 * Control Center navigation reads the same `/api/v1/me` answer the whole app uses. It only hides what the caller cannot
 * use; every page and every API call is still authorized by the backend.
 */
export function useControlCenterAccess(): ControlCenterAccess {
  const { user, me, loading, meFailed, refreshMe } = useAuth();
  const can = useCallback((permission: string) => !!me?.permissions.includes(permission), [me]);
  const canAny = useCallback((permissions: string[]) => permissions.some((p) => can(p)), [can]);
  const authTime = user?.profile?.auth_time;
  const acr = user?.profile?.acr;
  const needsFreshSignIn = useCallback((permission: string) => !!me?.reauthenticate.includes(permission)
    && (signInIsStale(authTime) || !satisfiesReauthenticationAcr(me, acr)), [me, authTime, acr]);
  return { loading, failed: meFailed, retry: refreshMe, me, can, canAny, needsFreshSignIn };
}
