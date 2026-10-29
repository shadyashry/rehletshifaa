// Live public-intake journey + security checks through the real gateway (tunnel), MinIO, ClamAV, outbox and Mailpit.
// Synthetic data only; tagged DPV-<run>. Prints no tokens or codes, only outcomes, statuses, request ids and timings.
const API = process.env.API ?? "https://api-dev.rehletshifaa.com";
const ORIGIN = "https://dev.rehletshifaa.com";
const MAILPIT = process.env.MAILPIT ?? "http://localhost:8025";
const RUN = process.env.RUN ?? `DPV-${Date.now().toString(36)}`;
const results = [];
const TAG = "Dpv" + RUN.replace(/[^a-z0-9]/gi, "").toLowerCase().replace(/[0-9]/g, d => "abcdefghij"[d]);
const sleep = ms => new Promise(r => setTimeout(r, ms));
function record(id, outcome, detail) { results.push({ id, outcome, ...detail }); console.log(`${outcome.padEnd(4)} ${id} ${JSON.stringify(detail)}`); }

async function call(method, path, body, headers = {}) {
  const t0 = performance.now();
  const res = await fetch(API + path, { method, headers: { "content-type": "application/json", origin: ORIGIN, ...headers }, body: body === undefined ? undefined : JSON.stringify(body) });
  const ms = Math.round(performance.now() - t0);
  let json = null; const text = await res.text(); try { json = JSON.parse(text); } catch { /* not json */ }
  await sleep(1200); // stay well inside the public budget (30/min, burst 15) shared with anyone on this IP
  return { status: res.status, json, ms, rid: res.headers.get("x-request-id") };
}

async function mailCount() { const r = await fetch(`${MAILPIT}/api/v1/messages?limit=1`); return (await r.json()).total; }
async function waitMail(predicate, since, timeoutMs = 90000) {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    const list = (await (await fetch(`${MAILPIT}/api/v1/messages?limit=50`)).json()).messages;
    for (const m of list) {
      if (new Date(m.Created).getTime() < since) continue;
      const full = await (await fetch(`${MAILPIT}/api/v1/message/${m.ID}`)).json();
      if (predicate(full)) return { msg: full, lagMs: new Date(m.Created).getTime() - since };
    }
    await sleep(2000);
  }
  return null;
}
const pdf = Buffer.from("%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n");
const eicar = "X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*";

async function upload(caseId, grant, name, type, bytes, putType = type) {
  const p = await call("POST", `/api/v1/cases/${caseId}/documents/presign`, { originalFileName: name, contentType: type, sizeBytes: bytes.length }, { "x-case-grant": grant });
  if (p.status !== 201) return { presign: p.status, code: p.json?.code };
  const headers = { ...(p.json.requiredHeaders ?? {}) }; headers["content-type"] = putType;
  const put = await fetch(p.json.uploadUrl, { method: "PUT", headers, body: bytes });
  const c = await call("POST", `/api/v1/cases/${caseId}/documents/confirm`, { documentId: p.json.documentId }, { "x-case-grant": grant });
  return { presign: p.status, put: put.status, confirm: c.status, code: c.json?.code ?? c.json?.status, ms: p.ms + c.ms };
}

const started = Date.now();
const phone = `+2547${String(Date.now()).slice(-8)}`;
// UC-01 negative: missing consent, bad phone, bad age band.
let r = await call("POST", "/api/v1/cases", { givenName: "Nour", familyName: TAG, country: "Kenya", whatsappNumber: phone, preferredLanguage: "en", consent: false, ageBand: "AGE_18_64" });
record("UC-01/neg-consent", r.status === 400 ? "PASS" : "FAIL", { status: r.status, code: r.json?.code, rid: r.rid });
r = await call("POST", "/api/v1/cases", { givenName: "Nour", familyName: TAG, country: "Kenya", whatsappNumber: "abc", preferredLanguage: "en", consent: true, ageBand: "AGE_18_64" });
record("UC-01/neg-phone", r.status === 400 ? "PASS" : "FAIL", { status: r.status, code: r.json?.code });

// UC-01 happy path.
r = await call("POST", "/api/v1/cases", { givenName: "Nour", familyName: TAG, country: "Kenya", whatsappNumber: phone, conditionDescription: `Synthetic ${RUN}`, preferredLanguage: "en", consent: true, email: `dpv.${RUN.toLowerCase()}@local.test`, careArea: "cardiology", ageBand: "AGE_18_64" });
record("UC-01/create", r.status === 201 ? "PASS" : "FAIL", { status: r.status, caseNumber: r.json?.caseNumber, ms: r.ms, rid: r.rid });
const { caseId, intakeGrant: grant, caseNumber } = r.json ?? {};

if (caseId) {
  record("UC-01/upload-clean", ...(u => [u.code === "CLEAN" ? "PASS" : "FAIL", u])(await upload(caseId, grant, "report.pdf", "application/pdf", pdf)));
  record("SEC-13/oversize", ...(u => [u.presign === 400 ? "PASS" : "FAIL", u])(await upload(caseId, grant, "big.pdf", "application/pdf", Buffer.alloc(16 * 1024 * 1024 + 1))));
  record("SEC-13/type", ...(u => [u.presign === 400 ? "PASS" : "FAIL", u])(await upload(caseId, grant, "x.exe", "application/octet-stream", pdf)));
  record("SEC-13/mime-spoof", ...(u => [u.confirm >= 400 && u.code !== "CLEAN" ? "PASS" : "FAIL", u])(await upload(caseId, grant, "photo.png", "image/png", pdf)));
  record("SEC-13/infected", ...(u => [u.confirm === 422 ? "PASS" : "FAIL", u])(await upload(caseId, grant, "eicar.pdf", "application/pdf", Buffer.from("%PDF-1.4\n" + eicar + "\n%%EOF\n"))));
  // Wrong grant cannot touch the draft.
  r = await call("POST", `/api/v1/cases/${caseId}/submit`, {}, { "x-case-grant": "not-the-grant" });
  record("UC-01/wrong-grant", r.status >= 400 && r.status < 500 ? "PASS" : "FAIL", { status: r.status, code: r.json?.code });
  const before = Date.now();
  r = await call("POST", `/api/v1/cases/${caseId}/submit`, {}, { "x-case-grant": grant });
  record("UC-01/submit", r.status === 200 ? "PASS" : "FAIL", { status: r.status, caseStatus: r.json?.status, ms: r.ms, rid: r.rid });
  const statusToken = r.json?.statusToken;
  r = await call("POST", `/api/v1/cases/${caseId}/submit`, {}, { "x-case-grant": grant });
  record("UC-01/duplicate-submit", r.status === 409 || r.status === 401 || r.status === 403 || r.status === 404 ? "PASS" : "FAIL", { status: r.status, code: r.json?.code });
  const mail = await waitMail(m => JSON.stringify(m).includes(caseNumber), before);
  record("UC-01/confirmation-delivered", mail ? "PASS" : "FAIL", { lagMs: mail?.lagMs, to: mail?.msg?.To?.map(t => t.Address) });

  if (statusToken) {
    // SEC-4: the URL alone shows no case.
    r = await call("POST", `/api/v1/public/cases/${statusToken}/view`, { grant: "forged" });
    record("SEC-4/no-grant", r.status >= 400 && r.status < 500 ? "PASS" : "FAIL", { status: r.status, code: r.json?.code });
    r = await call("GET", `/api/v1/public/cases/${statusToken}`);
    record("UC-02/summary", r.status === 200 && !JSON.stringify(r.json).includes(TAG) ? "PASS" : "FAIL", { status: r.status, keys: Object.keys(r.json ?? {}) });
    const otpSince = Date.now();
    r = await call("POST", `/api/v1/public/cases/${statusToken}/request-access`, { channel: "WHATSAPP" });
    record("UC-02/request-otp", r.status === 200 ? "PASS" : "FAIL", { status: r.status, hint: r.json?.destinationHint });
    const otpMail = await waitMail(m => /\b\d{6}\b/.test(m.Text ?? "") && (m.Text ?? "").length < 4000, otpSince);
    const code = otpMail?.msg?.Text?.match(/\b(\d{6})\b/)?.[1];
    record("UC-02/otp-delivered", code ? "PASS" : "FAIL", { lagMs: otpMail?.lagMs });
    // SEC-1: five wrong codes lock the challenge; the right one then fails too.
    const wrong = code === "000000" ? "111111" : "000000";
    const statuses = [];
    for (let i = 0; i < 5; i++) statuses.push((await call("POST", `/api/v1/public/cases/${statusToken}/verify`, { code: wrong })).status);
    r = await call("POST", `/api/v1/public/cases/${statusToken}/verify`, { code });
    record("SEC-1/lockout", r.status >= 400 ? "PASS" : "FAIL", { wrongStatuses: statuses, correctAfterLock: r.status, code: r.json?.code });
    // A fresh challenge, verified correctly, opens the status view (UC-02).
    const since2 = Date.now();
    await call("POST", `/api/v1/public/cases/${statusToken}/request-access`, { channel: "WHATSAPP" });
    const m2 = await waitMail(m => /\b\d{6}\b/.test(m.Text ?? ""), since2);
    const code2 = m2?.msg?.Text?.match(/\b(\d{6})\b/)?.[1];
    r = await call("POST", `/api/v1/public/cases/${statusToken}/verify`, { code: code2 });
    const viewGrant = r.json?.grant;
    record("UC-02/verify", r.status === 200 && viewGrant ? "PASS" : "FAIL", { status: r.status });
    if (viewGrant) {
      r = await call("POST", `/api/v1/public/cases/${statusToken}/view`, { grant: viewGrant });
      const body = JSON.stringify(r.json ?? {});
      record("UC-02/view", r.status === 200 ? "PASS" : "FAIL", { status: r.status, caseStatus: r.json?.status, ms: r.ms });
      record("SEC-10/no-internal-money", !/margin|netCost|profit/i.test(body) ? "PASS" : "FAIL", {});
      r = await call("POST", `/api/v1/public/cases/${statusToken}/verify`, { code: code2 });
      record("SEC-11/otp-replay", r.status >= 400 ? "PASS" : "FAIL", { status: r.status, code: r.json?.code });
    }
  }
  // SEC-5: recovery answers identically for a match and a non-match.
  const a = await call("POST", "/api/v1/public/cases/recover", { caseNumber, whatsappNumber: phone, language: "en" });
  const b = await call("POST", "/api/v1/public/cases/recover", { caseNumber: "RS-2026-999999", whatsappNumber: "+254711111111", language: "en" });
  record("SEC-5/no-enumeration", a.status === b.status && JSON.stringify(a.json?.message) === JSON.stringify(b.json?.message) ? "PASS" : "FAIL", { match: a.status, nonMatch: b.status, msMatch: a.ms, msNonMatch: b.ms });
}
console.log(JSON.stringify({ run: RUN, caseNumber, startedAt: new Date(started).toISOString(), results }, null, 1));
