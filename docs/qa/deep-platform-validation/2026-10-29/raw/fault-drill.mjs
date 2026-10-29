// Fault drills on the isolated QA stack (Compose project rehletshifaa-qa): stop one dependency, probe the public
// intake path, the API's sign-in boundary and health, start it again, and check the same path recovers.
// Synthetic data only; prints statuses, codes and timings, never tokens or grants. Never touches the dev stack.
import { execFileSync } from "node:child_process";

const API = process.env.API ?? "http://localhost:18081";
const BACKEND = process.env.BACKEND ?? "http://localhost:18080";
const KEYCLOAK = process.env.KEYCLOAK ?? "http://localhost:18180";
const MAILPIT = process.env.MAILPIT ?? "http://localhost:18025";
const ORIGIN = "http://localhost:13000";
const PROJECT = "rehletshifaa-qa";
const ONLY = process.env.ONLY ? process.env.ONLY.split(",") : null;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const letters = n => String(n).replace(/[0-9]/g, d => "abcdefghij"[d]);
const results = [];
const record = (drill, phase, probe, detail) => { results.push({ drill, phase, probe, ...detail }); console.log(`${drill.padEnd(9)} ${phase.padEnd(8)} ${probe.padEnd(10)} ${JSON.stringify(detail)}`); };

async function call(method, url, body, headers = {}) {
  const t0 = performance.now();
  try {
    const res = await fetch(url, { method, headers: { "content-type": "application/json", origin: ORIGIN, ...headers }, body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(30000) });
    const text = await res.text(); let json = null; try { json = JSON.parse(text); } catch { /* not json */ }
    return { status: res.status, json, ms: Math.round(performance.now() - t0) };
  } catch (e) { return { status: 0, json: { code: e.name }, ms: Math.round(performance.now() - t0) }; }
  finally { await sleep(1300); } // inside the public budget (30/min, burst 15)
}
const pdf = Buffer.from("%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n");

async function intake(drill, phase) {
  const stamp = Date.now();
  const email = `drill-${drill}-${phase}-${stamp}@local.test`;
  const c = await call("POST", `${API}/api/v1/cases`, { caseFor: "MYSELF", givenName: "Drill", familyName: `Fault ${letters(stamp).slice(-6)}`, country: "Kenya",
    whatsappNumber: `+2547${String(stamp).slice(-8)}`, conditionDescription: `Synthetic fault drill ${drill} ${phase}`, preferredLanguage: "en", consent: true, turnstileToken: null,
    ageBand: "AGE_18_64", email, timeZone: "Africa/Nairobi", careArea: "cardiology", travelPackageRequested: false });
  record(drill, phase, "create", { status: c.status, code: c.json?.code, ms: c.ms });
  if (c.status !== 201) return { email };
  const { caseId, intakeGrant } = c.json; const grant = { "x-case-grant": intakeGrant };
  const p = await call("POST", `${API}/api/v1/cases/${caseId}/documents/presign`, { originalFileName: "report.pdf", contentType: "application/pdf", sizeBytes: pdf.length }, grant);
  let put = 0, confirm = { status: 0 };
  if (p.status === 201) {
    try { put = (await fetch(p.json.uploadUrl, { method: "PUT", headers: { ...(p.json.requiredHeaders ?? {}) }, body: pdf, signal: AbortSignal.timeout(30000) })).status; } catch { put = 0; }
    confirm = await call("POST", `${API}/api/v1/cases/${caseId}/documents/confirm`, { documentId: p.json.documentId }, grant);
  }
  record(drill, phase, "upload", { presign: p.status, put, confirm: confirm.status, code: confirm.json?.code ?? confirm.json?.status, ms: p.ms + (confirm.ms ?? 0) });
  const s = await call("POST", `${API}/api/v1/cases/${caseId}/submit`, undefined, grant);
  record(drill, phase, "submit", { status: s.status, code: s.json?.code, ms: s.ms });
  return { email, caseId };
}
async function boundary(drill, phase) {
  const h = await call("GET", `${BACKEND}/actuator/health`);
  record(drill, phase, "health", { status: h.status, state: h.json?.status, ms: h.ms });
  const me = await call("GET", `${API}/api/v1/me`, undefined, { authorization: "Bearer not-a-token" });
  record(drill, phase, "bad-token", { status: me.status, code: me.json?.code, ms: me.ms });
  const oidc = await call("GET", `${KEYCLOAK}/realms/rehletshifaa/.well-known/openid-configuration`);
  record(drill, phase, "oidc", { status: oidc.status, ms: oidc.ms });
}
const docker = (...args) => execFileSync("docker", args, { stdio: ["ignore", "pipe", "pipe"] }).toString().trim();
async function waitHealthy(service, timeoutMs = 240000) {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    const state = docker("inspect", "-f", "{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}", `${PROJECT}-${service}-1`);
    const backend = await fetch(`${BACKEND}/actuator/health`).then(r => r.status).catch(() => 0);
    if ((state === "healthy" || state === "running") && backend === 200) return Date.now() - (end - timeoutMs);
    await sleep(3000);
  }
  return -1;
}
async function mailTo(address, timeoutMs = 120000) {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    const r = await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:"${address}"`)}`).then(x => x.json()).catch(() => null);
    if (r?.messages?.length) return r.messages.length;
    await sleep(4000);
  }
  return 0;
}

const DRILLS = ["redis", "keycloak", "clamav", "minio", "mailpit", "postgres"];
for (const drill of DRILLS.filter(d => !ONLY || ONLY.includes(d))) {
  await boundary(drill, "before");
  docker("stop", `${PROJECT}-${drill}-1`);
  await sleep(4000);
  await boundary(drill, "outage");
  const during = await intake(drill, "outage");
  docker("start", `${PROJECT}-${drill}-1`);
  const recoveredMs = await waitHealthy(drill);
  record(drill, "recover", "healthy", { afterMs: recoveredMs });
  await boundary(drill, "after");
  await intake(drill, "after");
  if (drill === "mailpit" && during.caseId) record(drill, "after", "outbox", { mailsDeliveredForOutageCase: await mailTo(during.email) });
}
console.log(JSON.stringify(results));
