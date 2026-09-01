"use client";

import { UserManager, WebStorageStateStore, type User } from "oidc-client-ts";

let manager: UserManager | undefined;
export function authManager() {
  if (typeof window === "undefined") throw new Error("OIDC is available only in the browser");
  manager ??= new UserManager({
    authority: process.env.NEXT_PUBLIC_OIDC_AUTHORITY ?? "http://localhost:8180/realms/rehletshifaa",
    client_id: process.env.NEXT_PUBLIC_OIDC_CLIENT_ID ?? "rehletshifaa-web",
    redirect_uri: `${window.location.origin}/auth/callback`,
    post_logout_redirect_uri: `${window.location.origin}/en/portal`,
    response_type: "code",
    scope: "openid profile email",
    userStore: new WebStorageStateStore({ store: window.sessionStorage }),
    stateStore: new WebStorageStateStore({ store: window.sessionStorage }),
    automaticSilentRenew: false,
    monitorSession: false,
  });
  return manager;
}

export function userRoles(user: User | null) {
  const access = user?.profile as { realm_access?: { roles?: string[] }; roles?: string[] } | undefined;
  return [...new Set([...(access?.realm_access?.roles ?? []), ...(access?.roles ?? [])])];
}
