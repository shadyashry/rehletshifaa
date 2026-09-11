import { expect, test, type APIRequestContext } from "@playwright/test";

/**
 * The API gateway's edge policy, exercised directly against its listener (`GATEWAY_TEST_URL`, e.g. the
 * published http://localhost:8081). From the docker host the gateway sees a private-network peer, which
 * is exactly the position cloudflared is in, so CF-Connecting-IP is honoured and each test can act as a
 * distinct client without touching anybody's real budget. Business answers are the backend's (401 for
 * an unauthenticated read); what is under test is who gets counted, what is counted, and how much.
 */
const GATEWAY = process.env.GATEWAY_TEST_URL;
test.skip(!GATEWAY, "GATEWAY_TEST_URL is not set; gateway policy checks need the running gateway");
test.describe.configure({ mode: "serial" });

const ORIGIN = process.env.PLAYWRIGHT_BASE_URL ?? "https://dev.rehletshifaa.com";
const PATH = "/api/v1/coordinator/me";
let n = 0;
const client = () => `203.0.113.${++n}`; // TEST-NET-3: one fresh identity per scenario

async function burst(request: APIRequestContext, ip: string, count: number, path = PATH, method: "get" | "post" = "get") {
  const results = await Promise.all(Array.from({ length: count }, () =>
    request[method](`${GATEWAY}${path}`, { headers: { "CF-Connecting-IP": ip }, data: method === "post" ? {} : undefined })));
  return results.map(r => r.status());
}

test("two clients never share a bucket, and a normal page open never sees 429", async ({ request }) => {
  // A coordinator sign-in plus one case open is ~15 reads; give each client double that at once.
  const a = await burst(request, client(), 30);
  const b = await burst(request, client(), 30);
  expect(a.filter(s => s === 429)).toHaveLength(0);
  expect(b.filter(s => s === 429)).toHaveLength(0);
  expect(new Set([...a, ...b])).toEqual(new Set([401]));
});

test("CORS preflights are answered but never spend the client's budget", async ({ request }) => {
  const ip = client();
  const preflights = await Promise.all(Array.from({ length: 80 }, () => request.fetch(`${GATEWAY}${PATH}`, {
    method: "OPTIONS", headers: { "CF-Connecting-IP": ip, Origin: ORIGIN, "Access-Control-Request-Method": "GET", "Access-Control-Request-Headers": "authorization" } })));
  for (const p of preflights) {
    expect(p.status()).toBe(200);
    expect(p.headers()["access-control-allow-origin"]).toBe(ORIGIN);
  }
  // 80 preflights later the same client still has its full read budget.
  const reads = await burst(request, ip, 40);
  expect(reads.filter(s => s === 429)).toHaveLength(0);
});

test("health probes do not count against ordinary API quota", async ({ request }) => {
  const ip = client();
  for (let i = 0; i < 50; i++) expect((await request.get(`${GATEWAY}/gateway/health`, { headers: { "CF-Connecting-IP": ip } })).status()).toBe(200);
  expect((await burst(request, ip, 40)).filter(s => s === 429)).toHaveLength(0);
});

test("a client hammering reads is still throttled", async ({ request }) => {
  const statuses = await burst(request, client(), 200);
  expect(statuses.filter(s => s === 429).length).toBeGreaterThan(0);
  expect(statuses.filter(s => s === 401).length).toBeGreaterThanOrEqual(60); // the burst it is entitled to
});

test("writes have their own, smaller budget", async ({ request }) => {
  const ip = client();
  const normal = await burst(request, ip, 10, "/api/v1/coordinator/cases/00000000-0000-0000-0000-000000000000/claim", "post");
  expect(normal.filter(s => s === 429)).toHaveLength(0);
  const abuse = await burst(request, client(), 120, "/api/v1/coordinator/cases/00000000-0000-0000-0000-000000000000/claim", "post");
  expect(abuse.filter(s => s === 429).length).toBeGreaterThan(0);
});

test("public secure-link routes are the tightest, and a patient flow fits inside them", async ({ request }) => {
  const flow = await burst(request, client(), 8, "/api/v1/public/proposals/not-a-real-token");
  expect(flow.filter(s => s === 429)).toHaveLength(0);
  const abuse = await burst(request, client(), 80, "/api/v1/public/proposals/not-a-real-token");
  expect(abuse.filter(s => s === 429).length).toBeGreaterThan(0);
});

test("every response carries a correlation id and an incoming one is kept", async ({ request }) => {
  const fresh = await request.get(`${GATEWAY}${PATH}`, { headers: { "CF-Connecting-IP": client() } });
  expect(fresh.headers()["x-request-id"]).toMatch(/^[0-9a-f]{32}$/);
  const supplied = await request.get(`${GATEWAY}${PATH}`, { headers: { "CF-Connecting-IP": client(), "X-Request-ID": "trace-abc-123" } });
  expect(supplied.headers()["x-request-id"]).toBe("trace-abc-123");
});

test("only the gateway's contract is exposed", async ({ request }) => {
  expect((await request.get(`${GATEWAY}/swagger-ui.html`)).status()).toBe(404);
  expect((await request.get(`${GATEWAY}/actuator/env`)).status()).toBe(404);
});
