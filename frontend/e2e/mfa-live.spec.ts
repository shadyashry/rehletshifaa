import { createHash, createHmac, randomBytes } from "node:crypto";
import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

import { API, OIDC_AUTHORITY } from "./env";

const ADMIN_PASSWORD = process.env.ADMIN_TEST_PASSWORD;
const ADMIN_USERNAME = process.env.ADMIN_TEST_USERNAME ?? "credential-admin";
const CLIENT_ID = "rehletshifaa-web";
const BASE = (process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3100").replace(/\/+$/, "");
const REDIRECT_URI = `${BASE}/__oauth-capture`;
const ADMIN_SUBJECT = "00000000-0000-0000-0000-000000000106";
let enrolledTotpSecret: string | undefined;

test.skip(!ADMIN_PASSWORD, "ADMIN_TEST_PASSWORD is required for the live authentication-strength check");

type Claims = {
  sub: string;
  iss?: string;
  aud?: string | string[];
  azp?: string;
  acr?: string;
  auth_time?: number;
};

const base64url = (value: Buffer) => value.toString("base64url");
const claims = (token: string) => JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString()) as Claims;

function totp(secret: string, now = Date.now()) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  for (const character of secret.replace(/\s+/g, "").toUpperCase()) bits += alphabet.indexOf(character).toString(2).padStart(5, "0");
  const key = Buffer.from(bits.match(/.{8}/g)?.map(byte => Number.parseInt(byte, 2)) ?? []);
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(now / 30_000)));
  const digest = createHmac("sha1", key).update(counter).digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const binary = (digest.readUInt32BE(offset) & 0x7fffffff) % 1_000_000;
  return binary.toString().padStart(6, "0");
}

async function completeTotpEnrollment(page: Page) {
  const manual = page.getByRole("link", { name: "Unable to scan?" });
  if (!await manual.isVisible()) return;
  await manual.click();
  const secret = (await page.locator("#kc-totp-secret-key").innerText()).trim();
  enrolledTotpSecret = secret;
  await page.locator("#totp").fill(totp(secret));
  await page.locator("#userLabel").fill("Playwright G1 evidence");
  await page.getByRole("button", { name: "Submit" }).click();
}

async function completeTotpChallenge(page: Page) {
  const otp = page.locator("#otp");
  if (!await otp.isVisible()) return;
  if (!enrolledTotpSecret) throw new Error("TOTP challenge appeared before this evidence run enrolled a credential");
  await otp.fill(totp(enrolledTotpSecret));
  await page.locator("#kc-login").click();
}

async function completePasskeyEnrollment(page: Page) {
  const register = page.getByRole("button", { name: "Register" });
  if (!await register.isVisible()) return;
  await page.waitForLoadState("networkidle");
  const errors: string[] = [];
  page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
  page.on("pageerror", error => errors.push(error.message));
  await register.click();
  await page.waitForTimeout(3000);
  if (await register.isVisible()) {
    const markup = await register.evaluate(element => ({
      button: element.outerHTML,
      form: { id: element.closest("form")?.id, action: element.closest("form")?.getAttribute("action"), method: element.closest("form")?.getAttribute("method") },
      scripts: Array.from(document.scripts).map(script => script.src).filter(Boolean),
      inlineScripts: Array.from(document.scripts).filter(script => !script.src).map(script => ({ type: script.type, length: script.textContent?.length ?? 0, start: script.textContent?.trim().slice(0, 120) })),
    }));
    throw new Error(`WebAuthn registration did not complete: ${errors.join(" | ") || "no browser error reported"}; ${JSON.stringify(markup)}`);
  }
}

async function completePasskeyChallenge(page: Page) {
  const authenticate = page.locator("#authenticateWebAuthnButton");
  if (!await authenticate.isVisible()) return;
  await page.waitForLoadState("networkidle");
  await authenticate.click();
}

const callbackReached = (page: Page) => {
  const url = new URL(page.url());
  return url.origin === new URL(BASE).origin && url.pathname === "/__oauth-capture" && url.searchParams.has("code");
};

async function completeAuthenticationSteps(page: Page) {
  for (let attempt = 0; attempt < 200 && !callbackReached(page); attempt++) {
    await completeTotpEnrollment(page);
    await completeTotpChallenge(page);
    await completePasskeyEnrollment(page);
    await completePasskeyChallenge(page);
    if (!callbackReached(page)) await page.waitForTimeout(100);
  }
}

async function enableVirtualPasskey(page: Page) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("WebAuthn.enable");
  const { authenticatorId } = await cdp.send("WebAuthn.addVirtualAuthenticator", { options: {
    protocol: "ctap2",
    transport: "usb",
    hasResidentKey: true,
    hasUserVerification: true,
    isUserVerified: true,
    automaticPresenceSimulation: true,
  } });
  await cdp.send("WebAuthn.setAutomaticPresenceSimulation", { authenticatorId, enabled: true });
  await cdp.send("WebAuthn.setUserVerified", { authenticatorId, isUserVerified: true });
}

async function authorize(page: Page, request: APIRequestContext, acr?: string) {
  const verifier = base64url(randomBytes(32));
  const challenge = base64url(createHash("sha256").update(verifier).digest());
  const query = new URLSearchParams({
    client_id: CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    response_type: "code",
    scope: "openid profile email",
    state: base64url(randomBytes(16)),
    code_challenge: challenge,
    code_challenge_method: "S256",
    prompt: "login",
    max_age: "0",
  });
  if (acr) query.set("acr_values", acr);

  await page.goto(`${OIDC_AUTHORITY}/protocol/openid-connect/auth?${query}`);
  if (await page.locator("#username").isVisible()) {
    await page.locator("#username").fill(ADMIN_USERNAME);
  }
  await page.locator("#password").fill(ADMIN_PASSWORD!);
  await page.locator("#kc-login").click();
  await completeAuthenticationSteps(page);
  await page.waitForURL(url => url.origin === new URL(BASE).origin && url.pathname === "/__oauth-capture" && url.searchParams.has("code"), { timeout: 30000 });
  const code = new URL(page.url()).searchParams.get("code");
  expect(code).toBeTruthy();

  const response = await request.post(`${OIDC_AUTHORITY}/protocol/openid-connect/token`, { form: {
    grant_type: "authorization_code",
    client_id: CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    code: code!,
    code_verifier: verifier,
  } });
  expect(response.status(), await response.text()).toBe(200);
  const token = ((await response.json()) as { access_token: string }).access_token;
  return { token, claims: claims(token) };
}

const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

test("live LoA 1/2/3 enforcement and reconciliation evidence", async ({ page, request }) => {
  test.setTimeout(180000);
  await enableVirtualPasskey(page);

  const password = await authorize(page, request);
  expect(password.claims).toMatchObject({ sub: ADMIN_SUBJECT, iss: OIDC_AUTHORITY, acr: "1", azp: CLIENT_ID });
  expect(Array.isArray(password.claims.aud) ? password.claims.aud : [password.claims.aud]).toContain("rehletshifaa-api");
  expect(password.claims.auth_time).toEqual(expect.any(Number));

  const me = await request.get(`${API}/me`, { headers: bearer(password.token) });
  expect(me.status(), `${me.headers()["www-authenticate"] ?? "no WWW-Authenticate detail"}\n${await me.text()}`).toBe(200);

  const reconciliationBody = { postRestore: false, reason: "Live G1 and IDO-06 evidence" };
  const passwordDenied = await request.post(`${API}/admin/identity-reconciliation`, { headers: bearer(password.token), data: reconciliationBody });
  expect(passwordDenied.status()).toBe(401);
  expect((await passwordDenied.json()).code).toBe("REAUTHENTICATION_REQUIRED");

  const mfa = await authorize(page, request, "2");
  expect(mfa.claims.acr).toBe("2");
  const mfaDenied = await request.post(`${API}/admin/identity-reconciliation`, { headers: bearer(mfa.token), data: reconciliationBody });
  expect(mfaDenied.status()).toBe(401);
  expect((await mfaDenied.json()).code).toBe("REAUTHENTICATION_REQUIRED");

  const phishingResistant = await authorize(page, request, "3");
  expect(phishingResistant.claims.acr).toBe("3");
  const manual = await request.post(`${API}/admin/identity-reconciliation`, { headers: bearer(phishingResistant.token), data: reconciliationBody });
  expect(manual.status(), await manual.text()).toBe(200);
  const manualRun = (await manual.json()) as { id: string; status: string; checkedCount: number; discrepancyCount: number };
  expect(manualRun).toMatchObject({ status: "DISCREPANCIES", checkedCount: 5, discrepancyCount: 4 });

  const discrepancies = await request.get(`${API}/admin/identity-reconciliation/${manualRun.id}/discrepancies`, { headers: bearer(phishingResistant.token) });
  expect(discrepancies.status(), await discrepancies.text()).toBe(200);
  const findings = (await discrepancies.json()) as { subject: string; type: string }[];
  expect(findings).toHaveLength(4);
  expect(findings.every(finding => finding.type === "MFA_NOT_ENROLLED")).toBe(true);
  expect(findings).not.toContainEqual(expect.objectContaining({ subject: ADMIN_SUBJECT }));
  expect(findings).not.toContainEqual(expect.objectContaining({ type: "IDENTITY_NOT_FOUND" }));

  const postRestore = await request.post(`${API}/admin/identity-reconciliation`, { headers: bearer(phishingResistant.token), data: {
    postRestore: true,
    reason: "Post-Keycloak-recreation IDO-06 evidence",
  } });
  expect(postRestore.status(), await postRestore.text()).toBe(200);
  expect(await postRestore.json()).toMatchObject({
    trigger: "POST_RESTORE",
    status: "DISCREPANCIES",
    checkedCount: 5,
    discrepancyCount: 4,
  });
});
