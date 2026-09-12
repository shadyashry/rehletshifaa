import { expect, test, type APIRequestContext, type Browser, type Page } from "@playwright/test";

import { API, OIDC_AUTHORITY } from "./env";

/**
 * Post-activation landing over the real stack: a synthetic patient acknowledges their estimate through the
 * secure link, completes their profile, receives the account-setup email, creates a password in Keycloak,
 * signs in once — and lands directly on My Care for that case: the deposit being arranged on our side,
 * no action asked of them, authoritative money, the coordinator by name. Then Finance confirms the deposit
 * and the same page moves on by itself.
 *
 * Needs PORTAL_TEST_PASSWORD (coordinator), DOCTOR_TEST_PASSWORD and FINANCE_TEST_PASSWORD. The synthetic
 * patient account it creates in the dev realm is left in place, like the other live intake specs.
 */
const PASSWORDS: Record<string, string | undefined> = { coordinator: process.env.PORTAL_TEST_PASSWORD, doctor: process.env.DOCTOR_TEST_PASSWORD, finance: process.env.FINANCE_TEST_PASSWORD };
const MAILPIT = (process.env.MAILPIT_URL ?? "https://mail-dev.rehletshifaa.com").replace(/\/+$/, "");
const SIMULATOR_INBOX = process.env.MAILPIT_LOCAL_INBOX ?? "patient@local.test";

test.skip(Object.values(PASSWORDS).some(p => !p), "PORTAL/DOCTOR/FINANCE_TEST_PASSWORD are required for the live landing check");
test.describe.configure({ mode: "serial" });

type Session = { request: APIRequestContext; subject: string; token: string };

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

let anonymous: APIRequestContext | null = null;
async function call<T = unknown>(s: Session | null, method: string, path: string, body?: unknown, expected?: number): Promise<{ status: number; body: T }> {
  const res = await (s?.request ?? anonymous!).fetch(`${API}${path}`, { method, headers: { ...(s ? { Authorization: `Bearer ${s.token}` } : {}), "Content-Type": "application/json" }, data: body });
  const text = await res.text();
  const parsed = (text ? JSON.parse(text) : null) as T;
  if (expected !== undefined) expect(res.status(), `${method} ${path} -> ${text.slice(0, 300)}`).toBe(expected);
  return { status: res.status(), body: parsed };
}

type MailHit = { ID: string; Created: string; Subject: string };
async function latestMail(request: APIRequestContext, subject: string, since: number, to: string, bodyMatch: RegExp): Promise<string> {
  const deadline = Date.now() + 60000;
  while (Date.now() < deadline) {
    const list = await request.get(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`subject:"${subject}" to:"${to}"`)}&limit=20`);
    const hits = ((await list.json()) as { messages: MailHit[] }).messages ?? [];
    for (const hit of hits.filter(h => new Date(h.Created).getTime() >= since)) {
      const message = (await (await request.get(`${MAILPIT}/api/v1/message/${hit.ID}`)).json()) as { Text: string; HTML: string };
      const found = message.Text.match(bodyMatch) ?? message.HTML.match(bodyMatch);
      if (found) return found[1];
    }
    await new Promise(r => setTimeout(r, 1500));
  }
  throw new Error(`No "${subject}" message for ${to} matching ${bodyMatch} arrived in Mailpit`);
}

type Workspace = { caseSummary: { status: string; coordinatorName?: string | null }; clinicalReviews: { id: string; status: string }[]; proposal?: { versionId: string }; deposit?: { id: string; status: string; totalEgp: number; currency: string; totalDisplay: number } | null;
  actions: { currentAction: { code: string; kind: string } } };

test("activation → password → sign-in lands on My Care for the current case; the deposit then confirms in place", async ({ browser, request }) => {
  test.setTimeout(600000);
  anonymous = request;
  const stamp = Date.now();
  const email = `landing-${stamp}@local.test`;
  const whatsapp = `+2547${String(stamp).slice(-8)}`;
  const coordinator = await signIn(browser, "coordinator");
  const doctor = await signIn(browser, "doctor");
  const finance = await signIn(browser, "finance");

  // --- Fixture: a synthetic case to the acknowledged estimate, through the real journey ------------------
  const created = await call<{ caseId: string; caseNumber: string }>(null, "POST", "/cases", {
    caseFor: "MYSELF", givenName: "Playwright", familyName: "Landing", country: "Kenya", whatsappNumber: whatsapp, conditionDescription: "Synthetic case for the post-activation landing check.",
    preferredLanguage: "en", consent: true, turnstileToken: null, email, timeZone: "Africa/Nairobi", careArea: "cardiology", travelPackageRequested: false,
  }, 201);
  const caseId = created.body.caseId, caseNumber = created.body.caseNumber;
  await call(null, "POST", `/cases/${caseId}/submit`, undefined, 200);
  const workspace = async (s: Session = coordinator, prefix = "coordinator") => (await call<Workspace>(s, "GET", `/${prefix}/cases/${caseId}`, undefined, 200)).body;
  await call(coordinator, "POST", `/coordinator/cases/${caseId}/claim`, undefined, 200);
  const assignment = await call<{ id: string }>(coordinator, "POST", `/coordinator/cases/${caseId}/assignments`, { assigneeSubject: doctor.subject, assigneeRole: "DOCTOR", assignmentType: "PRIMARY", pod: null, reason: "Clinical review" }, 200);
  await call(doctor, "POST", `/doctor/cases/${caseId}/assignments/${assignment.body.id}`, { accept: true }, 200);
  const catalog = (await call<{ id: string; serviceName: string; priceEgp: number; active: boolean }[]>(doctor, "GET", "/doctor/catalog", undefined, 200)).body.filter(s => s.active);
  const service = catalog[0];
  await call(doctor, "POST", `/doctor/cases/${caseId}/review-decision`, { decision: "ACCEPT", recommendedTreatment: "Diagnostic consultation and imaging.", risksAndLimitations: null,
    costEstimates: [{ serviceDescription: service.serviceName, estimatedCost: service.priceEgp, currency: "EGP", catalogServiceId: service.id }], proposalCurrency: "USD" }, 200);
  const review = (await workspace()).clinicalReviews.find(r => r.status === "APPROVED")!;
  const proposal = await call<{ versionId: string }>(coordinator, "POST", `/coordinator/cases/${caseId}/proposals`, {
    clinicalReviewId: review.id, language: "en", operationalPlan: "", currency: null, includedServices: service.serviceName, excludedServices: "None", paymentTerms: "Deposit", refundTerms: "Refund",
    disclaimers: "Not consent", validUntil: new Date(Date.now() + 14 * 86400000).toISOString(), items: [{ category: "MEDICAL", description: service.serviceName, quantity: 1, unitPrice: service.priceEgp, optional: false, sortOrder: 0 }], coordinatorNotes: null,
  }, 200);
  const releasedAt = Date.now() - 5000;
  await call(coordinator, "POST", `/coordinator/cases/${caseId}/proposals/${proposal.body.versionId}/release`, undefined, 200);
  const proposalToken = await latestMail(request, "Your treatment proposal is ready", releasedAt, SIMULATOR_INBOX, new RegExp(`Destination: ${whatsapp.replace("+", "\\+")}[\\s\\S]*?/proposal/([0-9a-f]{64})`));
  const otpAt = Date.now() - 5000;
  await call(null, "POST", `/public/proposals/${proposalToken}/request-access`, { channel: "EMAIL" }, 200);
  const code = await latestMail(request, "Your RehletShifaa verification code", otpAt, email, /verification code is (\d{6})/);
  const grant = (await call<{ grant: string }>(null, "POST", `/public/proposals/${proposalToken}/verify`, { code }, 200)).body.grant;
  await call(null, "POST", `/public/proposals/${proposalToken}/decision`, { grant, decision: "ACKNOWLEDGED", comment: null, acknowledgementAccepted: true }, 200);
  expect((await workspace()).caseSummary.status).toBe("ACCEPTED");

  // --- Profile completion through the onboarding link, which provisions the account -------------------
  const onboardingToken = await latestMail(request, "Complete your RehletShifaa profile", releasedAt, SIMULATOR_INBOX, new RegExp(`Destination: ${whatsapp.replace("+", "\\+")}[\\s\\S]*?/activate/([0-9a-f]{64})`));
  const activationOtpAt = Date.now() - 5000;
  await call(null, "POST", `/public/onboarding/${onboardingToken}/request-access`, { channel: "EMAIL" }, 200);
  const activationCode = await latestMail(request, "Your RehletShifaa verification code", activationOtpAt, email, /verification code is (\d{6})/);
  const activationGrant = (await call<{ grant: string }>(null, "POST", `/public/onboarding/${onboardingToken}/verify`, { code: activationCode }, 200)).body.grant;
  const setupAt = Date.now() - 5000;
  await call(null, "POST", `/public/onboarding/${onboardingToken}/activate`, { grant: activationGrant, profile: {
    givenName: "Playwright", familyName: "Landing", email, phone: whatsapp, mobileOwner: "PATIENT", dateOfBirth: "1990-01-01", nationality: "KE", countryOfResidence: "KE", preferredLanguage: "en", sex: "FEMALE",
    consents: ["PRIVACY_DATA_PROCESSING", "CROSS_BORDER_CARE", "DEPOSIT_CANCELLATION_TERMS"] } }, 200);

  // --- The identity provider's setup email: create the password, then "Continue to my case" ---------------
  const setupLink = await latestMail(request, "Finish setting up your RehletShifaa account", setupAt, email, /(https?:\/\/[^\s"<>]+login-actions\/action-token[^\s"<>]*)/);
  const patient: Page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await patient.goto(setupLink.replace(/&amp;/g, "&"));
  // Keycloak confirms the action first ("One last step to secure your account"), then asks for the password.
  await patient.getByRole("link", { name: /Continue/ }).click();
  const password = `Landing-${stamp}-Aa1!`;
  await patient.locator("#password-new").fill(password);
  await patient.locator("#password-confirm").fill(password);
  await patient.locator("input[type=submit], button[type=submit]").first().click();
  await expect(patient.getByText(/Your account is ready/).first()).toBeVisible({ timeout: 30000 });
  await patient.getByRole("link", { name: /Continue to my case/ }).click();

  // The one sign-in after setup: the case context travels through it untouched.
  await patient.waitForURL(/\/realms\/rehletshifaa\/protocol\/openid-connect\/auth/, { timeout: 30000 });
  await patient.locator("#username").fill(email);
  await patient.locator("#password").fill(password);
  await patient.locator("#kc-login").click();
  await patient.waitForURL(new RegExp(`/en/portal\\?case=${caseId}`), { timeout: 30000 });

  // --- Landing: the care journey, not a dashboard ----------------------------------------------------------
  await expect(patient.getByRole("heading", { level: 1, name: "My Care" })).toBeVisible();
  await expect(patient.getByText(caseNumber)).toBeVisible();
  await expect(patient.getByRole("heading", { name: "Deposit arrangements" })).toBeVisible({ timeout: 30000 });
  await expect(patient.getByText("No action is required from you right now.")).toBeVisible();
  const ws = await workspace();
  const deposit = ws.deposit!;
  expect(deposit.status).toBe("REQUESTED");
  expect(deposit.currency).toBe("USD");
  const depositBlock = patient.getByRole("region", { name: "Deposit", exact: true });
  await expect(depositBlock).toContainText("Arranging");
  await expect(depositBlock).toContainText(new Intl.NumberFormat("en", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(deposit.totalDisplay));
  await expect(depositBlock.getByRole("button")).toHaveCount(0);
  await expect(patient.getByText(/EGP|E£/)).toHaveCount(0);
  await expect(patient.getByRole("region", { name: "Your coordinator" })).toContainText(ws.caseSummary.coordinatorName!);
  await expect(patient.getByRole("button", { name: /^view proposal/i })).toHaveCount(1);
  const buttons = await patient.getByRole("button").allTextContents();
  expect(buttons.filter(text => /continue|pay|check status|refresh|go to case/i.test(text))).toEqual([]);
  await patient.screenshot({ path: "e2e/screenshots/my-care-live-landing-1440.png", fullPage: true });

  // --- Finance confirms the deposit: the page moves on by itself ------------------------------------------
  await call(finance, "POST", `/finance/cases/${caseId}/deposits/${deposit.id}/payments`, { amountEgp: deposit.totalEgp, method: "BANK", providerReference: `landing-${stamp}`, idempotencyKey: `landing-${caseId}` }, 200);
  await patient.reload();
  await expect(patient.getByRole("region", { name: "Deposit", exact: true })).toContainText("Deposit received", { timeout: 30000 });
  await expect(patient.getByText(/Arranging|Deposit arrangements/)).toHaveCount(0);
  await expect(patient.getByRole("heading", { name: "We are arranging your treatment" })).toBeVisible();
  await patient.screenshot({ path: "e2e/screenshots/my-care-live-deposit-received-1440.png", fullPage: true });
  await patient.close();
});
