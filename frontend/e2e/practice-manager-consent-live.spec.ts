import { createHash, createHmac, randomBytes } from "node:crypto";

import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

import { API, OIDC_AUTHORITY } from "./env";

const BASE = (process.env.PLAYWRIGHT_BASE_URL ?? "https://dev.rehletshifaa.com").replace(/\/+$/, "");
const MAILPIT = (process.env.MAILPIT_URL ?? "http://localhost:8025").replace(/\/+$/, "");
const CLIENT_ID = "rehletshifaa-web";
const REDIRECT_URI = `${BASE}/__oauth-capture`;
const DOCTOR_USERNAME = process.env.DOCTOR_TEST_USERNAME ?? "doctor";
const DOCTOR_PASSWORD = process.env.DOCTOR_TEST_PASSWORD;
const MANAGER_PASSWORD = process.env.PRACTICE_MANAGER_TEST_PASSWORD;
const enabled = process.env.PRACTICE_MANAGER_CONSENT_LIVE === "true" && DOCTOR_PASSWORD && MANAGER_PASSWORD;

test.skip(!enabled, "Set PRACTICE_MANAGER_CONSENT_LIVE, DOCTOR_TEST_PASSWORD and PRACTICE_MANAGER_TEST_PASSWORD");

type MailHit = { ID: string; Created: string; Subject: string; To: { Address: string }[] };
type Mail = MailHit & { Text: string; HTML: string };
type ClinicSummary = { practitionerId: string; relation: string; permissions: string[] };
type ManagerView = { id: string; status: string; permissions: string[]; pendingPermissions: string[] | null; version: number };

const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });
const base64url = (value: Buffer) => value.toString("base64url");

function totp(secret: string, now = Date.now()) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  for (const character of secret.replace(/\s+/g, "").toUpperCase()) bits += alphabet.indexOf(character).toString(2).padStart(5, "0");
  const key = Buffer.from(bits.match(/.{8}/g)?.map(byte => Number.parseInt(byte, 2)) ?? []);
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(now / 30_000)));
  const digest = createHmac("sha1", key).update(counter).digest();
  const offset = digest[digest.length - 1] & 0x0f;
  return ((digest.readUInt32BE(offset) & 0x7fffffff) % 1_000_000).toString().padStart(6, "0");
}

async function mailTo(request: APIRequestContext, to: string, since: number): Promise<Mail[]> {
  const list = await request.get(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:"${to}"`)}&limit=50`);
  expect(list.status(), await list.text()).toBe(200);
  const hits = (((await list.json()) as { messages: MailHit[] }).messages ?? [])
    .filter(hit => new Date(hit.Created).getTime() >= since);
  const messages: Mail[] = [];
  for (const hit of hits) {
    const response = await request.get(`${MAILPIT}/api/v1/message/${hit.ID}`);
    messages.push({ ...hit, ...((await response.json()) as { Text: string; HTML: string }) });
  }
  return messages;
}

async function expectMail(request: APIRequestContext, to: string, since: number, match: RegExp) {
  for (let attempt = 0; attempt < 80; attempt++) {
    const found = (await mailTo(request, to, since)).find(message => match.test(`${message.Subject}\n${message.Text}\n${message.HTML}`));
    if (found) return found;
    await new Promise(resolve => setTimeout(resolve, 1_500));
  }
  throw new Error(`No Mailpit message matching ${match} arrived for ${to}`);
}

function linkFrom(message: Mail, match: RegExp) {
  const value = message.Text.match(match)?.[0] ?? message.HTML.match(match)?.[0];
  expect(value, `link in ${message.Subject}`).toBeTruthy();
  return value!.replace(/&amp;/g, "&");
}

async function passwordToken(page: Page, request: APIRequestContext) {
  const verifier = base64url(randomBytes(32));
  const challenge = base64url(createHash("sha256").update(verifier).digest());
  const query = new URLSearchParams({
    client_id: CLIENT_ID, redirect_uri: REDIRECT_URI, response_type: "code", scope: "openid profile email",
    state: base64url(randomBytes(16)), code_challenge: challenge, code_challenge_method: "S256", prompt: "login", max_age: "0",
    acr_values: "2",
  });
  await page.goto(`${OIDC_AUTHORITY}/protocol/openid-connect/auth?${query}`);
  await page.locator("#username").fill(DOCTOR_USERNAME);
  await page.locator("#password").fill(DOCTOR_PASSWORD!);
  await page.locator("#kc-login").click();
  const manual = page.getByRole("link", { name: "Unable to scan?" });
  if (await manual.isVisible()) {
    await manual.click();
    const secret = (await page.locator("#kc-totp-secret-key").innerText()).trim();
    await page.locator("#totp").fill(totp(secret));
    await page.locator("#userLabel").fill("Practice Manager consent rehearsal");
    await page.getByRole("button", { name: "Submit" }).click();
  }
  await page.waitForURL(url => url.origin === new URL(BASE).origin && url.pathname === "/__oauth-capture", { timeout: 30_000 });
  const code = new URL(page.url()).searchParams.get("code");
  const token = await request.post(`${OIDC_AUTHORITY}/protocol/openid-connect/token`, { form: {
    grant_type: "authorization_code", client_id: CLIENT_ID, redirect_uri: REDIRECT_URI, code: code!, code_verifier: verifier,
  } });
  expect(token.status(), await token.text()).toBe(200);
  return ((await token.json()) as { access_token: string }).access_token;
}

async function completeAccountSetup(page: Page, actionLink: string) {
  await page.context().clearCookies();
  await page.goto(actionLink);
  let secret: string | undefined;
  let enrollmentCounter: number | undefined;
  for (let attempt = 0; attempt < 100; attempt++) {
    if (page.url().startsWith(BASE)) break;
    const continueLink = page.getByRole("link", { name: /Continue|متابعة/ });
    if (await continueLink.isVisible()) {
      await continueLink.click();
      continue;
    }
    const manual = page.getByRole("link", { name: "Unable to scan?" });
    if (await manual.isVisible()) {
      await manual.click();
      secret = (await page.locator("#kc-totp-secret-key").innerText()).trim();
      const enrollmentTime = Date.now();
      enrollmentCounter = Math.floor(enrollmentTime / 30_000);
      await page.locator("#totp").fill(totp(secret, enrollmentTime));
      await page.locator("#userLabel").fill("Practice Manager live rehearsal");
      await page.getByRole("button", { name: "Submit" }).click();
      continue;
    }
    if (await page.locator("#password-new").isVisible()) {
      await page.locator("#password-new").fill(MANAGER_PASSWORD!);
      await page.locator("#password-confirm").fill(MANAGER_PASSWORD!);
      await page.locator("input[type=submit], button[type=submit]").first().click();
      continue;
    }
    if (await page.locator("#lastName").isVisible()) {
      const firstName = page.locator("#firstName");
      if (await firstName.isVisible() && !(await firstName.inputValue()).trim()) await firstName.fill("Practice Manager");
      await page.locator("#lastName").fill("Live");
      await page.locator("input[type=submit], button[type=submit]").first().click();
      continue;
    }
    await page.waitForTimeout(200);
  }
  expect(secret, "TOTP enrollment during account setup").toBeTruthy();
  expect(enrollmentCounter, "TOTP enrollment counter").toBeDefined();
  await expect(page).toHaveURL(url => url.origin === new URL(BASE).origin, { timeout: 30_000 });
  return { secret: secret!, enrollmentCounter: enrollmentCounter! };
}

async function signInManager(page: Page, email: string, secret: string, enrollmentCounter: number, invitationLink: string) {
  await page.goto(invitationLink);
  await page.getByRole("button", { name: /Sign in securely|تسجيل الدخول/ }).click();
  await page.waitForURL(/\/realms\/rehletshifaa\/protocol\/openid-connect\/auth/, { timeout: 30_000 });
  await expect(page.locator("#username")).toBeVisible({ timeout: 30_000 });
  await page.locator("#username").fill(email);
  await page.locator("#password").fill(MANAGER_PASSWORD!);
  await page.locator("#kc-login").click();
  if (page.url().includes("/realms/rehletshifaa/")) {
    await expect(page.locator("#otp")).toBeVisible({ timeout: 30_000 });
    const remainingInEnrollmentWindow = ((enrollmentCounter + 1) * 30_000) - Date.now();
    if (remainingInEnrollmentWindow >= 0) await page.waitForTimeout(remainingInEnrollmentWindow + 500);
    await page.locator("#otp").fill(totp(secret));
    await page.locator("#kc-login").click();
  }
  await page.waitForURL(url => url.origin === new URL(BASE).origin && url.pathname.endsWith("/portal/virtual-clinic/invitations"), { timeout: 30_000 });
}

async function accessToken(page: Page) {
  const key = `oidc.user:${OIDC_AUTHORITY}:${CLIENT_ID}`;
  const stored = await page.evaluate(storageKey => sessionStorage.getItem(storageKey), key);
  const parsed = stored ? JSON.parse(stored) as { access_token?: string } : undefined;
  expect(parsed?.access_token).toBeTruthy();
  return parsed!.access_token!;
}

async function expectStatus(response: Awaited<ReturnType<APIRequestContext["get"]>>, status: number) {
  expect(response.status(), await response.text()).toBe(status);
}

test("real mail, identity setup, consent renewal and revocation", async ({ page, request }) => {
  test.setTimeout(420_000);
  const stamp = `${Date.now()}${Math.floor(Math.random() * 1_000)}`;
  const managerEmail = `practice-manager-live-${stamp}@local.test`;
  const sentAfter = Date.now() - 5_000;
  const doctorToken = await passwordToken(page, request);
  const mine = await request.get(`${API}/clinics/mine`, { headers: bearer(doctorToken) });
  await expectStatus(mine, 200);
  const clinic = ((await mine.json()) as ClinicSummary[]).find(value => value.relation === "OWNER");
  expect(clinic).toBeTruthy();

  const existing = await request.get(`${API}/clinics/${clinic!.practitionerId}`, { headers: bearer(doctorToken) });
  await expectStatus(existing, 200);
  for (const pending of ((await existing.json()) as { managers: (ManagerView & { name: string })[] }).managers
    .filter(value => value.status === "INVITED" && value.name === "Practice Manager Live")) {
    const cancelled = await request.post(`${API}/clinics/${clinic!.practitionerId}/invitations/${pending.id}/cancel`, {
      headers: bearer(doctorToken), data: { expectedVersion: pending.version },
    });
    await expectStatus(cancelled, 200);
  }

  const invited = await request.post(`${API}/clinics/${clinic!.practitionerId}/managers`, {
    headers: bearer(doctorToken), data: { name: "Practice Manager Live", email: managerEmail, permissions: ["SCHEDULE"], locale: "en" },
  });
  await expectStatus(invited, 200);

  const setupMail = await expectMail(request, managerEmail, sentAfter, /login-actions\/action-token/);
  const setupLink = linkFrom(setupMail, /https?:\/\/[^\s"<>]+login-actions\/action-token[^\s"<>]*/);
  const invitationMail = await expectMail(request, managerEmail, sentAfter, /Practice Manager invitation from/);
  const invitationLink = linkFrom(invitationMail, /https?:\/\/[^\s"<>]+\/portal\/virtual-clinic\/invitations\?token=[^\s"<>]*/);

  const { secret, enrollmentCounter } = await completeAccountSetup(page, setupLink);
  const managerContext = await page.context().browser()!.newContext();
  const managerPage = await managerContext.newPage();
  await signInManager(managerPage, managerEmail, secret, enrollmentCounter, invitationLink);
  await expect(managerPage.getByText("This delegation grants no access to patients, cases, documents, messages, tasks, referrals, credential decisions, or clinical information.")).toBeVisible();
  await expect(managerPage.getByText("SCHEDULE", { exact: true })).toBeVisible();
  await managerPage.getByRole("button", { name: "Accept delegation" }).click();
  await expect(managerPage.getByRole("heading", { name: "Delegation accepted" })).toBeVisible();

  const managerToken = await accessToken(managerPage);
  const managerClinics = await request.get(`${API}/clinics/mine`, { headers: bearer(managerToken) });
  await expectStatus(managerClinics, 200);
  expect(await managerClinics.json()).toEqual(expect.arrayContaining([
    expect.objectContaining({ practitionerId: clinic!.practitionerId, relation: "PRACTICE_MANAGER", permissions: ["SCHEDULE"] }),
  ]));
  await expectStatus(await request.get(`${API}/doctor/cases/00000000-0000-0000-0000-000000000001`, { headers: bearer(managerToken) }), 403);

  const clinicView = await request.get(`${API}/clinics/${clinic!.practitionerId}`, { headers: bearer(doctorToken) });
  await expectStatus(clinicView, 200);
  let manager = ((await clinicView.json()) as { managers: ManagerView[] }).managers.find(value => value.status === "ACTIVE")!;
  const renewalAt = Date.now() - 5_000;
  const widened = await request.put(`${API}/clinics/${clinic!.practitionerId}/managers/${manager.id}`, {
    headers: bearer(doctorToken), data: { permissions: ["SCHEDULE", "PROFILE"], active: true, expectedVersion: manager.version },
  });
  await expectStatus(widened, 200);
  expect(await widened.json()).toMatchObject({ permissions: ["SCHEDULE"], pendingPermissions: ["PROFILE", "SCHEDULE"] });
  const beforeRenewal = await request.get(`${API}/clinics/mine`, { headers: bearer(managerToken) });
  expect(await beforeRenewal.json()).toEqual(expect.arrayContaining([expect.objectContaining({ permissions: ["SCHEDULE"] })]));

  const renewalMail = await expectMail(request, managerEmail, renewalAt, /Practice Manager invitation from/);
  const renewalLink = linkFrom(renewalMail, /https?:\/\/[^\s"<>]+\/portal\/virtual-clinic\/invitations\?token=[^\s"<>]*/);
  await managerPage.goto(renewalLink);
  await expect(managerPage.getByText("PROFILE", { exact: true })).toBeVisible();
  await managerPage.getByRole("button", { name: "Accept delegation" }).click();
  await expect(managerPage.getByRole("heading", { name: "Delegation accepted" })).toBeVisible();
  const afterRenewal = await request.get(`${API}/clinics/mine`, { headers: bearer(managerToken) });
  expect(await afterRenewal.json()).toEqual(expect.arrayContaining([
    expect.objectContaining({ permissions: ["PROFILE", "SCHEDULE"] }),
  ]));

  const refreshedClinic = await request.get(`${API}/clinics/${clinic!.practitionerId}`, { headers: bearer(doctorToken) });
  manager = ((await refreshedClinic.json()) as { managers: ManagerView[] }).managers.find(value => value.id === manager.id)!;
  const revoked = await request.put(`${API}/clinics/${clinic!.practitionerId}/managers/${manager.id}`, {
    headers: bearer(doctorToken), data: { permissions: manager.permissions, active: false, expectedVersion: manager.version },
  });
  await expectStatus(revoked, 200);
  expect(await revoked.json()).toMatchObject({ status: "REVOKED" });
  await expectStatus(await request.get(`${API}/clinics/${clinic!.practitionerId}`, { headers: bearer(managerToken) }), 403);
  await managerContext.close();
});
