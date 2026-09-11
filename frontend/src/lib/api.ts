/**
 * The single logical entry point for every business API call the browser makes.
 *
 * Callers name a versioned business route ("/cases", "/public/proposals/{token}") and never a host.
 * Which backend actually serves that route is a deployment concern owned by the API gateway and
 * `NEXT_PUBLIC_API_BASE_URL`; keeping the base in one module is what lets the backend be split into
 * services later without touching a single page.
 *
 * `process.env.NEXT_PUBLIC_*` must be referenced literally for Next.js to inline it at build time,
 * which is why the raw reads live here rather than behind a lookup helper.
 */

const DEFAULT_API_BASE_URL = "http://localhost:8080";
const DEFAULT_SITE_URL = "http://localhost:3000";
const DEFAULT_OIDC_AUTHORITY = "http://localhost:8180/realms/rehletshifaa";

/** Business API origin. The localhost default exists only so a bare `pnpm dev` works. */
export const API_BASE_URL = (process.env.NEXT_PUBLIC_API_BASE_URL ?? DEFAULT_API_BASE_URL).replace(/\/+$/, "");
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? DEFAULT_SITE_URL).replace(/\/+$/, "");
export const OIDC_AUTHORITY = (process.env.NEXT_PUBLIC_OIDC_AUTHORITY ?? DEFAULT_OIDC_AUTHORITY).replace(/\/+$/, "");
export const OIDC_CLIENT_ID = process.env.NEXT_PUBLIC_OIDC_CLIENT_ID ?? "rehletshifaa-web";

const API_VERSION = "/api/v1";

/** Absolute URL for a versioned business route, e.g. apiUrl("/cases") -> https://api…/api/v1/cases. */
export function apiUrl(path: string): string {
  return `${API_BASE_URL}${API_VERSION}${path.startsWith("/") ? path : `/${path}`}`;
}

/** fetch() against a business route. Identical semantics to fetch, minus the host. */
export function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  return fetch(apiUrl(path), init);
}

/** Bearer-authenticated call for the staff/patient portal. */
export function apiFetchAs(accessToken: string, path: string, init?: RequestInit): Promise<Response> {
  const sendsJson = !!init?.body && !(init.body instanceof FormData);
  return apiFetch(path, {
    ...init,
    cache: "no-store",
    headers: { Authorization: `Bearer ${accessToken}`, ...(sendsJson ? { "Content-Type": "application/json" } : {}), ...init?.headers },
  });
}
