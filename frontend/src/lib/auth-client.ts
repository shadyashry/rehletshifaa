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
  const profile = user?.profile as RoleClaims | undefined;
  const access = tokenClaims(user?.access_token);
  return [...new Set([
    ...(profile?.realm_access?.roles ?? []),
    ...(profile?.roles ?? []),
    ...(access?.realm_access?.roles ?? []),
    ...(access?.roles ?? []),
  ])];
}

type RoleClaims = { realm_access?: { roles?: string[] }; roles?: string[] };

function tokenClaims(token?: string): RoleClaims | undefined {
  if (!token) return undefined;
  try {
    const payload = token.split(".")[1];
    if (!payload) return undefined;
    const base64 = payload.replaceAll("-", "+").replaceAll("_", "/").padEnd(Math.ceil(payload.length / 4) * 4, "=");
    return JSON.parse(globalThis.atob(base64)) as RoleClaims;
  } catch {
    return undefined;
  }
}
