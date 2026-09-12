import { expect, test, type APIRequestContext, type Browser } from "@playwright/test";

import { API, OIDC_AUTHORITY } from "./env";

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
  await page.goto("/en/portal");
  await page.getByRole("button", { name: /Sign in securely/ }).click();
  await page.waitForURL(/\/realms\/rehletshifaa\/protocol\/openid-connect\/auth/, { timeout: 30000 });
  await page.locator("#username").fill(user);
  await page.locator("#password").fill(PASSWORDS[user]!);
  await page.locator("#kc-login").click();
  await page.waitForURL(/\/en\/portal/, { timeout: 30000 });
  const stored = await page.evaluate(key => sessionStorage.getItem(key), `oidc.user:${OIDC_AUTHORITY}:rehletshifaa-web`);
  const token = stored ? (JSON.parse(stored) as { access_token?: string }).access_token : undefined;
  expect(token, `a token for ${user}`).toBeTruthy();
  const subject = (JSON.parse(Buffer.from(token!.split(".")[1], "base64url").toString()) as { sub: string }).sub;
  await page.close();
  return { request: context.request, subject, token: token! };
}

async function call<T = unknown>(s: Session | null, method: string, path: string, body?: unknown, expected?: number): Promise<{ status: number; body: T }> {
  const res = await (s?.request ?? anonymous!).fetch(`${API}${path}`, {
    method, headers: { ...(s ? { Authorization: `Bearer ${s.token}` } : {}), "Content-Type": "application/json" }, data: body,
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
  deposit?: { id: string; status: string; totalEgp: number } | null; actions: { currentAction: { code: string; workType?: string | null } } };

test("operations may draft before the gate, cannot advance the journey, and the gate opens exactly once", async ({ browser, request }) => {
  test.setTimeout(420000);
  anonymous = request;
  const stamp = Date.now();
  const email = `ops-gate-${stamp}@local.test`;
  const whatsapp = `+2547${String(stamp).slice(-8)}`;

  // --- Fixture: a synthetic case through the real journey ---------------------------------------
  const coordinator = await signIn(browser, "coordinator");
  const doctor = await signIn(browser, "doctor");
  const operations = await signIn(browser, "operations");
  const finance = await signIn(browser, "finance");

  const created = await call<{ caseId: string; caseNumber: string }>(null, "POST", "/cases", {
    caseFor: "MYSELF", givenName: "Playwright", familyName: "Ops Gate", country: "Kenya", whatsappNumber: whatsapp, conditionDescription: "Synthetic case for the Operations gate check.",
    preferredLanguage: "en", consent: true, turnstileToken: null, email, timeZone: "Africa/Nairobi", careArea: "cardiology", travelPackageRequested: true,
  }, 201);
  const caseId = created.body.caseId;
  await call(null, "POST", `/cases/${caseId}/submit`, undefined, 200);
  const workspace = async (s: Session = coordinator, prefix = "coordinator") => (await call<Workspace>(s, "GET", `/${prefix}/cases/${caseId}`, undefined, 200)).body;

  await call(coordinator, "POST", `/coordinator/cases/${caseId}/claim`, undefined, 200);
  expect((await workspace()).caseSummary.status).toBe("INTAKE_REVIEW");
  await call(coordinator, "PUT", `/coordinator/cases/${caseId}/travel-package`, { requested: true }, 200);

  const doctors = (await call<{ subject: string; careCategory?: string }[]>(coordinator, "GET", "/coordinator/doctors", undefined, 200)).body;
  expect(doctors.some(d => d.subject === doctor.subject && d.careCategory === "cardiology"), "the seeded doctor is a verified, available cardiology consultant").toBe(true);
  const doctorAssignment = await call<{ id: string }>(coordinator, "POST", `/coordinator/cases/${caseId}/assignments`,
    { assigneeSubject: doctor.subject, assigneeRole: "DOCTOR", assignmentType: "PRIMARY", pod: null, reason: "Clinical review" }, 200);
  await call(doctor, "POST", `/doctor/cases/${caseId}/assignments/${doctorAssignment.body.id}`, { accept: true }, 200);

  // Catalogue-priced when the consultant has a price list (no Finance step); otherwise manual pricing with Finance approval.
  const catalog = (await call<{ id: string; serviceName: string; priceEgp: number; active: boolean }[]>(doctor, "GET", "/doctor/catalog", undefined, 200)).body.filter(s => s.active);
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
    airportReception: null, accommodation: null, localTransport: null, companionDetails: null, facility: "Cairo Heart Centre", exceptions: null, status: "PLANNING" };
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
  await call(null, "POST", `/public/onboarding/${onboardingToken}/activate`, { grant: activationGrant, profile: {
    givenName: "Playwright", familyName: "Ops Gate", email, phone: whatsapp, mobileOwner: "PATIENT", dateOfBirth: "1990-01-01", nationality: "KE", countryOfResidence: "KE", preferredLanguage: "en", sex: "MALE",
    consents: ["PRIVACY_DATA_PROCESSING", "CROSS_BORDER_CARE", "DEPOSIT_CANCELLATION_TERMS"] } }, 200);
  ws = await workspace();
  expect(ws.caseSummary.status, "the profile alone does not open the gate").toBe("ACCEPTED");
  expect(ws.actions.currentAction.workType).toBe("DEPOSIT_ARRANGEMENT");

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

  await call(operations, "PUT", `/operations/cases/${caseId}/travel`, arrival, 200);
  expect((await workspace()).caseSummary.status, "the arrival that was refused before the gate is accepted after it").toBe("ARRIVAL_CONFIRMED");
});
