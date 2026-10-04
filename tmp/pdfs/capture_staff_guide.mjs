import { chromium } from "../../frontend/node_modules/@playwright/test/index.mjs";
import { createHash, createHmac, randomBytes } from "node:crypto";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";

const BASE = "https://dev.rehletshifaa.com";
const AUTHORITY = "https://auth-dev.rehletshifaa.com/realms/rehletshifaa";
const CLIENT_ID = "rehletshifaa-web";
const REDIRECT_URI = `${BASE}/__oauth-capture`;
const OUTPUT = resolve(process.cwd(), "../tmp/pdfs/screens");
const username = process.env.STAFF_GUIDE_USERNAME;
const password = process.env.STAFF_GUIDE_PASSWORD;
const subject = process.env.STAFF_GUIDE_SUBJECT;
if (!username || !password || !subject) throw new Error("Missing STAFF_GUIDE_* environment values");
mkdirSync(OUTPUT, { recursive: true });

const b64 = value => value.toString("base64url");
const decode = token => JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString());

function totp(secret, now = Date.now()) {
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

async function virtualPasskey(page) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("WebAuthn.enable");
  const { authenticatorId } = await cdp.send("WebAuthn.addVirtualAuthenticator", { options: {
    protocol: "ctap2", transport: "usb", hasResidentKey: true, hasUserVerification: true,
    isUserVerified: true, automaticPresenceSimulation: true,
  } });
  await cdp.send("WebAuthn.setAutomaticPresenceSimulation", { authenticatorId, enabled: true });
  await cdp.send("WebAuthn.setUserVerified", { authenticatorId, isUserVerified: true });
}

const callback = page => {
  const url = new URL(page.url());
  return url.origin === new URL(BASE).origin && url.pathname === "/__oauth-capture" && url.searchParams.has("code");
};

async function finishSteps(page, secret) {
  for (let attempt = 0; attempt < 200 && !callback(page); attempt++) {
    const manual = page.getByRole("link", { name: "Unable to scan?" });
    if (await manual.isVisible()) {
      await manual.click();
      secret.value = (await page.locator("#kc-totp-secret-key").innerText()).trim();
      await page.locator("#totp").fill(totp(secret.value));
      await page.locator("#userLabel").fill("Staff guide capture");
      await page.getByRole("button", { name: "Submit" }).click();
    }
    const otp = page.locator("#otp");
    if (await otp.isVisible()) {
      if (!secret.value) throw new Error("Unexpected OTP challenge before enrollment");
      await otp.fill(totp(secret.value));
      await page.locator("#kc-login").click();
    }
    const register = page.getByRole("button", { name: "Register" });
    if (await register.isVisible()) {
      await page.waitForLoadState("networkidle");
      await register.click();
    }
    const authenticate = page.locator("#authenticateWebAuthnButton");
    if (await authenticate.isVisible()) {
      await page.waitForLoadState("networkidle");
      await authenticate.click();
    }
    if (!callback(page)) await page.waitForTimeout(100);
  }
}

async function authorize(page, request, secret, acr) {
  await page.context().clearCookies();
  const verifier = b64(randomBytes(32));
  const challenge = b64(createHash("sha256").update(verifier).digest());
  const query = new URLSearchParams({
    client_id: CLIENT_ID, redirect_uri: REDIRECT_URI, response_type: "code", scope: "openid profile email",
    state: b64(randomBytes(16)), code_challenge: challenge, code_challenge_method: "S256", prompt: "login",
    max_age: "0", acr_values: acr,
  });
  await page.goto(`${AUTHORITY}/protocol/openid-connect/auth?${query}`);
  if (await page.locator("#username").isVisible()) await page.locator("#username").fill(username);
  await page.locator("#password").fill(password);
  await page.locator("#kc-login").click();
  await finishSteps(page, secret);
  await page.waitForURL(url => callback(page), { timeout: 30_000 });
  const code = new URL(page.url()).searchParams.get("code");
  const response = await request.post(`${AUTHORITY}/protocol/openid-connect/token`, { form: {
    grant_type: "authorization_code", client_id: CLIENT_ID, redirect_uri: REDIRECT_URI, code, code_verifier: verifier,
  } });
  if (!response.ok()) throw new Error(`Token exchange failed: ${response.status()} ${await response.text()}`);
  const tokens = await response.json();
  const claims = decode(tokens.access_token);
  if (claims.sub !== subject || claims.acr !== acr) throw new Error(`Unexpected token claims ${claims.sub}/${claims.acr}`);
  return { ...tokens, claims };
}

async function stable(page, path) {
  await page.goto(`${BASE}${path}`, { waitUntil: "networkidle" });
  await page.locator("h1").first().waitFor({ state: "visible", timeout: 30_000 });
  await page.waitForTimeout(600);
}

async function shot(page, name) {
  await page.screenshot({ path: resolve(OUTPUT, `${name}.png`), fullPage: false });
}

const browser = await chromium.launch({ headless: true });
try {
  const authContext = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const authPage = await authContext.newPage();
  await virtualPasskey(authPage);
  const secret = {};
  await authorize(authPage, authContext.request, secret, "2");
  const tokens = await authorize(authPage, authContext.request, secret, "3");

  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1.25 });
  await context.addInitScript(({ authority, tokens, claims }) => {
    sessionStorage.setItem(`oidc.user:${authority}:rehletshifaa-web`, JSON.stringify({
      access_token: tokens.access_token, refresh_token: tokens.refresh_token, id_token: tokens.id_token,
      token_type: tokens.token_type ?? "Bearer", scope: tokens.scope ?? "openid profile email",
      profile: claims, expires_at: claims.exp,
    }));
  }, { authority: AUTHORITY, tokens, claims: tokens.claims });
  const page = await context.newPage();

  await stable(page, "/en/portal/control-center");
  await shot(page, "01-control-center-home");

  await stable(page, "/en/portal/control-center/people");
  await shot(page, "02-people");
  await page.getByRole("button", { name: "Invite person" }).click();
  await page.getByRole("dialog").waitFor();
  await shot(page, "03-invite-person");

  await stable(page, "/en/portal/control-center/people");
  const changeRoles = page.getByRole("button", { name: "Change roles" }).first();
  if (await changeRoles.isVisible()) {
    await changeRoles.click();
    await page.getByRole("dialog").waitFor();
    await shot(page, "04-change-roles");
  }

  await stable(page, "/en/portal/control-center/teams");
  await shot(page, "05-teams");
  const newTeam = page.getByRole("button", { name: "New team" });
  if (await newTeam.isVisible()) {
    await newTeam.click();
    await page.getByRole("dialog").waitFor();
    await shot(page, "06-new-team");
  }

  await stable(page, "/en/portal/control-center/staffing-requests");
  await shot(page, "07-staffing-requests");
  const newRequest = page.getByRole("button", { name: "New request" });
  if (await newRequest.isVisible()) {
    await newRequest.click();
    await page.getByRole("dialog").waitFor();
    await shot(page, "08-new-staffing-request");
  }

  await stable(page, "/en/portal/control-center/administrators");
  await shot(page, "09-administrators");
  await page.getByRole("button", { name: "Request appointment" }).click();
  await page.getByRole("dialog").waitFor();
  await shot(page, "10-request-administrator");

  await stable(page, "/en/portal/control-center/recertification");
  await shot(page, "11-access-reviews");

  await stable(page, "/en/portal/control-center/audit");
  await shot(page, "12-audit");

  await context.close();
  await authContext.close();
} finally {
  await browser.close();
}
