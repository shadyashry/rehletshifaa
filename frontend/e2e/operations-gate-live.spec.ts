import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { expect, test, type APIRequestContext, type Browser, type Page } from "@playwright/test";

import { API, OIDC_AUTHORITY } from "./env";
import { STEP_UP_USERS, completeKeycloakSteps, preparePasskey, requestStepUp, submitKeycloakSignIn } from "./live-auth";

/**
 * The gate into TRAVEL_COORDINATION, proven over HTTP through the real path
 * (Cloudflare -> cloudflared -> API gateway -> backend) with real Keycloak tokens.
 *
 * The fixture is the business flow itself — no seeding endpoint, no SQL: a synthetic case is created
 * through public intake, taken through consultant review, proposal, the pre-release Operations
 * travel-package step and release, then acknowledged by the "patient" through the secure link and
 * one-time code. That is the only supported way an Operations assignment exists on an ACCEPTED case,
 * which is exactly the state under test. Patient-side messages (WhatsApp simulator and email) are read
 * from Mailpit, the dev stack's mail sink. Identities are the repo-seeded QA accounts.
 *
 * Then: Operations may draft a travel plan (data entry) but cannot move the stage; the deposit is
 * settled by Finance and the profile activated through the onboarding link; the case crosses into
 * TRAVEL_COORDINATION exactly once, and the previously refused arrival transition is now accepted.
 *
 * The synthetic case is left in place, named "Playwright Ops Gate", like the other live intake specs.
 *
 * Needs PORTAL_TEST_PASSWORD (coordinator), DOCTOR_TEST_PASSWORD, OPERATIONS_TEST_PASSWORD and
 * FINANCE_TEST_PASSWORD; MAILPIT_URL defaults to the dev stack's Mailpit.
 */
const PASSWORDS: Record<string, string | undefined> = {
  coordinator: process.env.PORTAL_TEST_PASSWORD, doctor: process.env.DOCTOR_TEST_PASSWORD,
  operations: process.env.OPERATIONS_TEST_PASSWORD, finance: process.env.FINANCE_TEST_PASSWORD,
};
const MAILPIT = (process.env.MAILPIT_URL ?? "https://mail-dev.rehletshifaa.com").replace(/\/+$/, "");
const SIMULATOR_INBOX = process.env.MAILPIT_LOCAL_INBOX ?? "patient@local.test";

test.skip(Object.values(PASSWORDS).some(p => !p), "PORTAL/DOCTOR/OPERATIONS/FINANCE_TEST_PASSWORD are required for the live gate check");
test.describe.configure({ mode: "serial" });

// ---------- identities ----------

type Session = { request: APIRequestContext; subject: string; token: string };

/** Signs the seeded account in through the real Keycloak flow and returns a bearer session for the API. */
async function signIn(browser: Browser, user: string): Promise<Session> {
  const context = await browser.newContext();
  const page = await context.newPage();
  // Finance confirms money with a passkey: registered once, then attached to this sign-in.
  const passkey = await preparePasskey(browser, page, user, PASSWORDS[user]!);
  // A consultant's clinical decision and Finance settling a deposit are step-up actions: sign in at LoA 2.
  if (STEP_UP_USERS.has(user)) await requestStepUp(page);
  await page.goto("/en/portal");
  await page.getByRole("button", { name: /Sign in securely/ }).click();
  await page.waitForURL(/\/realms\/rehletshifaa\/protocol\/openid-connect\/auth/, { timeout: 30000 });
  await submitKeycloakSignIn(page, user, PASSWORDS[user]!);
  await page.waitForURL(/\/en\/portal/, { timeout: 30000 });
  await passkey?.save(); // the signature counter moved
  const stored = await page.evaluate(key => sessionStorage.getItem(key), `oidc.user:${OIDC_AUTHORITY}:rehletshifaa-web`);
  const token = stored ? (JSON.parse(stored) as { access_token?: string }).access_token : undefined;
  expect(token, `a token for ${user}`).toBeTruthy();
  const subject = (JSON.parse(Buffer.from(token!.split(".")[1], "base64url").toString()) as { sub: string }).sub;
  await page.close();
  return { request: context.request, subject, token: token! };
}

async function call<T = unknown>(s: Session | null, method: string, path: string, body?: unknown, expected?: number, extraHeaders: Record<string,string> = {}): Promise<{ status: number; body: T }> {
  const res = await (s?.request ?? anonymous!).fetch(`${API}${path}`, {
    method, headers: { ...(s ? { Authorization: `Bearer ${s.token}` } : {}), "Content-Type": "application/json",...extraHeaders }, data: body,
  });
  const text = await res.text();
  const parsed = (text ? JSON.parse(text) : null) as T;
  if (expected !== undefined) expect(res.status(), `${method} ${path} -> ${text.slice(0, 300)}`).toBe(expected);
  return { status: res.status(), body: parsed };
}
let anonymous: APIRequestContext | null = null;

// ---------- Mailpit: the patient's side of the secure-link flows ----------

type MailHit = { ID: string; Created: string; Subject: string; To: { Address: string }[] };
async function latestMail(request: APIRequestContext, subject: string, since: number, to: string, bodyMatch: RegExp): Promise<string> {
  const deadline = Date.now() + 45000; // the outbox is polled every 5s
  while (Date.now() < deadline) {
    const list = await request.get(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`subject:"${subject}" to:"${to}"`)}&limit=20`);
    const hits = ((await list.json()) as { messages: MailHit[] }).messages ?? [];
    for (const hit of hits.filter(h => new Date(h.Created).getTime() >= since)) {
      const message = (await (await request.get(`${MAILPIT}/api/v1/message/${hit.ID}`)).json()) as { Text: string };
      const found = message.Text.match(bodyMatch);
      if (found) return found[1];
    }
    await new Promise(r => setTimeout(r, 1500));
  }
  throw new Error(`No "${subject}" message for ${to} matching ${bodyMatch} arrived in Mailpit`);
}

// ---------- the scenario ----------

type Workspace = { caseSummary: { status: string; version: number }; timeline: { status: string }[]; tasks: { type: string; status: string }[];
  clinicalReviews: { id: string; status: string }[]; proposal?: { versionId: string; status: string }; gates?: { financeRequired: boolean } | null;
  deposit?: { id: string; status: string; totalEgp: number; transfer?: { status: string } | null } | null; actions: { currentAction: { code: string; workType?: string | null } } };

type Gate = NonNullable<typeof arrived> & { deposit: { id: string; totalEgp: number } };

test("operations may draft before the gate, cannot advance the journey, and the gate opens exactly once", async ({ browser, request }) => {
  test.setTimeout(420000);
  arrived = await gateJourney(browser, request, true);
});

/**
 * The case through intake, review, proposal, acknowledgement, activation and the deposit into TRAVEL_COORDINATION; with
 * {@code arrive} the patient then arrives (ARRIVAL_CONFIRMED). Asserts the gate on the way.
 */
async function gateJourney(browser: Browser, request: APIRequestContext, arrive: boolean, largest = false): Promise<Gate> {
  anonymous = request;
  const stamp = Date.now();
  const email = `ops-gate-${stamp}@local.test`;
  const whatsapp = `+2547${String(stamp).slice(-8)}`;

  // --- Fixture: a synthetic case through the real journey ---------------------------------------
  const coordinator = await signIn(browser, "coordinator");
  const doctor = await signIn(browser, "doctor");
  const operations = await signIn(browser, "operations");
  const finance = await signIn(browser, "finance");

  const created = await call<{ caseId: string; caseNumber: string; intakeGrant: string }>(null, "POST", "/cases", {
    caseFor: "MYSELF", givenName: "Playwright", familyName: "Ops Gate", country: "Kenya", whatsappNumber: whatsapp, conditionDescription: "Synthetic case for the Operations gate check.",
    preferredLanguage: "en", consent: true, turnstileToken: null, ageBand: "AGE_18_64", email, timeZone: "Africa/Nairobi", careArea: "cardiology", travelPackageRequested: true,
  }, 201);
  const caseId = created.body.caseId;
  await call(null, "POST", `/cases/${caseId}/submit`, undefined, 200,{"X-Case-Grant":created.body.intakeGrant});
  const workspace = async (s: Session = coordinator, prefix = "coordinator") => (await call<Workspace>(s, "GET", `/${prefix}/cases/${caseId}`, undefined, 200)).body;

  // Intake is routed to an eligible coordinator on submit (locally, the seeded policy gives only this login capacity);
  // a claim is only the fallback for a case left waiting in the team queue.
  const owner = (await call<{ caseSummary: { id: string; coordinatorSubject?: string } }[]>(coordinator, "GET", "/coordinator/cases", undefined, 200))
    .body.find(c => c.caseSummary.id === caseId)?.caseSummary.coordinatorSubject;
  if (owner) expect(owner, "routed to the signed-in coordinator").toBe(coordinator.subject);
  else await call(coordinator, "POST", `/coordinator/cases/${caseId}/claim`, undefined, 200);
  expect((await workspace()).caseSummary.status).toBe("INTAKE_REVIEW");
  await call(coordinator, "PUT", `/coordinator/cases/${caseId}/travel-package`, { requested: true }, 200);

  const doctors = (await call<{ subject: string; careCategory?: string }[]>(coordinator, "GET", "/coordinator/doctors", undefined, 200)).body;
  expect(doctors.some(d => d.subject === doctor.subject && d.careCategory === "cardiology"), "the seeded doctor is a verified, available cardiology consultant").toBe(true);
  const doctorAssignment = await call<{ id: string }>(coordinator, "POST", `/coordinator/cases/${caseId}/assignments`,
    { assigneeSubject: doctor.subject, assigneeRole: "DOCTOR", assignmentType: "PRIMARY", pod: null, reason: "Clinical review" }, 200);
  await call(doctor, "POST", `/doctor/cases/${caseId}/assignments/${doctorAssignment.body.id}`, { accept: true }, 200);

  // Catalogue-priced when the consultant has a price list (no Finance step); otherwise manual pricing with Finance approval.
  const catalog = (await call<{ id: string; serviceName: string; priceEgp: number; active: boolean }[]>(doctor, "GET", "/doctor/catalog", undefined, 200)).body.filter(s => s.active && s.priceEgp > 0);
  // {@code largest}: the priciest service, so the deposit (at least USD 200, capped at the total) leaves a balance at the hospital.
  if (largest) catalog.sort((a, b) => b.priceEgp - a.priceEgp);
  const service = catalog[0] ?? { id: null, serviceName: "Diagnostic cardiology consultation", priceEgp: 3500 };
  await call(doctor, "POST", `/doctor/cases/${caseId}/review-decision`, {
    decision: "ACCEPT", recommendedTreatment: "Diagnostic consultation and imaging.", risksAndLimitations: "Standard procedural risks.",
    costEstimates: [{ serviceDescription: service.serviceName, estimatedCost: service.priceEgp, currency: "EGP", catalogServiceId: service.id }], proposalCurrency: "EGP",
  }, 200);

  const review = (await workspace()).clinicalReviews.find(r => r.status === "APPROVED")!;
  const proposal = await call<{ versionId: string }>(coordinator, "POST", `/coordinator/cases/${caseId}/proposals`, {
    clinicalReviewId: review.id, language: "en", operationalPlan: "", currency: "EGP", includedServices: service.serviceName, excludedServices: "None",
    paymentTerms: "Deposit", refundTerms: "Refund", disclaimers: "Not consent", validUntil: new Date(Date.now() + 14 * 86400000).toISOString(),
    items: [{ category: "MEDICAL", description: service.serviceName, quantity: 1, unitPrice: service.priceEgp, optional: false, sortOrder: 0 }], coordinatorNotes: null,
  }, 200);
  const versionId = proposal.body.versionId;

  // The pre-release travel-package step is the supported way Operations comes to hold an active assignment.
  const opsAssignment = await call<{ id: string }>(coordinator, "POST", `/coordinator/cases/${caseId}/assignments`,
    { assigneeSubject: operations.subject, assigneeRole: "OPERATIONS", assignmentType: "PRIMARY", pod: null, reason: "Travel package" }, 200);
  await call(operations, "POST", `/operations/cases/${caseId}/assignments/${opsAssignment.body.id}`, { accept: true }, 200);
  await call(operations, "POST", `/operations/cases/${caseId}/proposals/${versionId}/complete`, { plan: "Flights, visa support and airport reception." }, 200);
  if ((await workspace()).gates?.financeRequired) {
    const fin = await call<{ id: string }>(coordinator, "POST", `/coordinator/cases/${caseId}/assignments`,
      { assigneeSubject: finance.subject, assigneeRole: "FINANCE", assignmentType: "PRIMARY", pod: null, reason: "Commercial approval" }, 200);
    await call(finance, "POST", `/finance/cases/${caseId}/assignments/${fin.body.id}`, { accept: true }, 200);
    await call(finance, "POST", `/finance/cases/${caseId}/proposals/${versionId}/approve`, undefined, 200);
  }

  const releasedAt = Date.now() - 5000;
  await call(coordinator, "POST", `/coordinator/cases/${caseId}/proposals/${versionId}/release`, undefined, 200);
  expect((await workspace()).caseSummary.status).toBe("PATIENT_DECISION");

  // The patient: secure link (WhatsApp simulator), one-time code by email, acknowledgement.
  const proposalToken = await latestMail(request, "Your treatment proposal is ready", releasedAt, SIMULATOR_INBOX, new RegExp(`Destination: ${whatsapp.replace("+", "\\+")}[\\s\\S]*?/proposal/([0-9a-f]{64})`));
  const otpRequestedAt = Date.now() - 5000;
  await call(null, "POST", `/public/proposals/${proposalToken}/request-access`, { channel: "EMAIL" }, 200);
  const proposalCode = await latestMail(request, "Your RehletShifaa verification code", otpRequestedAt, email, /verification code is (\d{6})/);
  const grant = (await call<{ grant: string }>(null, "POST", `/public/proposals/${proposalToken}/verify`, { code: proposalCode }, 200)).body.grant;
  await call(null, "POST", `/public/proposals/${proposalToken}/decision`, { grant, decision: "ACKNOWLEDGED", comment: null, acknowledgementAccepted: true }, 200);

  let ws = await workspace();
  expect(ws.caseSummary.status).toBe("ACCEPTED");
  expect(ws.deposit?.status).toBe("REQUESTED");
  expect(ws.actions.currentAction.code).toBe("WAIT_PATIENT_READINESS");

  // --- Before the gate: drafting is data entry; the journey does not move -------------------------
  const draft = { plannedArrival: new Date(Date.now() + 21 * 86400000).toISOString(), confirmedArrival: null, visaStatus: "pending", flightDetails: "MS123",
    airportReception: null, accommodation: null, localTransport: null, companionDetails: null, facilityId: null, exceptions: null, status: "PLANNING" };
  await call(operations, "PUT", `/operations/cases/${caseId}/travel`, draft, 200);
  ws = await workspace();
  expect(ws.caseSummary.status, "a saved draft leaves the stage alone").toBe("ACCEPTED");
  expect(ws.timeline.filter(t => t.status === "TRAVEL_COORDINATION")).toHaveLength(0);

  const arrival = { ...draft, confirmedArrival: new Date().toISOString(), status: "ARRIVED" };
  const premature = await call<{ code: string }>(operations, "PUT", `/operations/cases/${caseId}/travel`, arrival);
  expect(premature.status, "advancing the journey from ACCEPTED is refused server-side").toBe(409);
  expect(premature.body.code).toBe("INVALID_CASE_TRANSITION");
  const commitment = await call<{ code: string }>(operations, "PUT", `/operations/cases/${caseId}/travel`, { ...draft, status: "CONFIRMED" });
  expect(commitment.status, "the non-cancellable commitment needs full readiness").toBe(409);
  expect((await workspace()).caseSummary.status).toBe("ACCEPTED");

  const forced = await call<{ code: string }>(coordinator, "POST", `/coordinator/cases/${caseId}/transition`, { targetStatus: "TRAVEL_COORDINATION", reason: "force", expectedVersion: ws.caseSummary.version });
  expect(forced.status).toBe(403);
  expect(forced.body.code).toBe("DEDICATED_OPERATION_REQUIRED");

  // --- The gate: profile activation through the onboarding link, then the deposit settled by Finance ----
  const onboardingToken = await latestMail(request, "Complete your RehletShifaa profile", releasedAt, SIMULATOR_INBOX, new RegExp(`Destination: ${whatsapp.replace("+", "\\+")}[\\s\\S]*?/activate/([0-9a-f]{64})`));
  const activationOtpAt = Date.now() - 5000;
  await call(null, "POST", `/public/onboarding/${onboardingToken}/request-access`, { channel: "EMAIL" }, 200);
  const activationCode = await latestMail(request, "Your RehletShifaa verification code", activationOtpAt, email, /verification code is (\d{6})/);
  const activationGrant = (await call<{ grant: string }>(null, "POST", `/public/onboarding/${onboardingToken}/verify`, { code: activationCode }, 200)).body.grant;
  const setupAt = Date.now() - 5000;
  await call(null, "POST", `/public/onboarding/${onboardingToken}/activate`, { grant: activationGrant, profile: {
    givenName: "Playwright", familyName: "Ops Gate", email, phone: whatsapp, mobileOwner: "PATIENT", dateOfBirth: "1990-01-01", nationality: "KE", countryOfResidence: "KE", preferredLanguage: "en", sex: "MALE",
    consents: ["PRIVACY_DATA_PROCESSING", "CROSS_BORDER_CARE", "DEPOSIT_CANCELLATION_TERMS"] } }, 200);
  // The account is active once the patient has set a password through the identity provider's email and signed in.
  const setupLink = await latestMail(request, "Finish setting up your RehletShifaa account", setupAt, email, /(https?:\/\/[^\s"<>]+login-actions\/action-token[^\s"<>]*)/);
  const patient: Page = await browser.newPage();
  await patient.goto(setupLink.replace(/&amp;/g, "&"));
  // The login theme names this button after the step it starts; its id is stable.
  await patient.locator("#kc-info-next").click();
  const password = `OpsGate-${stamp}-Aa1!`;
  await patient.locator("#password-new").fill(password);
  await patient.locator("#password-confirm").fill(password);
  await patient.locator("input[type=submit], button[type=submit]").first().click();
  await expect(patient.getByText(/Your account is ready/).first()).toBeVisible({ timeout: 30000 });
  await patient.locator("#kc-info-next").click();
  await patient.waitForURL(/\/realms\/rehletshifaa\/protocol\/openid-connect\/auth/, { timeout: 30000 });
  await patient.locator("#username").fill(email);
  await patient.locator("#password").fill(password);
  await patient.locator("#kc-login").click();
  await patient.waitForURL(new RegExp(`/en/portal\\?case=${caseId}`), { timeout: 30000 });
  await expect(patient.getByRole("heading", { level: 1, name: "My Care" })).toBeVisible({ timeout: 30000 });
  ws = await workspace();
  expect(ws.caseSummary.status, "the profile alone does not open the gate").toBe("ACCEPTED");
  // DEP-3: the patient enters the bank-transfer reference from My Care; Finance confirms the money against it.
  const patientToken = await patient.evaluate(key => (JSON.parse(sessionStorage.getItem(key) ?? "{}") as { access_token?: string }).access_token ?? "",
    `oidc.user:${OIDC_AUTHORITY}:rehletshifaa-web`);
  expect(patientToken, "a token for the patient").toBeTruthy();
  const patientSession: Session = { request: patient.context().request, subject: "", token: patientToken };
  await call(patientSession, "POST", `/patient/cases/${caseId}/deposit/transfer-reference`, { reference: `FT-${stamp}`, method: "BANK_TRANSFER" }, 200);
  await patient.close();
  ws = await workspace();
  expect(ws.caseSummary.status, "a reported transfer is not money received").toBe("ACCEPTED");
  expect(ws.deposit?.transfer?.status).toBe("SUBMITTED");

  const deposit = ws.deposit!;
  const receipt = { amountEgp: deposit.totalEgp, method: "BANK", providerReference: `e2e-${stamp}`, idempotencyKey: `ops-gate-${caseId}` };
  await call(finance, "POST", `/finance/cases/${caseId}/deposits/${deposit.id}/payments`, receipt, 200);

  // --- After the gate: crossed exactly once, and the same transition is now accepted -----------------
  ws = await workspace();
  expect(ws.caseSummary.status).toBe("TRAVEL_COORDINATION");
  const settled = () => Promise.all([workspace(), call<{ items: { eventType: string; caseId: string }[] }>(coordinator, "GET", "/notifications", undefined, 200)])
    .then(([w, n]) => ({ transitions: w.timeline.filter(t => t.status === "TRAVEL_COORDINATION").length, travelWork: w.tasks.filter(t => t.type === "TRAVEL").length,
      settledNotices: n.body.items.filter(i => i.eventType === "DEPOSIT_SETTLED" && i.caseId === caseId).length }));
  expect(await settled()).toEqual({ transitions: 1, travelWork: 1, settledNotices: 1 });

  // A replayed receipt (same idempotency key) and a repeated activation change nothing.
  await call(finance, "POST", `/finance/cases/${caseId}/deposits/${deposit.id}/payments`, receipt, 200);
  expect(await settled()).toEqual({ transitions: 1, travelWork: 1, settledNotices: 1 });

  const gate: Gate = { caseId, coordinator, doctor, operations, finance, email, whatsapp, stamp, service, password, workspace, deposit };
  if (!arrive) return gate;
  await call(operations, "PUT", `/operations/cases/${caseId}/travel`, arrival, 200);
  expect((await workspace()).caseSummary.status, "the arrival that was refused before the gate is accepted after it").toBe("ARRIVAL_CONFIRMED");
  return gate;
}

/** A patient's own sign-in (password only, as patients sign in) and their bearer session. */
async function patientSession(browser: Browser, email: string, password: string): Promise<Session> {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto("/en/portal");
  await page.getByRole("button", { name: /Sign in securely/ }).click();
  await page.waitForURL(url => url.toString().startsWith(OIDC_AUTHORITY), { timeout: 30000 });
  await page.locator("#username").fill(email);
  await page.locator("#password").fill(password);
  await page.locator("#kc-login").click();
  await page.waitForURL(/\/en\/portal/, { timeout: 30000 });
  const token = await page.evaluate(key => (JSON.parse(sessionStorage.getItem(key) ?? "{}") as { access_token?: string }).access_token ?? "",
    `oidc.user:${OIDC_AUTHORITY}:rehletshifaa-web`);
  expect(token, "a token for the patient").toBeTruthy();
  await page.close();
  return { request: context.request, subject: "", token };
}

test("a patient withdraws before travel is confirmed; Finance refunds the deposit in full, once", async ({ browser, request }) => {
  test.setTimeout(420000);
  const { caseId, finance, email, password, workspace, deposit, stamp } = await gateJourney(browser, request, false);
  // D-12: the patient decides with a fresh password sign-in (no second factor is asked of patients).
  const patient = await patientSession(browser, email, password);
  await call(patient, "POST", `/patient/cases/${caseId}/withdraw`, { note: "I have decided not to travel." }, 200);
  let ws = await workspace();
  expect(ws.caseSummary.status).toBe("CANCELLED");
  // A second withdrawal changes nothing.
  expect((await call(patient, "POST", `/patient/cases/${caseId}/withdraw`, { note: "again" })).status).toBe(409);

  const refund = { amountEgp: deposit.totalEgp, reasonCode: "PATIENT_CANCELLED", reason: "Withdrew before travel was confirmed", idempotencyKey: `refund-${stamp}` };
  const tooMuch = await call<{ code: string }>(finance, "POST", `/finance/cases/${caseId}/deposits/${deposit.id}/refunds`, { ...refund, amountEgp: deposit.totalEgp + 1, idempotencyKey: `over-${stamp}` });
  expect(tooMuch.status, "never more than was received").toBeGreaterThanOrEqual(400);
  await call(finance, "POST", `/finance/cases/${caseId}/deposits/${deposit.id}/refunds`, refund, 200);
  // A replay records nothing: once the full refund closes Finance's refund work it is refused (403) rather than answered (D-14, low).
  expect([200, 403]).toContain((await call(finance, "POST", `/finance/cases/${caseId}/deposits/${deposit.id}/refunds`, refund)).status);
  ws = await workspace();
  expect(ws.deposit?.status).toBe("REFUNDED");
  const ledger = (await call<{ events: { eventType: string }[] }>(finance, "GET", `/finance/cases/${caseId}/deposit`, undefined)).body;
  if (ledger?.events) expect(ledger.events.filter(e => e.eventType === "REFUND_RECORDED"), "one refund in the ledger").toHaveLength(1);
});

// ---------- after arrival: final quote, admission, treatment, discharge, settlement, follow-up ----------

let arrived: { caseId: string; coordinator: Session; doctor: Session; operations: Session; finance: Session; email: string; whatsapp: string;
  stamp: number; service: { id: string | null; serviceName: string; priceEgp: number }; password: string; workspace: () => Promise<Workspace> } | null = null;

const PDF = Buffer.from("%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n");

/** D-10: the case team files paperwork as a case document (presign, put, confirm: inspected like the patient's). */
async function staffDocument(s: Session, caseId: string, name: string): Promise<string> {
  const presign = (await call<{ documentId: string; uploadUrl: string; requiredHeaders: Record<string, string> }>(s, "POST", `/work/cases/${caseId}/documents/presign`,
    { originalFileName: name, contentType: "application/pdf", sizeBytes: PDF.length }, 201)).body;
  const headers = Object.fromEntries(Object.entries(presign.requiredHeaders).filter(([k]) => !["host", "content-length"].includes(k.toLowerCase())));
  const put = await s.request.fetch(presign.uploadUrl, { method: "PUT", headers, data: PDF });
  expect(put.status(), `${name} reaches object storage`).toBe(200);
  expect((await call<{ status: string }>(s, "POST", `/work/cases/${caseId}/documents/confirm`, { documentId: presign.documentId }, 200)).body.status).toBe("CLEAN");
  return presign.documentId;
}

/** An invited QA identity (no password in the repo) sets its password through "Forgot your password?" and Mailpit, once. */
async function activateInvited(browser: Browser, request: APIRequestContext, user: string): Promise<string> {
  const saved = join(__dirname, "..", ".e2e", "mfa", `${user}.password`);
  if (existsSync(saved)) return readFileSync(saved, "utf8").trim();
  const password = `Qa-${Date.now()}-Aa1!`;
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto("/en/portal");
  await page.getByRole("button", { name: /Sign in securely/ }).click();
  await page.waitForURL(url => url.toString().startsWith(OIDC_AUTHORITY), { timeout: 30000 });
  await page.locator('a[href*="reset-credentials"]').click();
  await page.locator("#username").fill(user);
  const since = Date.now() - 5000;
  await page.locator('#kc-reset-password-form [type="submit"]').first().click();
  const link = await latestMail(request, "Reset your RehletShifaa password", since, `${user}@local.test`, /(https?:\/\/[^\s"<>]+login-actions\/action-token[^\s"<>]*)/);
  await page.goto(link.replace(/&amp;/g, "&"));
  // A staff account enrols its authenticator first, then sets the password (the reset link carries both steps).
  await completeKeycloakSteps(page, user, password);
  await context.close();
  mkdirSync(dirname(saved), { recursive: true });
  writeFileSync(saved, password);
  return password;
}

type Evidence = { id: string; kind: string; superseded?: boolean };
type Admission = { voucher?: { patientPaysAtFacilityEgp: number; feeBalanceEgp: number } | null; evidence: Evidence[] };
const latestEvidence = (view: { evidence: Evidence[] }, kind: string) => view.evidence.filter(e => e.kind === kind && !e.superseded).at(-1)!.id;

/**
 * From ARRIVAL_CONFIRMED to consent: a facility (Consultant Operations, an invited QA identity activated through the reset
 * email), the final assessment and quote at the estimate's price, the hospital's letter checked by Finance, the patient's
 * acceptance through the secure link, and the Consultant's procedure consent.
 */
/** To the procedure consent; more than one line of the service is a wider scope the Consultant found on examination. */
async function toConsent(browser: Browser, request: APIRequestContext, g: Gate, lines = 1) {
  const { caseId, coordinator, doctor, operations, finance, stamp, service, whatsapp, email } = g;
  const price = service.priceEgp * lines;
  // --- A facility, from Consultant Operations (an invited QA identity, activated through the reset email) ---
  PASSWORDS["consultant-operations-manager"] = await activateInvited(browser, request, "consultant-operations-manager");
  const com = await signIn(browser, "consultant-operations-manager");
  await call(com, "POST", "/me/activation", undefined);
  const facility = (await call<{ id: string; status: string }>(com, "POST", "/admin/facilities", { name: `QA Heart Hospital ${stamp}`, city: "Cairo", kind: "HOSPITAL",
    settlementTerms: "NET_30", settlementNotes: null, contactName: "Admissions desk", contactEmail: "admissions@hospital.test", contactPhone: null }, 200)).body;
  if (facility.status !== "ACTIVE") await call(com, "PUT", `/admin/facilities/${facility.id}/status`, { status: "ACTIVE" }, 200);

  // --- The Consultant examines the patient; the coordinator issues the final quote at the same price ---
  const finalReview = (await call<{ id: string }>(doctor, "POST", `/doctor/cases/${caseId}/final-assessment`, { recommendedTreatment: "Scope confirmed on examination",
    risksAndLimitations: "Standard risks", costEstimates: Array.from({ length: lines }, () => ({ serviceDescription: service.serviceName, estimatedCost: service.priceEgp, currency: "EGP",
      catalogServiceId: service.id })) }, 200)).body.id;
  const quote = (await call<{ versionId: string }>(coordinator, "POST", `/coordinator/cases/${caseId}/final-quotes`, { clinicalReviewId: finalReview, currency: "EGP",
    scopeChangeReason: price === service.priceEgp ? null : "A second lesion found on examination", excludedServices: "None", paymentTerms: "The balance is paid at the hospital", refundTerms: "As in the deposit terms", disclaimers: "Final quote",
    validUntil: null, coordinatorNotes: null }, 200)).body.versionId;
  const quoteReleasedAt = Date.now() - 5000;
  await call(coordinator, "POST", `/coordinator/cases/${caseId}/final-quotes/${quote}/release`, undefined, 200);

  // --- Operations reserves the hospital and files its letter; Finance checks it (before the patient accepts, as in practice) ---
  await call(operations, "POST", `/operations/cases/${caseId}/admission`, { facilityId: facility.id, plannedAdmissionAt: new Date(Date.now() + 2 * 86400000).toISOString() }, 200);
  const letterDoc = await staffDocument(operations, caseId, "admission-letter.pdf");
  const lettered = (await call<Admission>(operations, "POST", `/operations/cases/${caseId}/admission/letter`, { documentId: letterDoc, quotedPackageEgp: price, reference: `PF-${stamp}` }, 200)).body;
  await call(finance, "POST", `/finance/cases/${caseId}/admission/letter/decision`, { evidenceId: latestEvidence(lettered, "FACILITY_ADMISSION_LETTER"), decision: "ACCEPT",
    note: price === service.priceEgp ? null : "The wider scope the Consultant found; the hospital's price matches the final quote" }, 200);

  // --- The patient accepts the final quote through the secure link and a one-time code ---
  const quoteToken = await latestMail(request, "Your final quote is ready", quoteReleasedAt, SIMULATOR_INBOX, new RegExp(`Destination: ${whatsapp.replace("+", "\\+")}[\\s\\S]*?/proposal/([0-9a-f]{64})`));
  const codeAt = Date.now() - 5000;
  await call(null, "POST", `/public/proposals/${quoteToken}/request-access`, { channel: "EMAIL" }, 200);
  const code = await latestMail(request, "Your RehletShifaa verification code", codeAt, email, /verification code is (\d{6})/);
  const grant = (await call<{ grant: string }>(null, "POST", `/public/proposals/${quoteToken}/verify`, { code }, 200)).body.grant;
  await call(null, "POST", `/public/proposals/${quoteToken}/decision`, { grant, decision: "ACCEPTED", comment: null, acknowledgementAccepted: true }, 200);

  // --- Consent, the hospital balance (countersigned by Finance), the fee balance, the admission number ---
  await call(doctor, "POST", `/doctor/cases/${caseId}/consent`, { exactText: "Explained in person; I consent to the procedure.", language: "en", policyVersion: "v1",
    relatedProposalVersionId: null, evidenceDocumentId: null, evidenceReference: `Hospital consent #${stamp}` }, 200);
  return { facilityId: facility.id };
}

test("after arrival: the final quote, the admission, treatment, discharge, settlement and follow-up", async ({ browser, request }) => {
  test.setTimeout(600000);
  test.skip(!arrived, "runs after the gate scenario");
  anonymous = request;
  const { caseId, doctor, operations, finance, coordinator, stamp, service, email, password, workspace } = arrived!;
  const status = async () => (await workspace()).caseSummary.status;
  await toConsent(browser, request, { ...(arrived as Gate) });

  let admission = (await call<Admission>(operations, "GET", `/operations/cases/${caseId}/admission`, undefined, 200)).body;
  expect(admission.voucher, "the voucher is issued once the letter is checked and the final quote accepted").toBeTruthy();
  const due = admission.voucher!.patientPaysAtFacilityEgp;
  if (due > 0) {
    const receiptDoc = await staffDocument(operations, caseId, "cashier-receipt.pdf");
    admission = (await call<Admission>(operations, "POST", `/operations/cases/${caseId}/admission/balance`, { receiptNumber: `RCPT-${stamp}`, amountEgp: due,
      paidAt: new Date(Date.now() - 600000).toISOString(), method: "CARD", documentId: receiptDoc, paidCurrency: "EGP", paidAmount: due }, 200)).body;
    await call(finance, "POST", `/finance/cases/${caseId}/evidence/${latestEvidence(admission, "BALANCE_EVIDENCED")}/countersign`, undefined, 200);
  }
  if (admission.voucher!.feeBalanceEgp > 0)
    await call(finance, "POST", `/finance/cases/${caseId}/admission/fee-balance`, { reference: `FEE-${stamp}`, amountEgp: admission.voucher!.feeBalanceEgp, receivedAt: new Date().toISOString() }, 200);
  expect(await status(), "consent, the quote and the money are in").toBe("ADMISSION_READY");
  await call(operations, "POST", `/operations/cases/${caseId}/admission/number`, { admissionNumber: `ADM-${stamp}` }, 200);
  expect(await status()).toBe("TREATMENT_IN_PROGRESS");

  // --- A change order: the Consultant proposes one more night, Finance prices it, the patient accepts it in My Care ---
  type Treatment = { changeOrders: { id: string; status: string; lines: { id: string }[] }[] };
  const proposed = (await call<Treatment>(doctor, "POST", `/doctor/cases/${caseId}/change-orders`, { reason: "Observation after a long procedure",
    lines: [{ kind: "EXTRA_NIGHT", description: "One more night on the ward", quantity: 1 }] }, 200)).body.changeOrders.at(-1)!;
  await call(finance, "POST", `/finance/cases/${caseId}/change-orders/${proposed.id}/price`, { lines: proposed.lines.map(l => ({ lineId: l.id, unitEgp: 4000 })) }, 200);
  const patient = await patientSession(browser, email, password);
  const decided = (await call<{ changeOrders: { id: string; status: string }[] }>(patient, "POST", `/patient/cases/${caseId}/change-orders/${proposed.id}/decision`,
    { decision: "ACCEPT", note: null }, 200)).body;
  expect(decided.changeOrders.find(o => o.id === proposed.id)?.status, "the patient's acceptance is recorded").toMatch(/ACCEPTED/);

  // --- A complication, the patient's concern, and the Care Coordination Manager resolving both incidents ---
  await call(doctor, "POST", `/doctor/cases/${caseId}/milestones`, { kind: "COMPLICATION", occurredAt: new Date(Date.now() - 20 * 60000).toISOString(),
    complicationSummary: "Minor bleeding at the access site, controlled with pressure", complicationSeverity: "LOW" }, 200);
  await call(patient, "POST", `/patient/cases/${caseId}/concerns`, { type: "COMPLAINT", summary: "Nobody told me about the extra night." }, 200);
  PASSWORDS["care-manager"] = await activateInvited(browser, request, "care-manager");
  const manager = await signIn(browser, "care-manager");
  await call(manager, "POST", "/me/activation", undefined);
  const incidents = (await call<{ id: string; status: string }[]>(manager, "GET", `/incidents/cases/${caseId}`, undefined, 200)).body;
  expect(incidents.length, "the concern (and any complication incident) reaches the manager").toBeGreaterThan(0);
  for (const incident of incidents.filter(i => i.status !== "RESOLVED")) {
    await call(manager, "POST", `/incidents/${incident.id}/assign`, { ownerSubject: manager.subject }, 200);
    await call(manager, "POST", `/incidents/${incident.id}/review`, undefined, 200);
    await call(manager, "POST", `/incidents/${incident.id}/resolve`, { resolution: "EXPLAINED_TO_PATIENT", note: "Explained the extra night and the bleeding." }, 200);
  }
  expect((await call<{ status: string }[]>(manager, "GET", `/incidents/cases/${caseId}`, undefined, 200)).body.every(i => i.status === "RESOLVED")).toBe(true);

  // --- Treatment milestones, the discharge pack, the follow-up plan and the hospital's final invoice ---
  const at = (minutesAgo: number) => new Date(Date.now() - minutesAgo * 60000).toISOString();
  const operativeNote = await staffDocument(doctor, caseId, "operative-note.pdf");
  await call(doctor, "POST", `/doctor/cases/${caseId}/milestones`, { kind: "PROCEDURE_STARTED", occurredAt: at(60) }, 200);
  await call(doctor, "POST", `/doctor/cases/${caseId}/milestones`, { kind: "PROCEDURE_COMPLETED", occurredAt: at(30), documentId: operativeNote,
    operativeNoteReference: `OP-${stamp}`, implants: "Drug-eluting stent x1" }, 200);
  await call(doctor, "POST", `/doctor/cases/${caseId}/milestones`, { kind: "DISCHARGE_PLANNED", occurredAt: at(1),
    plannedDischargeOn: new Date(Date.now() + 86400000).toISOString().slice(0, 10) }, 200);
  const pack = (kind: string, extra: Record<string, unknown>) => staffDocument(doctor, caseId, `${kind.toLowerCase()}.pdf`)
    .then(documentId => call(doctor, "POST", `/doctor/cases/${caseId}/discharge/pack`, { kind, documentId, ...extra }, 200));
  await pack("DISCHARGE_SUMMARY", { diagnosis: "Single-vessel coronary artery disease", procedures: "Angioplasty with one stent", pendingResults: "Lipid panel",
    warningSigns: "Chest pain, shortness of breath or bleeding at the wrist" });
  await pack("MEDICATION_LIST", { medications: [{ name: "Clopidogrel", dose: "75 mg", frequency: "once a day", duration: "12 months" }] });
  await pack("IMPLANT_RECORD", { implants: [{ description: "Drug-eluting coronary stent 3.0 x 18 mm", manufacturer: "Example Medical", reference: "LOT-4411" }] });
  await call(doctor, "POST", `/doctor/cases/${caseId}/follow-ups`, { practitionerId: null, dueAt: new Date(Date.now() + 14 * 86400000).toISOString(), mode: "VIDEO",
    requiredTests: "ECG", instructions: "Rest for a week" }, 200);
  const invoiceDoc = await staffDocument(operations, caseId, "final-invoice.pdf");
  await call(operations, "POST", `/operations/cases/${caseId}/discharge/final-invoice`, { documentId: invoiceDoc, invoiceNumber: `INV-${stamp}`, amountEgp: service.priceEgp,
    issuedAt: at(10), replaces: null }, 200);
  expect(await status(), "the pack, the plan and the final invoice discharge the patient").toBe("DISCHARGED");

  // --- Going home: a ground return, then the departure ---
  await call(operations, "POST", `/operations/cases/${caseId}/discharge/return`, { mode: "GROUND", departureAt: new Date(Date.now() + 3600000).toISOString(), reference: `CAR-${stamp}` }, 200);
  await call(operations, "POST", `/operations/cases/${caseId}/discharge/departure`, { departedAt: new Date().toISOString() }, 200);

  // --- Finance reconciles the hospital's invoice against what was authorised ---
  await call(finance, "POST", `/finance/cases/${caseId}/reconciliation`, undefined, 200);
  const reconciled = (await call<{ status: string }>(finance, "POST", `/finance/cases/${caseId}/reconciliation/submit`, { lines: [{ description: service.serviceName,
    invoiceEgp: service.priceEgp, source: "PACKAGE", matchedId: null, code: null }], paidAtFacilityEgp: due, note: null }, 200)).body;
  expect(reconciled.status).toBeTruthy();

  // --- Follow-up: the plan's contact is booked; a check-in is refused before its day (the window is days long, so the rest is
  // time-gated: the scheduled steps are covered by FollowUpServiceTest with a moved clock) ---
  const followUp = (await call<{ contacts: { id: string; status: string }[]; checkIns?: { point: string; status: string }[] }>(
    coordinator, "GET", `/coordinator/cases/${caseId}/follow-up`, undefined, 200)).body;
  expect(followUp.contacts.length, "the follow-up plan became a contact").toBeGreaterThan(0);
  const checkIn = followUp.checkIns?.find(c => c.status !== "DONE");
  if (checkIn) {
    const early = await call<{ code: string }>(coordinator, "POST", `/coordinator/cases/${caseId}/follow-up/check-ins/${checkIn.point}`, { outcome: "REACHED", note: "Recovering well" });
    expect(early.status, "a check-in before its day is refused").toBe(409);
    expect(early.body.code).toBe("CHECK_IN_NOT_DUE");
  }
  expect(["DISCHARGED", "FOLLOW_UP"]).toContain(await status());
});

test("an emergency admission stands in for the hospital balance and leaves Finance a review", async ({ browser, request }) => {
  test.setTimeout(600000);
  const gate = await gateJourney(browser, request, true, true);
  await toConsent(browser, request, gate);
  const { caseId, doctor, operations, finance, workspace, stamp } = gate;
  const before = (await call<Admission>(operations, "GET", `/operations/cases/${caseId}/admission`, undefined, 200)).body;
  expect({ status: (await workspace()).caseSummary.status, due: before.voucher?.patientPaysAtFacilityEgp }, "arrived, not yet cleared: the balance is still due")
    .toMatchObject({ status: "ARRIVAL_CONFIRMED" });
  const refused = await call<{ code: string }>(operations, "POST", `/doctor/cases/${caseId}/emergency-admission`, { reason: "Bleeding" });
  expect(refused.status, "Operations cannot record a clinical emergency").toBe(403);
  await call(doctor, "POST", `/doctor/cases/${caseId}/emergency-admission`, { reason: "Acute bleeding: admitted before the cashier opened" }, 200);
  expect((await workspace()).caseSummary.status, "consent and the quote are on file; the override stands in for the balance").toBe("ADMISSION_READY");
  // Two working days (SlaPolicy); the queue raises it to HIGH as the due date nears.
  const financeWork = (await call<{ caseId: string; type: string; status: string; dueAt: string | null }[]>(finance, "GET", "/work/mine", undefined, 200)).body;
  const review = financeWork.find(w => w.caseId === caseId && w.type === "EMERGENCY_ADMISSION_REVIEW");
  expect(review, "Finance reviews the money afterwards").toMatchObject({ status: "OPEN" });
  expect(Date.parse(review!.dueAt!), "with a service level").toBeGreaterThan(Date.now());
  await call(operations, "POST", `/operations/cases/${caseId}/admission/number`, { admissionNumber: `ADM-E-${stamp}` }, 200);
  expect((await workspace()).caseSummary.status).toBe("TREATMENT_IN_PROGRESS");
});

// ---------- coordination: two teams (UC-20) and a coordinator who leaves (UC-18) ----------

const TEAM_A = "00000000-0000-0000-0000-00000000c001", TEAM_B = "00000000-0000-0000-0000-00000000c002";
type Facts = { owner?: string | null; revision: number };

/** An orthopedics case through public intake; the policy in force routes it to Team A, which serves every area. */
async function orthopedicsCase(stamp: number) {
  const created = await call<{ caseId: string; intakeGrant: string }>(null, "POST", "/cases", { caseFor: "MYSELF", givenName: "Playwright", familyName: "Two Teams",
    country: "Kenya", whatsappNumber: `+2547${String(stamp).slice(-8)}`, conditionDescription: "Knee pain for a two-team check.", preferredLanguage: "en", consent: true,
    turnstileToken: null, ageBand: "AGE_18_64", email: `two-teams-${stamp}@local.test`, timeZone: "Africa/Nairobi", careArea: "orthopedics", travelPackageRequested: false }, 201);
  await call(null, "POST", `/cases/${created.body.caseId}/submit`, undefined, 200, { "X-Case-Grant": created.body.intakeGrant });
  return created.body.caseId;
}

test("two teams: a case in Team B is closed to Team A, the manager moves it with a reason, and a departing coordinator's cases are routed again", async ({ browser, request }) => {
  test.setTimeout(600000);
  anonymous = request;
  const stamp = Date.now();
  for (const user of ["care-manager", "coordinator-scope"]) PASSWORDS[user] = await activateInvited(browser, request, user);
  const manager = await signIn(browser, "care-manager");
  await call(manager, "POST", "/me/activation", undefined);
  const scope = await signIn(browser, "coordinator-scope");
  await call(scope, "POST", "/me/activation", undefined);
  const lead = await signIn(browser, "coordinator");
  const facts = async (caseId: string) => (await call<Facts>(manager, "GET", `/admin/coordination/cases/${caseId}`, undefined, 200)).body;
  const opens = async (s: Session, caseId: string) => (await call(s, "GET", `/coordinator/cases/${caseId}`)).status;

  // Team B serves orthopedics and its coordinator is on duty.
  const teamB = (await call<{ id: string; revision: number }[]>(manager, "GET", "/admin/coordination/teams", undefined, 200)).body.find(t => t.id === TEAM_B)!;
  await call(manager, "PUT", `/admin/coordination/teams/${TEAM_B}/profile`, { profile: { careAreas: ["orthopedics"], languages: ["en", "ar"], fallbackTeam: null },
    revision: teamB.revision, reason: "Two-team check" }, 200);
  const held = (await call<{ subject: string; revision: number }[]>(manager, "GET", "/admin/coordination/capacity", undefined, 200)).body.find(c => c.subject === scope.subject);
  await call(manager, "PUT", "/admin/coordination/capacity", { capacity: { subject: scope.subject, maximum: 100, onDuty: true, languages: ["en", "ar"], careAreas: [],
    revision: held ? held.revision : -1 }, reason: "Two-team check" }, 200);

  // The manager hands the case to Team B: from then on only Team B's coordinator holds it.
  const caseId = await orthopedicsCase(stamp);
  await call(manager, "POST", `/admin/coordination/cases/${caseId}/commands`, { key: `to-b-${stamp}`, revision: (await facts(caseId)).revision, action: "REASSIGN",
    target: scope.subject, team: TEAM_B, reason: "Orthopedics belongs to Team B", source: "MANUAL" }, 200);
  expect((await facts(caseId)).owner).toBe(scope.subject);
  expect(await opens(scope, caseId), "Team B's coordinator opens it").toBe(200);
  expect([403, 404], "Team A's lead cannot open it").toContain(await opens(lead, caseId));
  const leadMove = await call(lead, "POST", `/coordinator/cases/${caseId}/coordinator-assignment`, { assigneeSubject: lead.subject, reason: "Taking it back" });
  expect(leadMove.status, "nor move it to themself").toBeGreaterThanOrEqual(400);

  // The manager moves it back to Team A with a reason; Team B no longer holds it, and the move is on the record.
  await call(manager, "POST", `/admin/coordination/cases/${caseId}/commands`, { key: `to-a-${stamp}`, revision: (await facts(caseId)).revision, action: "REASSIGN",
    target: lead.subject, team: TEAM_A, reason: "Rebalancing between teams", source: "MANUAL" }, 200);
  expect(await opens(lead, caseId)).toBe(200);
  expect([403, 404], "Team B no longer holds it").toContain(await opens(scope, caseId));
  const history = (await call<{ reason?: string | null; selectedOwner?: string | null }[]>(manager, "GET", `/admin/coordination/cases/${caseId}/history`, undefined, 200)).body;
  expect(history.some(h => h.reason === "Rebalancing between teams" && h.selectedOwner === lead.subject), "the move is recorded with its reason").toBe(true);

  // A coordinator who leaves (UC-18): Team B's coordinator owns a second case, then their sign-in is disabled.
  const second = await orthopedicsCase(stamp + 1);
  await call(manager, "POST", `/admin/coordination/cases/${second}/commands`, { key: `second-${stamp}`, revision: (await facts(second)).revision, action: "REASSIGN",
    target: scope.subject, team: TEAM_B, reason: "Orthopedics belongs to Team B", source: "MANUAL" }, 200);
  PASSWORDS["credential-admin"] = process.env.ADMIN_TEST_PASSWORD;
  const admin = await signIn(browser, "credential-admin");
  const person = (await call<{ people: { subject: string; revision: number }[] }>(admin, "GET", "/admin/platform-access/staff", undefined, 200)).body.people
    .find(p => p.subject === scope.subject)!;
  await call(admin, "POST", `/admin/platform-access/staff/${scope.subject}/disable`, { revision: person.revision, reason: "Left the company" }, 200);
  expect((await facts(second)).owner, "the departed coordinator's case is routed again, never left with them").not.toBe(scope.subject);
  expect(await opens(scope, second), "the departed coordinator reaches nothing").toBeGreaterThanOrEqual(401);

  // Restoring the sign-in does not move cases back (the run can be repeated).
  const restored = (await call<{ people: { subject: string; revision: number }[] }>(admin, "GET", "/admin/platform-access/staff", undefined, 200)).body.people
    .find(p => p.subject === scope.subject)!;
  await call(admin, "POST", `/admin/platform-access/staff/${scope.subject}/restore`, { revision: restored.revision, reason: "Two-team check finished" }, 200);
  expect((await facts(second)).owner, "restoring does not hand the case back").not.toBe(scope.subject);
});
