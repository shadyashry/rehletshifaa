import { expect, test, type APIRequestContext, type Browser, type Page } from "@playwright/test";

import { API, OIDC_AUTHORITY } from "./env";

/**
 * UAT defect-correction walkthrough over the real stack (Cloudflare -> gateway -> backend, real Keycloak,
 * Mailpit as the mail sink): a new case -> team queue -> ownership -> consultant assignment -> clinical
 * recommendation in USD -> proposal preparation -> release -> Check Case Status -> "Review proposal"
 * (no second code) -> acknowledgement -> the coordinator's next work. At every transition the
 * notification that left the building is checked in Mailpit: recipient, subject wording, case reference,
 * and that nothing was sent twice or to the wrong person. Screens touched by the pass are captured.
 *
 * Needs PORTAL_TEST_PASSWORD (coordinator) and DOCTOR_TEST_PASSWORD. The synthetic case is left in place.
 */
const PASSWORDS: Record<string, string | undefined> = { coordinator: process.env.PORTAL_TEST_PASSWORD, doctor: process.env.DOCTOR_TEST_PASSWORD };
const MAILPIT = (process.env.MAILPIT_URL ?? "https://mail-dev.rehletshifaa.com").replace(/\/+$/, "");
const SIMULATOR_INBOX = process.env.MAILPIT_LOCAL_INBOX ?? "patient@local.test";
const TEAM_MAILBOX = process.env.COORDINATION_TEAM_MAILBOX ?? "coordination-team@local.test";
const COORDINATOR_MAILBOX = process.env.COORDINATOR_MAILBOX ?? "coordinator@local.test";
const DOCTOR_MAILBOX = process.env.DOCTOR_MAILBOX ?? "doctor@local.test";

test.skip(Object.values(PASSWORDS).some(p => !p), "PORTAL_TEST_PASSWORD and DOCTOR_TEST_PASSWORD are required for the live walkthrough");
test.describe.configure({ mode: "serial" });

type Session = { request: APIRequestContext; subject: string; token: string; page: Page };

async function signIn(browser: Browser, user: string): Promise<Session> {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
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
  return { request: context.request, subject, token: token!, page };
}

let anonymous: APIRequestContext | null = null;
async function call<T = unknown>(s: Session | null, method: string, path: string, body?: unknown, expected?: number): Promise<{ status: number; body: T }> {
  const res = await (s?.request ?? anonymous!).fetch(`${API}${path}`, { method, headers: { ...(s ? { Authorization: `Bearer ${s.token}` } : {}), "Content-Type": "application/json" }, data: body });
  const text = await res.text();
  const parsed = (text ? JSON.parse(text) : null) as T;
  if (expected !== undefined) expect(res.status(), `${method} ${path} -> ${text.slice(0, 300)}`).toBe(expected);
  return { status: res.status(), body: parsed };
}

// ---------- Mailpit ----------

type MailHit = { ID: string; Created: string; Subject: string; To: { Address: string }[] };
type Mail = MailHit & { Text: string };

/** Every message to `to` created after `since`, newest first, with bodies. */
async function mailTo(request: APIRequestContext, to: string, since: number): Promise<Mail[]> {
  const list = await request.get(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:"${to}"`)}&limit=50`);
  const hits = (((await list.json()) as { messages: MailHit[] }).messages ?? []).filter(h => new Date(h.Created).getTime() >= since);
  const out: Mail[] = [];
  for (const hit of hits) out.push({ ...hit, ...((await (await request.get(`${MAILPIT}/api/v1/message/${hit.ID}`)).json()) as { Text: string }) });
  return out;
}

/** Wait until a message matching `subject` reaches `to` (the outbox is polled every 5s). */
async function expectMail(request: APIRequestContext, to: string, since: number, subject: RegExp, body?: RegExp): Promise<Mail> {
  const deadline = Date.now() + 45000;
  while (Date.now() < deadline) {
    const found = (await mailTo(request, to, since)).find(m => subject.test(m.Subject) && (!body || body.test(m.Text)));
    if (found) return found;
    await new Promise(r => setTimeout(r, 1500));
  }
  throw new Error(`No message matching ${subject} for ${to} arrived in Mailpit`);
}

/** Settle: give the outbox two polling cycles so "nothing else was sent" is a real statement. */
const settle = () => new Promise(r => setTimeout(r, 11000));

// ---------- the scenario ----------

type Actions = { waitingOn: string; currentAction: { code: string; workType?: string | null }; availableActions: string[] };
type Workspace = { caseSummary: { status: string; version: number; caseNumber: string }; clinicalReviews: { id: string; status: string; proposalCurrency?: string; quoteRate?: number; costEstimates: { estimatedCost: number; currency: string; quotedCost?: number | null; quotedCurrency?: string | null }[] }[];
  proposal?: { versionId: string; status: string; currency: string; items: { unitPrice: number }[] }; tasks: { type: string; status: string; priority: string }[]; actions: Actions;
  patientProposal: { state: string; action: string | null; versionId: string | null } };

test("new case → coordinator → consultant (USD) → proposal → Check Case Status → acknowledgement, with the right notifications", async ({ browser, request }) => {
  test.setTimeout(600000);
  anonymous = request;
  const stamp = Date.now();
  const started = stamp - 5000;
  const email = `uat-${stamp}@local.test`;
  const whatsapp = `+2547${String(stamp).slice(-8)}`;
  const coordinator = await signIn(browser, "coordinator");
  const doctor = await signIn(browser, "doctor");
  const shots = (name: string) => `e2e/screenshots/uat-${name}.png`;
  // Screens are captured settled: the workspace busy line must be gone.
  const idle = async (p: Page) => { await expect(p.getByText("Loading your workspace…")).toHaveCount(0); };

  // --- 1. Intake: the request lands in the team queue and the team mailbox, not in anyone's inbox ----------
  const created = await call<{ caseId: string; caseNumber: string }>(null, "POST", "/cases", {
    caseFor: "MYSELF", givenName: "Playwright", familyName: "UAT Pass", country: "Kenya", whatsappNumber: whatsapp, conditionDescription: "Synthetic case for the UAT defect-correction walkthrough.",
    preferredLanguage: "en", consent: true, turnstileToken: null, email, timeZone: "Africa/Nairobi", careArea: "cardiology", travelPackageRequested: false,
  }, 201);
  const caseId = created.body.caseId, caseNumber = created.body.caseNumber;
  await call(null, "POST", `/cases/${caseId}/submit`, undefined, 200);
  const newCase = await expectMail(request, TEAM_MAILBOX, started, new RegExp(`New care request for case ${caseNumber}`));
  expect(newCase.Text).toContain("waiting in the coordination team queue");
  expect(newCase.Text).not.toMatch(/Playwright|UAT Pass|Kenya/); // reference only, never patient facts

  const workspace = async (s: Session = coordinator, prefix = "coordinator") => (await call<Workspace>(s, "GET", `/${prefix}/cases/${caseId}`, undefined, 200)).body;
  const cards = (await call<{ caseSummary: { id: string; coordinatorSubject?: string }; highPriorityCount: number }[]>(coordinator, "GET", "/coordinator/cases", undefined, 200)).body;
  const card = cards.find(c => c.caseSummary.id === caseId)!;
  expect(card.caseSummary.coordinatorSubject ?? null).toBeNull();
  expect(card.highPriorityCount, "a new request is not HIGH for being new").toBe(0);

  // The coordinator's dashboard shows the request as shared work, and the intake brief before ownership.
  await coordinator.page.goto("/en/portal");
  const teamTab = coordinator.page.getByRole("tab", { name: /Team queue/ });
  await expect(teamTab).toContainText(/\d/);
  await teamTab.click();
  await coordinator.page.getByRole("tab", { name: /Needs ownership/ }).click();
  await idle(coordinator.page);
  await coordinator.page.screenshot({ path: shots("team-queue-1440"), fullPage: true });
  await coordinator.page.goto(`/en/portal?case=${caseId}`);
  await expect(coordinator.page.getByRole("heading", { name: "Intake brief" })).toBeVisible();
  await expect(coordinator.page.getByText("Unowned — in the team queue")).toBeVisible();
  await expect(coordinator.page.getByText(/High priority/)).toHaveCount(0);
  await idle(coordinator.page);
  await coordinator.page.screenshot({ path: shots("overview-unowned-1440"), fullPage: true });

  // --- 2. Ownership, then the consultant assignment: the consultant's email, the consultant's words -------
  await call(coordinator, "POST", `/coordinator/cases/${caseId}/claim`, undefined, 200);
  const assignedAt = Date.now() - 5000;
  const assignment = await call<{ id: string }>(coordinator, "POST", `/coordinator/cases/${caseId}/assignments`,
    { assigneeSubject: doctor.subject, assigneeRole: "DOCTOR", assignmentType: "PRIMARY", pod: null, reason: "Clinical review" }, 200);
  const consultantMail = await expectMail(request, DOCTOR_MAILBOX, assignedAt, new RegExp(`Consultant action for case ${caseNumber}: New clinical assignment`));
  expect(consultantMail.To.map(t => t.Address)).toEqual([DOCTOR_MAILBOX]);
  expect(consultantMail.Text).toContain("consultant workspace");
  expect(consultantMail.Text).not.toMatch(/coordinator/i);
  await settle();
  expect((await mailTo(request, COORDINATOR_MAILBOX, assignedAt)).filter(m => /assignment/i.test(m.Subject)), "the coordinator gets no copy of the consultant's assignment").toHaveLength(0);
  expect((await mailTo(request, TEAM_MAILBOX, assignedAt)).filter(m => /assignment/i.test(m.Subject))).toHaveLength(0);
  expect((await mailTo(request, DOCTOR_MAILBOX, assignedAt)).filter(m => /New clinical assignment/.test(m.Subject)), "sent exactly once").toHaveLength(1);

  // Priority derived, not defaulted; responsibility with the consultant; coordinator commands withdrawn.
  let ws = await workspace();
  expect(ws.tasks.find(t => t.type === "CONSULTANT_ASSIGNMENT")?.priority).toBe("NORMAL");
  expect(ws.actions.waitingOn).toBe("CONSULTANT");
  expect(ws.actions.currentAction.code).toBe("WAIT_CONSULTANT");
  expect(ws.actions.availableActions).not.toContain("REQUEST_INFORMATION");
  expect(ws.actions.availableActions).not.toContain("ASSIGN_CONSULTANT");
  expect(ws.actions.availableActions).not.toContain("CANCEL_CASE");
  const refused = await call<{ code: string }>(coordinator, "POST", `/coordinator/cases/${caseId}/information-requests`, { message: "Send more", items: [], blocking: true, language: "en" });
  expect(refused.status).toBe(409);
  expect(refused.body.code).toBe("CASE_WITH_CONSULTANT");
  const cancel = await call<{ code: string }>(coordinator, "POST", `/coordinator/cases/${caseId}/transition`, { targetStatus: "CANCELLED", reason: "no", expectedVersion: ws.caseSummary.version });
  expect(cancel.status).toBe(409);
  await coordinator.page.goto(`/en/portal?case=${caseId}`);
  await expect(coordinator.page.getByText(/Actions are locked until the clinical recommendation is ready/)).toBeVisible();
  await expect(coordinator.page.getByText("Waiting on: the consultant")).toBeVisible();
  await idle(coordinator.page);
  await coordinator.page.screenshot({ path: shots("overview-consultant-phase-1440"), fullPage: true });
  await coordinator.page.getByRole("button", { name: /^More$/ }).click();
  await expect(coordinator.page.getByRole("button", { name: /Request more information/ })).toHaveCount(0);
  await expect(coordinator.page.getByRole("button", { name: /Cancel case/ })).toHaveCount(0);
  await idle(coordinator.page);
  await coordinator.page.screenshot({ path: shots("more-actions-consultant-phase-1440"), fullPage: true });
  await coordinator.page.keyboard.press("Escape");

  // --- 3. The consultant: required marking, then a USD recommendation ---------------------------------
  await call(doctor, "POST", `/doctor/cases/${caseId}/assignments/${assignment.body.id}`, { accept: true }, 200);
  await doctor.page.goto(`/en/portal?case=${caseId}`);
  await doctor.page.getByRole("tab", { name: /Clinical/ }).click();
  const recommendation = doctor.page.getByRole("textbox", { name: "Clinical recommendation" });
  await expect(recommendation).toHaveAttribute("aria-required", "true");
  await expect(doctor.page.getByText("(* Required before submitting)")).toBeVisible();
  await doctor.page.getByRole("button", { name: "Submit recommendation" }).click();
  await expect(doctor.page.getByRole("alert").filter({ hasText: "Record your clinical recommendation before submitting." })).toBeVisible();
  await expect(recommendation).toBeFocused();
  await idle(doctor.page);
  await doctor.page.screenshot({ path: shots("clinical-recommendation-required-1440"), fullPage: true });

  const catalog = (await call<{ id: string; serviceName: string; priceEgp: number; active: boolean }[]>(doctor, "GET", "/doctor/catalog", undefined, 200)).body.filter(s => s.active);
  expect(catalog.length, "the seeded cardiology consultant has a price list").toBeGreaterThan(0);
  const service = catalog[0];
  const recommendedAt = Date.now() - 5000;
  await call(doctor, "POST", `/doctor/cases/${caseId}/review-decision`, {
    decision: "ACCEPT", recommendedTreatment: "Diagnostic consultation and imaging.", risksAndLimitations: "Standard procedural risks.",
    costEstimates: [{ serviceDescription: service.serviceName, estimatedCost: service.priceEgp, currency: "EGP", catalogServiceId: service.id }], proposalCurrency: "USD",
  }, 200);
  const prepareMail = await expectMail(request, COORDINATOR_MAILBOX, recommendedAt, new RegExp(`Coordinator action for case ${caseNumber}: Clinical recommendation ready`));
  expect(prepareMail.To.map(t => t.Address)).toEqual([COORDINATOR_MAILBOX]);
  expect(prepareMail.Text).toContain("coordinator workspace");

  // --- 4. Proposal preparation: quoted in USD everywhere the coordinator looks ------------------------
  ws = await workspace();
  const review = ws.clinicalReviews.find(r => r.status === "APPROVED")!;
  expect(review.proposalCurrency).toBe("USD");
  expect(review.quoteRate, "an effective EGP→USD rate exists on the dev stack").toBeGreaterThan(0);
  for (const line of review.costEstimates) { expect(line.currency).toBe("EGP"); expect(line.quotedCurrency).toBe("USD"); expect(line.quotedCost).toBeGreaterThan(0); }
  await coordinator.page.goto(`/en/portal?case=${caseId}`);
  await expect(coordinator.page.getByText("Patient's quote currency")).toBeVisible();
  await expect(coordinator.page.getByText("USD — US Dollar")).toBeVisible();
  const totalRow = coordinator.page.locator("li", { hasText: /^Total/ }).first();
  await expect(totalRow).toContainText("$");
  await idle(coordinator.page);
  await coordinator.page.screenshot({ path: shots("proposal-form-usd-1440"), fullPage: true });
  await coordinator.page.setViewportSize({ width: 768, height: 1024 });
  await idle(coordinator.page);
  await coordinator.page.screenshot({ path: shots("proposal-form-usd-768"), fullPage: true });
  await coordinator.page.setViewportSize({ width: 390, height: 844 });
  expect(await coordinator.page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1), "no horizontal overflow on a phone").toBe(false);
  await idle(coordinator.page);
  await coordinator.page.screenshot({ path: shots("proposal-form-usd-390"), fullPage: true });
  await coordinator.page.setViewportSize({ width: 1440, height: 1000 });

  const proposal = await call<{ versionId: string; currency: string }>(coordinator, "POST", `/coordinator/cases/${caseId}/proposals`, {
    clinicalReviewId: review.id, language: "en", operationalPlan: "", currency: null, includedServices: service.serviceName, excludedServices: "None",
    paymentTerms: "Deposit", refundTerms: "Refund", disclaimers: "Not consent", validUntil: new Date(Date.now() + 14 * 86400000).toISOString(),
    items: [{ category: "MEDICAL", description: service.serviceName, quantity: 1, unitPrice: service.priceEgp, optional: false, sortOrder: 0 }], coordinatorNotes: null,
  }, 200);
  expect(proposal.body.currency, "the consultant's currency carries through when the coordinator states none").toBe("USD");
  const versionId = proposal.body.versionId;

  // Before release: the patient's answer is "being prepared" — no version, no action — on both surfaces.
  ws = await workspace();
  expect(ws.patientProposal).toMatchObject({ state: "PREPARING", action: null, versionId: null });
  const statusToken = await expectMail(request, SIMULATOR_INBOX, started, /Your RehletShifaa case was received/, new RegExp(`Destination: ${whatsapp.replace("+", "\\+")}`))
    .then(m => m.Text.match(/\/status\/([0-9a-f]{64})/)![1]);
  const statusPage = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const otpAt = Date.now() - 5000;
  await statusPage.goto(`/en/status/${statusToken}`);
  await statusPage.getByRole("button", { name: "Send verification code" }).click();
  const statusCode = await expectMail(request, SIMULATOR_INBOX, otpAt, /verification code/i, new RegExp(`Destination: ${whatsapp.replace("+", "\\+")}`)).then(m => m.Text.match(/code is (\d{6})/)![1]);
  await statusPage.getByLabel("Verification code").fill(statusCode);
  await statusPage.getByRole("button", { name: "Verify and continue" }).click();
  await expect(statusPage.getByRole("heading", { name: "We are preparing your proposal" })).toBeVisible();
  await expect(statusPage.getByRole("button", { name: "Review proposal" })).toHaveCount(0);
  await statusPage.screenshot({ path: shots("check-status-preparing-1440"), fullPage: true });

  // --- 5. Release: the patient is told; Check Case Status now offers the one action ------------------
  const releasedAt = Date.now() - 5000;
  await call(coordinator, "POST", `/coordinator/cases/${caseId}/proposals/${versionId}/release`, undefined, 200);
  await expectMail(request, SIMULATOR_INBOX, releasedAt, /Your treatment proposal is ready/, new RegExp(`Destination: ${whatsapp.replace("+", "\\+")}`));
  ws = await workspace();
  expect(ws.caseSummary.status).toBe("PATIENT_DECISION");
  expect(ws.patientProposal).toMatchObject({ state: "READY", action: "REVIEW_PROPOSAL", versionId });
  expect(ws.proposal?.currency).toBe("USD");

  // The same verified status session (still within its 30-minute grant): the answer changed, the page follows.
  await statusPage.reload();
  await statusPage.getByRole("button", { name: "Send verification code" }).click();
  const code2At = Date.now() - 5000;
  const statusCode2 = await expectMail(request, SIMULATOR_INBOX, code2At, /verification code/i, new RegExp(`Destination: ${whatsapp.replace("+", "\\+")}`)).then(m => m.Text.match(/code is (\d{6})/)![1]);
  await statusPage.getByLabel("Verification code").fill(statusCode2);
  await statusPage.getByRole("button", { name: "Verify and continue" }).click();
  await expect(statusPage.getByRole("heading", { name: "Your proposal is ready to review" })).toBeVisible();
  await expect(statusPage.getByText("No action is required from you right now.")).toHaveCount(0);
  const review1 = statusPage.getByRole("button", { name: "Review proposal" });
  await expect(review1).toHaveCount(1);
  await statusPage.screenshot({ path: shots("check-status-ready-1440"), fullPage: true });
  await statusPage.setViewportSize({ width: 390, height: 844 });
  await statusPage.screenshot({ path: shots("check-status-ready-390"), fullPage: true });
  await statusPage.setViewportSize({ width: 1440, height: 1000 });

  // "Review proposal" opens the released version directly — no second code — priced in USD throughout.
  const proposalOpenedAt = Date.now() - 5000;
  await review1.click();
  await statusPage.waitForURL(/\/en\/proposal\/[0-9a-f]{64}$/, { timeout: 30000 });
  await expect(statusPage.getByRole("heading", { name: "Your preliminary care estimate" })).toBeVisible();
  await expect(statusPage.getByRole("button", { name: "Send code" })).toHaveCount(0);
  expect(statusPage.url()).not.toMatch(/grant/);
  const bodyText = await statusPage.locator("body").innerText();
  expect(bodyText).toMatch(/\$|US\$|USD/);
  expect(bodyText).not.toMatch(/EGP|E£/);
  await statusPage.screenshot({ path: shots("proposal-from-status-1440"), fullPage: true });
  await settle();
  expect((await mailTo(request, email, proposalOpenedAt)).filter(m => /verification code/i.test(m.Subject)), "no second one-time code was sent").toHaveLength(0);

  // --- 6. The patient acknowledges: the coordinator gets exactly the deposit work, nothing else ----------
  const decidedAt = Date.now() - 5000;
  await statusPage.getByRole("checkbox").first().check();
  await statusPage.getByRole("button", { name: /Acknowledge & continue/ }).first().click(); // the sticky bar may carry a second copy while the block is off screen
  await expect(statusPage.getByRole("heading", { name: /Thank you — your estimate is acknowledged/ })).toBeVisible();
  ws = await workspace();
  expect(ws.caseSummary.status).toBe("ACCEPTED");
  expect(ws.patientProposal).toMatchObject({ state: "ACCEPTED", action: "VIEW_PROPOSAL", versionId });
  const depositTask = ws.tasks.find(t => t.type === "DEPOSIT_ARRANGEMENT");
  expect(depositTask?.status).toBe("OPEN");
  const depositMail = await expectMail(request, COORDINATOR_MAILBOX, decidedAt, new RegExp(`Coordinator action for case ${caseNumber}: Patient acknowledged the estimate`));
  expect(depositMail.To.map(t => t.Address)).toEqual([COORDINATOR_MAILBOX]);
  expect(depositMail.Text).toContain("coordination deposit");
  await settle();
  const coordinatorSinceDecision = (await mailTo(request, COORDINATOR_MAILBOX, decidedAt));
  expect(coordinatorSinceDecision, "one coordinator email for one piece of work").toHaveLength(1);
  expect((await mailTo(request, TEAM_MAILBOX, decidedAt)).filter(m => /deposit/i.test(m.Subject)), "an owned case never falls back to the team mailbox").toHaveLength(0);
  expect((await mailTo(request, COORDINATOR_MAILBOX, releasedAt)).filter(m => /Deposit received/.test(m.Subject)), "no 'deposit received' wording before any deposit").toHaveLength(0);

  // The coordinator page now says what is happening and whose move it is.
  await coordinator.page.goto(`/en/portal?case=${caseId}`);
  await expect(coordinator.page.getByRole("heading", { name: "Case brief" })).toBeVisible();
  await expect(coordinator.page.getByText("Latest proposal")).toBeVisible();
  await idle(coordinator.page);
  await coordinator.page.screenshot({ path: shots("overview-after-acknowledgement-1440"), fullPage: true });
  await coordinator.page.goto(`/ar/portal?case=${caseId}`);
  await expect(coordinator.page.locator("html")).toHaveAttribute("dir", "rtl");
  await idle(coordinator.page);
  await coordinator.page.screenshot({ path: shots("overview-after-acknowledgement-ar-1440"), fullPage: true });
  await statusPage.close();
});
