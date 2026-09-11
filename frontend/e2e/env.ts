/**
 * Where the browser under test actually sends business API calls.
 *
 * The specs mock public endpoints with `page.route`, so the pattern has to match the origin the
 * built frontend was configured with — otherwise the route never intercepts and the test hangs on a
 * real network call. Keeping it here means one env var switches the whole suite between the local
 * stack and the tunnel-served dev environment.
 */
export const API_BASE = (process.env.PLAYWRIGHT_API_BASE_URL ?? "http://localhost:8080").replace(/\/+$/, "");
export const API = `${API_BASE}/api/v1`;
export const OIDC_AUTHORITY = process.env.PLAYWRIGHT_OIDC_AUTHORITY ?? "http://localhost:8180/realms/rehletshifaa";
