"use client";

import { UserManager, WebStorageStateStore } from "oidc-client-ts";

import { OIDC_AUTHORITY, OIDC_CLIENT_ID } from "@/lib/api";

let manager: UserManager | undefined;
export function authManager() {
  if (typeof window === "undefined") throw new Error("OIDC is available only in the browser");
  manager ??= new UserManager({
    authority: OIDC_AUTHORITY,
    client_id: OIDC_CLIENT_ID,
    redirect_uri: `${window.location.origin}/auth/callback`,
    post_logout_redirect_uri: `${window.location.origin}/en/portal`,
    response_type: "code",
    scope: "openid profile email",
    userStore: new WebStorageStateStore({ store: window.sessionStorage }),
    stateStore: new WebStorageStateStore({ store: window.sessionStorage }),
    // Renew the access token from the refresh token before it expires so an
    // in-progress action (e.g. taking ownership) is never rejected with a 401
    // that would drop the coordinator back to the queue.
    automaticSilentRenew: true,
    accessTokenExpiringNotificationTimeInSeconds: 70,
    monitorSession: false,
  });
  return manager;
}
