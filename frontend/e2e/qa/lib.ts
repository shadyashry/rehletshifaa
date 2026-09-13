import { expect, test, type APIRequestContext, type Browser, type BrowserContext, type Page } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

import { API, API_BASE, OIDC_AUTHORITY } from "../env";

/**
 * Shared harness for the release-candidate QA pass. Everything runs against the live tunnel stack
 * (Cloudflare → api-gateway → backend, real Keycloak, Mailpit as the mail sink). Two API paths exist:
 *
 *  - `tunnel`  — https://api-dev… exactly as the browser sees it (one real client IP, real budgets);
 *  - `gateway` — http://localhost:8081, the same nginx gateway reached from the docker host, where a
 *                CF-Connecting-IP header simulates a distinct client per matrix so negative permutations
 *                do not exhaust the single tunnel client's write budget (the pattern gateway.spec.ts uses).
 *
 * Every test case records its verdict into docs/qa/release-candidate/evidence/results.jsonl so the
 * execution report is generated from what actually ran, never typed by hand.
 */

export const BASE = (process.env.PLAYWRIGHT_BASE_URL ?? "https://dev.rehletshifaa.com").replace(/\/+$/, "");
export const GATEWAY_LOCAL = (process.env.GATEWAY_TEST_URL ?? "http://localhost:8081").replace(/\/+$/, "");
export const MAILPIT = (process.env.MAILPIT_URL ?? "https://mail-dev.rehletshifaa.com").replace(/\/+$/, "");
export const SIMULATOR_INBOX = process.env.MAILPIT_LOCAL_INBOX ?? "patient@local.test";
export const TEAM_MAILBOX = process.env.COORDINATION_TEAM_MAILBOX ?? "coordination-team@local.test";
export const MAILBOX = {
  coordinator: process.env.COORDINATOR_MAILBOX ?? "coordinator@local.test",
  coordinator2: process.env.COORDINATOR2_MAILBOX ?? "coordinator2@local.test",
  doctor: process.env.DOCTOR_MAILBOX ?? "doctor@local.test",
  operations: "operations@local.test",
  finance: "finance@local.test",
};
export const PASSWORDS: Record<string, string | undefined> = {
  coordinator: process.env.PORTAL_TEST_PASSWORD, coordinator2: process.env.COORDINATOR2_TEST_PASSWORD ?? process.env.PORTAL_TEST_PASSWORD,
  doctor: process.env.DOCTOR_TEST_PASSWORD, operations: process.env.OPERATIONS_TEST_PASSWORD, finance: process.env.FINANCE_TEST_PASSWORD,
  patient: process.env.PATIENT_TEST_PASSWORD, "credential-admin": process.env.ADMIN_TEST_PASSWORD,
};
export const haveStaffPasswords = () => !!(PASSWORDS.coordinator && PASSWORDS.doctor && PASSWORDS.finance);

// ---------------------------------------------------------------------------------------------------
// Results recorder — one JSON line per test case verdict, consumed by the QA package generator.
// ---------------------------------------------------------------------------------------------------

export type Verdict = "PASS" | "FAIL" | "BLOCKED" | "NOT_RUN";
export type ResultLine = { tc: string; title: string; verdict: Verdict; evidence?: string; defect?: string; spec: string; at: string; project: string };
const EVIDENCE_DIR = path.resolve(__dirname, "../../../docs/qa/release-candidate/evidence");
const RESULTS_FILE = path.join(EVIDENCE_DIR, "results.jsonl");

export function record(line: Omit<ResultLine, "at" | "spec" | "project">) {
  fs.mkdirSync(EVIDENCE_DIR, { recursive: true });
  const info = test.info();
  const full: ResultLine = { ...line, at: new Date().toISOString(), spec: path.basename(info.file), project: info.project.name };
  fs.appendFileSync(RESULTS_FILE, JSON.stringify(full) + "\n");
}

/**
 * A test case inside a longer journey: records PASS/FAIL, keeps going on a soft failure so the rest of the
 * journey is still exercised, and fails the surrounding test at the end. `blocking` steps rethrow at once
 * because nothing after them would be meaningful.
 */
export async function tc(id: string, title: string, fn: () => Promise<void | string>, opts: { blocking?: boolean; defect?: string } = {}): Promise<boolean> {
  try {
    const evidence = await test.step(`${id} ${title}`, fn);
    record({ tc: id, title, verdict: "PASS", evidence: typeof evidence === "string" ? evidence : undefined, defect: opts.defect });
    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    record({ tc: id, title, verdict: "FAIL", evidence: message.slice(0, 1500), defect: opts.defect });
    softFailures.push(`${id} ${title}: ${message.split("\n")[0]}`);
    if (opts.blocking) throw error;
    return false;
  }
}
export function blocked(id: string, title: string, reason: string, defect?: string) { record({ tc: id, title, verdict: "BLOCKED", evidence: reason, defect }); }
export const softFailures: string[] = [];
/** Call at the end of a journey test so soft failures still fail the test. */
export function assertNoSoftFailures() {
  const failures = softFailures.splice(0);
  expect(failures, `soft failures:\n${failures.join("\n")}`).toEqual([]);
}
test.afterEach(() => { softFailures.splice(0); });

// ---------------------------------------------------------------------------------------------------
// Identities — real Keycloak sign-in through the portal; refresh + re-authentication helpers.
// ---------------------------------------------------------------------------------------------------

export type Session = {
  user: string; context: BrowserContext; request: APIRequestContext; subject: string; token: string; refreshToken?: string; signedInAt: number;
  roles: string[];
  /** A page already signed in (the one used to log in). */
  page: Page;
  /** Re-sign-in when the token's auth_time is older than the backend's recent-authentication window. */
  fresh: () => Promise<Session>;
};

const KC_KEY = `oidc.user:${OIDC_AUTHORITY}:rehletshifaa-web`;
const decode = (token: string) => JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString()) as { sub: string; auth_time?: number; realm_access?: { roles?: string[] }; exp?: number };

export async function signIn(browser: Browser, user: string, password = PASSWORDS[user], viewport = { width: 1440, height: 1000 }): Promise<Session> {
  if (!password) throw new Error(`No password for ${user}`);
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  await page.goto(`${BASE}/en/portal`);
  await page.getByRole("button", { name: /Sign in securely|تسجيل الدخول/ }).click();
  await page.waitForURL(/\/realms\/rehletshifaa\/protocol\/openid-connect\/auth/, { timeout: 30000 });
  await page.locator("#username").fill(user);
  await page.locator("#password").fill(password);
  await page.locator("#kc-login").click();
  await page.waitForURL(/\/en\/portal/, { timeout: 30000 });
  const stored = await page.evaluate(key => sessionStorage.getItem(key), KC_KEY);
  const parsed = stored ? (JSON.parse(stored) as { access_token?: string; refresh_token?: string }) : undefined;
  const token = parsed?.access_token;
  expect(token, `a token for ${user}`).toBeTruthy();
  const claims = decode(token!);
  const session: Session = {
    user, context, request: context.request, subject: claims.sub, token: token!, refreshToken: parsed?.refresh_token, signedInAt: Date.now(),
    roles: claims.realm_access?.roles ?? [], page,
    fresh: async () => {
      if (Date.now() - session.signedInAt < 8 * 60 * 1000) return session;
      const next = await signIn(browser, user, password, viewport);
      await session.context.close().catch(() => {});
      Object.assign(session, next);
      return session;
    },
  };
  return session;
}

/** Refresh the access token with the refresh token (standard OIDC; auth_time is preserved). */
export async function refreshAccessToken(session: Session): Promise<void> {
  if (!session.refreshToken) return;
  const res = await session.request.post(`${OIDC_AUTHORITY}/protocol/openid-connect/token`, { form: { grant_type: "refresh_token", client_id: "rehletshifaa-web", refresh_token: session.refreshToken } });
  if (!res.ok()) return;
  const body = (await res.json()) as { access_token: string; refresh_token?: string };
  session.token = body.access_token; session.refreshToken = body.refresh_token ?? session.refreshToken;
}

// ---------------------------------------------------------------------------------------------------
// API calls
// ---------------------------------------------------------------------------------------------------

export type ApiResult<T> = { status: number; body: T; headers: Record<string, string>; text: string };
export type CallOptions = { via?: "tunnel" | "gateway"; clientIp?: string; headers?: Record<string, string>; token?: string | null; rawBody?: string; timeout?: number };
let anonymousRequest: APIRequestContext | null = null;
export function useAnonymous(request: APIRequestContext) { anonymousRequest = request; }
/** Distinct simulated client per matrix through the local gateway port. */
let ipCounter = 10;
export const nextClientIp = () => `203.0.113.${(ipCounter++ % 200) + 20}`;

export async function call<T = unknown>(s: Session | null, method: string, apiPath: string, body?: unknown, expected?: number, opts: CallOptions = {}): Promise<ApiResult<T>> {
  const base = opts.via === "gateway" ? `${GATEWAY_LOCAL}/api/v1` : API;
  const headers: Record<string, string> = { "Content-Type": "application/json", ...(opts.headers ?? {}) };
  const token = opts.token === undefined ? s?.token : opts.token;
  if (token) headers.Authorization = `Bearer ${token}`;
  if (opts.via === "gateway") headers["CF-Connecting-IP"] = opts.clientIp ?? "203.0.113.5";
  const ctx = s?.request ?? anonymousRequest;
  if (!ctx) throw new Error("no request context: call useAnonymous(request) first");
  // Access tokens live five minutes; refresh transparently for long journeys.
  if (s && s.token && (decode(s.token).exp ?? 0) * 1000 < Date.now() + 20000) { await refreshAccessToken(s); headers.Authorization = `Bearer ${s.token}`; }
  const res = await ctx.fetch(`${base}${apiPath}`, { method, headers, data: opts.rawBody ?? (body === undefined ? undefined : JSON.stringify(body)), timeout: opts.timeout ?? 45000 });
  const text = await res.text();
  let parsed: T;
  try { parsed = (text ? JSON.parse(text) : null) as T; } catch { parsed = text as unknown as T; }
  if (expected !== undefined) expect(res.status(), `${method} ${apiPath} -> ${res.status()} ${text.slice(0, 400)}`).toBe(expected);
  return { status: res.status(), body: parsed, headers: res.headers(), text };
}

export type ApiError = { code?: string; message?: string; fieldErrors?: { field: string; message: string }[]; requestId?: string; errors?: { field: string; message: string }[] };

// ---------------------------------------------------------------------------------------------------
// Mailpit
// ---------------------------------------------------------------------------------------------------

export type MailHit = { ID: string; Created: string; Subject: string; To: { Address: string }[]; From?: { Address: string } };
export type Mail = MailHit & { Text: string; HTML: string };

export async function mailTo(request: APIRequestContext, to: string, since: number, limit = 50): Promise<Mail[]> {
  const list = await request.get(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:"${to}"`)}&limit=${limit}`);
  const hits = (((await list.json()) as { messages: MailHit[] }).messages ?? []).filter(h => new Date(h.Created).getTime() >= since);
  const out: Mail[] = [];
  for (const hit of hits) out.push({ ...hit, ...((await (await request.get(`${MAILPIT}/api/v1/message/${hit.ID}`)).json()) as { Text: string; HTML: string }) });
  return out;
}

export async function expectMail(request: APIRequestContext, to: string, since: number, subject: RegExp, body?: RegExp, timeoutMs = 60000): Promise<Mail> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const found = (await mailTo(request, to, since)).find(m => subject.test(m.Subject) && (!body || body.test(m.Text) || body.test(m.HTML)));
    if (found) return found;
    await new Promise(r => setTimeout(r, 1500));
  }
  throw new Error(`No message matching ${subject} for ${to} arrived in Mailpit within ${timeoutMs / 1000}s`);
}
/** Give the outbox two polling cycles so "nothing else was sent" is a real statement. */
export const settle = (ms = 11000) => new Promise(r => setTimeout(r, ms));
export const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
/** A WhatsApp-simulator message to `whatsapp` (the simulator writes every WhatsApp into one Mailpit inbox with a Destination line). */
export const toWhatsApp = (whatsapp: string, extra?: string) => new RegExp(`Destination: ${escapeRe(whatsapp)}${extra ? `[\\s\\S]*?${extra}` : ""}`);

// ---------------------------------------------------------------------------------------------------
// Domain types (the slices the tests assert on)
// ---------------------------------------------------------------------------------------------------

export type CurrentAction = { code: string; kind: string; title?: string | null; message?: string | null; taskId?: string | null; workType?: string | null; dueAt?: string | null; overdue?: boolean; blockerCode?: string | null };
export type Actions = { status: string; waitingOn: string | null; waitingReason?: string | null; currentAction: CurrentAction; blockers: { code: string; owner: string; labelEn: string }[]; availableActions: string[] };
export type Task = { id: string; type?: string; status: string; priority: string; title: string; ownerSubject?: string; blocking: boolean; version: number; caseId: string };
export type Workspace = {
  caseSummary: { id: string; status: string; version: number; caseNumber: string; coordinatorSubject?: string | null; doctorSubject?: string | null; coordinatorName?: string | null; doctorName?: string | null; waitingOn?: string | null; waitingReason?: string | null; patientName?: string; careCategory?: string; travelPackageRequested?: boolean };
  clinicalReviews: { id: string; status: string; versionNumber: number; proposalCurrency?: string; quoteRate?: number; recommendedTreatment?: string; costEstimates: { serviceDescription: string; estimatedCost: number; currency: string; quotedCost?: number | null; quotedCurrency?: string | null; catalogServiceId?: string | null }[] }[];
  proposal?: { proposalId: string; versionId: string; versionNumber: number; status: string; currency: string; items: { id: string; unitPrice: number; description: string }[]; validUntil?: string; documentType?: string } | null;
  tasks: Task[]; actions: Actions; messages: { id: string; senderRole: string; body: string; threadType: string; readAt?: string | null }[];
  assignments: { id: string; assigneeSubject: string; assigneeRole: string; assignmentType: string; status: string }[];
  patientProposal: { state: string; action: string | null; versionId: string | null; versionNumber?: number | null; currency?: string | null };
  deposit?: { id: string; status: string; totalEgp: number; currency: string; totalDisplay: number; paidDisplay?: number; balanceDisplay?: number; events: { eventType: string; providerReference?: string }[] } | null;
  gates?: { operationsRequired: boolean; financeRequired: boolean; readyForRelease: boolean; operationsCompleted: boolean; financeCompleted: boolean };
  delivery?: { status: string; channel: string; destinationMasked: string; attempts: number } | null;
  timeline: { type: string; label: string; occurredAt: string; status: string }[];
  patientAction?: { taskId: string; title: string; items: { id: string; code: string; completed: boolean }[] } | null;
  intakeSummary?: string;
};
export type WorkItem = { id: string; caseId: string; type?: string; status: string; title: string; caseNumber?: string; blocking: boolean; priority: string; waitingOn?: string | null };
export type Notification = { id: string; type?: string; title: string; body?: string; caseId?: string; caseNumber?: string; readAt?: string | null; createdAt: string; link?: string };

// ---------------------------------------------------------------------------------------------------
// Synthetic identities and journey fixtures (the business flow itself is the fixture — no SQL, no seeding)
// ---------------------------------------------------------------------------------------------------

export const stamp = () => `${Date.now()}${Math.floor(Math.random() * 1000)}`;
export function identity(prefix: string) {
  const s = stamp();
  return { stamp: s, email: `${prefix}-${s}@local.test`, whatsapp: `+2547${s.slice(-8)}`, givenName: "Playwright", familyName: `QA ${prefix}` };
}
export type Intake = { caseFor?: "MYSELF" | "SOMEONE_ELSE"; givenName: string; familyName?: string | null; singleLegalName?: boolean; representative?: { name: string; relationship: string } | null; country: string; whatsappNumber: string; conditionDescription?: string | null; preferredLanguage: "en" | "ar"; consent: boolean; turnstileToken?: string | null; email?: string | null; timeZone?: string | null; careArea?: string | null; travelPackageRequested?: boolean };
export function intakePayload(id: ReturnType<typeof identity>, overrides: Partial<Intake> = {}): Intake {
  return { caseFor: "MYSELF", givenName: id.givenName, familyName: id.familyName, country: "Kenya", whatsappNumber: id.whatsapp, conditionDescription: "Synthetic QA case — no real patient data.",
    preferredLanguage: "en", consent: true, turnstileToken: null, email: id.email, timeZone: "Africa/Nairobi", careArea: "cardiology", travelPackageRequested: false, ...overrides };
}

export type CaseRef = { caseId: string; caseNumber: string; statusToken?: string };
export async function createAndSubmit(id: ReturnType<typeof identity>, overrides: Partial<Intake> = {}, opts: CallOptions = {}): Promise<CaseRef> {
  const created = await call<{ caseId: string; caseNumber: string; status: string }>(null, "POST", "/cases", intakePayload(id, overrides), 201, opts);
  const submitted = await call<{ caseNumber: string; status: string; statusToken: string }>(null, "POST", `/cases/${created.body.caseId}/submit`, undefined, 200, opts);
  return { caseId: created.body.caseId, caseNumber: created.body.caseNumber, statusToken: submitted.body.statusToken };
}

export const workspaceOf = async (s: Session, caseId: string, prefix = "coordinator", opts: CallOptions = {}) => (await call<Workspace>(s, "GET", `/${prefix}/cases/${caseId}`, undefined, 200, opts)).body;

export type Catalog = { id: string; serviceName: string; serviceCode: string; priceEgp: number; active: boolean };
export async function doctorCatalog(doctor: Session, opts: CallOptions = {}) {
  return (await call<Catalog[]>(doctor, "GET", "/doctor/catalog", undefined, 200, opts)).body.filter(s => s.active);
}

/** Intake → ownership → consultant assignment (PENDING). */
export async function toAssigned(c: CaseRef, coordinator: Session, doctor: Session, opts: CallOptions = {}) {
  await call(coordinator, "POST", `/coordinator/cases/${c.caseId}/claim`, undefined, 200, opts);
  const assignment = await call<{ id: string; status: string }>(coordinator, "POST", `/coordinator/cases/${c.caseId}/assignments`,
    { assigneeSubject: doctor.subject, assigneeRole: "DOCTOR", assignmentType: "PRIMARY", pod: null, reason: "Clinical review" }, 200, opts);
  return assignment.body.id;
}
/** … → consultant accepted → USD recommendation (APPROVED review). */
export async function toRecommended(c: CaseRef, coordinator: Session, doctor: Session, currency = "USD", opts: CallOptions = {}) {
  const assignmentId = await toAssigned(c, coordinator, doctor, opts);
  await call(doctor, "POST", `/doctor/cases/${c.caseId}/assignments/${assignmentId}`, { accept: true }, 200, opts);
  const service = (await doctorCatalog(doctor, opts))[0];
  await (await doctor.fresh());
  await call(doctor, "POST", `/doctor/cases/${c.caseId}/review-decision`, { decision: "ACCEPT", recommendedTreatment: "Diagnostic consultation and imaging.", risksAndLimitations: "Standard procedural risks.",
    costEstimates: [{ serviceDescription: service.serviceName, estimatedCost: service.priceEgp, currency: "EGP", catalogServiceId: service.id }], proposalCurrency: currency }, 200, opts);
  const ws = await workspaceOf(coordinator, c.caseId, "coordinator", opts);
  const review = ws.clinicalReviews.find(r => r.status === "APPROVED")!;
  return { assignmentId, service, review };
}
export function proposalDraft(reviewId: string, service: Catalog, extra: Record<string, unknown> = {}) {
  return { clinicalReviewId: reviewId, language: "en", operationalPlan: "", currency: null, includedServices: service.serviceName, excludedServices: "None", paymentTerms: "Deposit", refundTerms: "Refund",
    disclaimers: "Not consent", validUntil: new Date(Date.now() + 14 * 86400000).toISOString(), items: [{ category: "MEDICAL", description: service.serviceName, quantity: 1, unitPrice: service.priceEgp, optional: false, sortOrder: 0 }], coordinatorNotes: null, ...extra };
}
/** … → proposal created + released (PATIENT_DECISION). Returns the share token read from Mailpit. */
export async function toReleased(c: CaseRef, coordinator: Session, doctor: Session, request: APIRequestContext, whatsapp: string, currency = "USD", opts: CallOptions = {}) {
  const r = await toRecommended(c, coordinator, doctor, currency, opts);
  const proposal = await call<{ versionId: string; currency: string; versionNumber: number }>(coordinator, "POST", `/coordinator/cases/${c.caseId}/proposals`, proposalDraft(r.review.id, r.service), 200, opts);
  const releasedAt = Date.now() - 5000;
  await call(coordinator, "POST", `/coordinator/cases/${c.caseId}/proposals/${proposal.body.versionId}/release`, undefined, 200, opts);
  const mail = await expectMail(request, SIMULATOR_INBOX, releasedAt, /Your treatment proposal is ready/, toWhatsApp(whatsapp));
  const proposalToken = mail.Text.match(/\/proposal\/([0-9a-f]{64})/)![1];
  return { ...r, versionId: proposal.body.versionId, proposalToken, releasedAt };
}
/** Public OTP dance for a proposal share token: returns the grant. */
export async function proposalGrant(request: APIRequestContext, proposalToken: string, email: string, opts: CallOptions = {}) {
  const otpAt = Date.now() - 5000;
  await call(null, "POST", `/public/proposals/${proposalToken}/request-access`, { channel: "EMAIL" }, 200, opts);
  const code = (await expectMail(request, email, otpAt, /verification code/i)).Text.match(/code is (\d{6})/)![1];
  return (await call<{ grant: string }>(null, "POST", `/public/proposals/${proposalToken}/verify`, { code }, 200, opts)).body.grant;
}
/** … → acknowledged (ACCEPTED, deposit REQUESTED). Returns the onboarding token from Mailpit. */
export async function toAcknowledged(c: CaseRef, coordinator: Session, doctor: Session, request: APIRequestContext, id: ReturnType<typeof identity>, currency = "USD", opts: CallOptions = {}) {
  const r = await toReleased(c, coordinator, doctor, request, id.whatsapp, currency, opts);
  const grant = await proposalGrant(request, r.proposalToken, id.email, opts);
  const decidedAt = Date.now() - 5000;
  await call(null, "POST", `/public/proposals/${r.proposalToken}/decision`, { grant, decision: "ACKNOWLEDGED", comment: null, acknowledgementAccepted: true }, 200, opts);
  const onboarding = await expectMail(request, SIMULATOR_INBOX, r.releasedAt, /Complete your RehletShifaa profile/, toWhatsApp(id.whatsapp));
  const onboardingToken = onboarding.Text.match(/\/activate\/([0-9a-f]{64})/)![1];
  return { ...r, grant, decidedAt, onboardingToken };
}
export async function onboardingGrant(request: APIRequestContext, onboardingToken: string, email: string, opts: CallOptions = {}) {
  const otpAt = Date.now() - 5000;
  await call(null, "POST", `/public/onboarding/${onboardingToken}/request-access`, { channel: "EMAIL" }, 200, opts);
  const code = (await expectMail(request, email, otpAt, /verification code/i)).Text.match(/code is (\d{6})/)![1];
  return (await call<{ grant: string }>(null, "POST", `/public/onboarding/${onboardingToken}/verify`, { code }, 200, opts)).body.grant;
}
export function profilePayload(id: ReturnType<typeof identity>, overrides: Record<string, unknown> = {}) {
  return { givenName: id.givenName, familyName: id.familyName, email: id.email, phone: id.whatsapp, mobileOwner: "PATIENT", dateOfBirth: "1990-01-01", nationality: "KE", countryOfResidence: "KE", preferredLanguage: "en", sex: "FEMALE",
    consents: ["PRIVACY_DATA_PROCESSING", "CROSS_BORDER_CARE", "DEPOSIT_CANCELLATION_TERMS"], ...overrides };
}
/** … → profile activated (account SETUP_PENDING, setup email in Mailpit). */
export async function toActivated(c: CaseRef, coordinator: Session, doctor: Session, request: APIRequestContext, id: ReturnType<typeof identity>, currency = "USD", opts: CallOptions = {}) {
  const r = await toAcknowledged(c, coordinator, doctor, request, id, currency, opts);
  const grant = await onboardingGrant(request, r.onboardingToken, id.email, opts);
  const setupAt = Date.now() - 5000;
  const activation = await call<{ profileActive: boolean; account: { status: string; awaitingEmail: boolean; emailSent: boolean }; journeyStage: string; currentAction: string }>(null, "POST", `/public/onboarding/${r.onboardingToken}/activate`, { grant, profile: profilePayload(id) }, 200, opts);
  return { ...r, onboardingGrantValue: grant, activation: activation.body, setupAt };
}

/** Complete the Keycloak execute-actions link and sign the new patient in; returns the patient page on My Care. */
export async function completeAccountSetup(browser: Browser, request: APIRequestContext, email: string, setupAt: number, password: string, viewport = { width: 1440, height: 1000 }): Promise<{ page: Page; context: BrowserContext; setupLink: string }> {
  const setup = await expectMail(request, email, setupAt, /Finish setting up your RehletShifaa account/);
  const link = (setup.Text.match(/(https?:\/\/[^\s"<>]+login-actions\/action-token[^\s"<>]*)/) ?? setup.HTML.match(/(https?:\/\/[^\s"<>]+login-actions\/action-token[^\s"<>]*)/))![1].replace(/&amp;/g, "&");
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  await page.goto(link);
  await page.getByRole("link", { name: /Continue|متابعة/ }).click();
  await page.locator("#password-new").fill(password);
  await page.locator("#password-confirm").fill(password);
  await page.locator("input[type=submit], button[type=submit]").first().click();
  await expect(page.getByText(/Your account is ready|حسابك جاهز/).first()).toBeVisible({ timeout: 30000 });
  await page.getByRole("link", { name: /Continue to my case|متابعة إلى حالتي/ }).click();
  await page.waitForURL(/\/realms\/rehletshifaa\/protocol\/openid-connect\/auth/, { timeout: 30000 });
  await page.locator("#username").fill(email);
  await page.locator("#password").fill(password);
  await page.locator("#kc-login").click();
  await page.waitForURL(/\/en\/portal/, { timeout: 30000 });
  return { page, context, setupLink: link };
}
/** Bearer session for a browser page that is already signed in (patient after setup). */
export async function sessionFromPage(page: Page, context: BrowserContext, user: string): Promise<Session> {
  const stored = await page.evaluate(key => sessionStorage.getItem(key), KC_KEY);
  const parsed = stored ? (JSON.parse(stored) as { access_token?: string; refresh_token?: string }) : undefined;
  expect(parsed?.access_token, "a patient token").toBeTruthy();
  const claims = decode(parsed!.access_token!);
  const session: Session = { user, context, request: context.request, subject: claims.sub, token: parsed!.access_token!, refreshToken: parsed?.refresh_token, signedInAt: Date.now(), roles: claims.realm_access?.roles ?? [], page, fresh: async () => session };
  return session;
}

/** The queued notifications for a session (staff or patient). */
export async function notifications(s: Session, opts: CallOptions = {}) { return (await call<Notification[]>(s, "GET", "/notifications", undefined, 200, opts)).body; }
export async function myWork(s: Session, opts: CallOptions = {}) { return (await call<WorkItem[]>(s, "GET", "/work/mine", undefined, 200, opts)).body; }

/** Base64 of the smallest valid PDF / PNG / JPEG the inspector accepts (real magic bytes, benign content). */
export const SAMPLE = {
  pdf: Buffer.from("%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]>>endobj\nxref\n0 4\n0000000000 65535 f \n0000000009 00000 n \n0000000052 00000 n \n0000000101 00000 n \ntrailer<</Size 4/Root 1 0 R>>\nstartxref\n160\n%%EOF\n"),
  png: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64"),
  jpeg: Buffer.from("/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AN//Z", "base64"),
};

/** Upload one document to a case through presign → PUT → confirm, exactly as the browser does. */
export async function uploadDocument(request: APIRequestContext, caseId: string, name: string, contentType: string, bytes: Buffer, opts: CallOptions = {}, prefix = "") {
  const presign = await call<{ documentId: string; uploadUrl: string; requiredHeaders: Record<string, string> }>(null, "POST", `${prefix}/cases/${caseId}/documents/presign`, { originalFileName: name, contentType, sizeBytes: bytes.length }, undefined, opts);
  if (presign.status !== 201) return { presign, put: null as null | { status: number }, confirm: null as null | ApiResult<{ documentId: string; status: string }> };
  const put = await request.fetch(presign.body.uploadUrl, { method: "PUT", headers: presign.body.requiredHeaders, data: bytes });
  const confirm = await call<{ documentId: string; status: string }>(null, "POST", `${prefix}/cases/${caseId}/documents/confirm`, { documentId: presign.body.documentId }, undefined, opts);
  return { presign, put: { status: put.status() }, confirm };
}

export async function screenshot(page: Page, name: string) {
  const dir = path.join(EVIDENCE_DIR, "screenshots");
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${name}.png`);
  await page.screenshot({ path: file, fullPage: true });
  return path.relative(path.resolve(__dirname, "../../.."), file).replace(/\\/g, "/");
}
export const noHorizontalOverflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1);
