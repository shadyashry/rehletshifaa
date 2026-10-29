import { createHmac } from "node:crypto";
import { mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Browser, Page } from "@playwright/test";

import { OIDC_AUTHORITY } from "./env";

/**
 * Keycloak sign-in for the live specs, including the step-up the backend asks of sensitive actions
 * (`REAUTHENTICATION_REQUIRED` unless the token's `acr` is an MFA level). The QA identities whose journey
 * steps are step-up permissions (a consultant's clinical decision, Finance settling a deposit) sign in at
 * LoA 2 from the start, as the portal itself would after asking them to sign in again.
 *
 * The first LoA 2 sign-in makes Keycloak enrol an authenticator: the helper reads the generated secret and
 * keeps it under `frontend/.e2e/mfa/` (git-ignored), so later runs answer the code challenge with it.
 * `<USER>_TOTP_SECRET` overrides the file. Sign-ins for one identity are serialised across workers so an
 * enrolment never happens twice and a one-time code is never reused inside its 30-second step.
 */
export const STEP_UP_USERS = new Set(["doctor", "finance"]);

const STATE_DIR = join(__dirname, "..", ".e2e", "mfa");
const STEP_MS = 30_000;

export function totp(secret: string, now = Date.now()) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  for (const character of secret.replace(/\s+/g, "").toUpperCase()) bits += alphabet.indexOf(character).toString(2).padStart(5, "0");
  const key = Buffer.from(bits.match(/.{8}/g)?.map(byte => Number.parseInt(byte, 2)) ?? []);
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(now / STEP_MS)));
  const digest = createHmac("sha1", key).update(counter).digest();
  const offset = digest[digest.length - 1] & 0x0f;
  return ((digest.readUInt32BE(offset) & 0x7fffffff) % 1_000_000).toString().padStart(6, "0");
}

const file = (user: string, name: string) => join(STATE_DIR, `${user}.${name}`);
const read = (path: string) => { try { return readFileSync(path, "utf8").trim(); } catch { return undefined; } };
const secretFor = (user: string) => process.env[`${user.toUpperCase()}_TOTP_SECRET`] ?? read(file(user, "totp"));

async function withLock<T>(user: string, work: () => Promise<T>): Promise<T> {
  mkdirSync(STATE_DIR, { recursive: true });
  const lock = file(user, "lock");
  for (let waited = 0; ; waited += 250) {
    try { mkdirSync(lock); break; } catch {
      // A lock left by a crashed worker is stale after two minutes.
      try { if (Date.now() - statSync(lock).mtimeMs > 120_000) rmSync(lock, { recursive: true, force: true }); } catch { /* already gone */ }
      if (waited > 180_000) throw new Error(`Timed out waiting for the ${user} sign-in lock`);
      await new Promise(resolve => setTimeout(resolve, 250));
    }
  }
  try { return await work(); } finally { rmSync(lock, { recursive: true, force: true }); }
}

/** A code for a step this identity has not used yet (Keycloak refuses a reused code). */
async function freshCode(user: string, secret: string) {
  const last = Number(read(file(user, "last-step")) ?? -1);
  while (Math.floor(Date.now() / STEP_MS) <= last) await new Promise(resolve => setTimeout(resolve, 500));
  writeFileSync(file(user, "last-step"), String(Math.floor(Date.now() / STEP_MS)));
  return totp(secret);
}

/**
 * Privileged roles (Finance, credentialing, administration) confirm sensitive actions with a passkey (acr 3, amr hwk). The
 * live specs use Chrome's virtual authenticator for them; its credential (private key and signature counter) is kept beside
 * the TOTP secret and saved again after every sign-in, so later runs sign in with the same passkey.
 */
export const PASSKEY_USERS = new Set(["finance", "credential-admin"]);

export async function attachPasskey(page: Page, user: string) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("WebAuthn.enable");
  const { authenticatorId } = await cdp.send("WebAuthn.addVirtualAuthenticator", { options: {
    protocol: "ctap2", transport: "internal", hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true } });
  const saved = read(file(user, "passkey"));
  // getCredentials leaves the relying party out of non-resident credentials; it is the identity provider's host.
  const rpId = new URL(OIDC_AUTHORITY).hostname;
  if (saved) for (const credential of JSON.parse(saved)) await cdp.send("WebAuthn.addCredential", { authenticatorId, credential: { rpId, ...credential } });
  // Keycloak asks for a label for a new passkey in a browser prompt.
  page.on("dialog", dialog => void dialog.accept("Playwright live e2e").catch(() => undefined));
  return {
    registered: () => !!saved,
    save: async () => {
      const { credentials } = await cdp.send("WebAuthn.getCredentials", { authenticatorId });
      if (credentials.length) writeFileSync(file(user, "passkey"), JSON.stringify(credentials));
    },
  };
}

/**
 * For a passkey role: registers the passkey once, in a sign-in of its own through the portal's "Sign in securely", then
 * attaches the authenticator to `page` for the sign-in that follows. Call before that sign-in starts and `save()` the
 * result once it has finished (the signature counter moves). Null for every other role.
 */
export async function preparePasskey(browser: Browser, page: Page, user: string, password: string) {
  if (!PASSKEY_USERS.has(user)) return null;
  if (!read(file(user, "passkey"))) {
    const enrolment = await browser.newContext();
    const first = await enrolment.newPage();
    const passkey = await attachPasskey(first, user);
    await requestPasskeyRegistration(first);
    await first.goto("/en/portal");
    await first.getByRole("button", { name: /Sign in securely/ }).click();
    await first.waitForURL(url => url.toString().startsWith(OIDC_AUTHORITY), { timeout: 30_000 });
    await submitKeycloakSignIn(first, user, password);
    await first.waitForURL(/\/(en|ar)\/portal/, { timeout: 30_000 });
    await passkey.save();
    await enrolment.close();
  }
  return attachPasskey(page, user);
}

/** Make this page's next sign-in also register a passkey (Keycloak's webauthn-register action), as "Set up a passkey" does. */
export async function requestPasskeyRegistration(page: Page) {
  await page.route(`${OIDC_AUTHORITY}/protocol/openid-connect/auth?**`, route => {
    const url = new URL(route.request().url());
    url.searchParams.set("kc_action", "webauthn-register");
    return route.continue({ url: url.toString() });
  });
}

/** Ask Keycloak for LoA 2 on this page's next sign-in. Call before the portal starts the redirect. */
export async function requestStepUp(page: Page) {
  await page.route(`${OIDC_AUTHORITY}/protocol/openid-connect/auth?**`, route => {
    const url = new URL(route.request().url());
    url.searchParams.set("acr_values", "2");
    return route.continue({ url: url.toString() });
  });
}

/**
 * On the Keycloak login page: submit the password, then enrol or answer the authenticator if Keycloak asks,
 * and return once the browser has left Keycloak.
 */
export async function submitKeycloakSignIn(page: Page, user: string, password: string) {
  await withLock(user, async () => {
    await page.locator("#username").fill(user);
    await page.locator("#password").fill(password);
    await page.locator("#kc-login").click();
    await completeKeycloakSteps(page, user);
  });
}

/**
 * Answers what Keycloak asks next — enrol the authenticator app, its code, a passkey, or (with {@code newPassword}, after a
 * reset or an account-setup link) the new password — until the browser has left Keycloak or nothing more is asked.
 */
export async function completeKeycloakSteps(page: Page, user: string, newPassword?: string) {
  {
    const keycloak = new URL(OIDC_AUTHORITY).origin;
    for (let attempt = 0; attempt < 6 && new URL(page.url()).origin === keycloak; attempt++) {
      await page.waitForLoadState("domcontentloaded");
      // The RehletShifaa login theme words these in its own (and the reader's) language: find them by id, not by text.
      const manual = page.locator("#mode-manual");
      const otp = page.locator("#otp");
      const passkey = page.locator("#authenticateWebAuthnButton");
      const registerPasskey = page.locator("#registerWebAuthn");
      const passwordNew = page.locator("#password-new");
      const infoNext = page.locator("#kc-info-next");
      await Promise.race([
        manual.waitFor({ timeout: 10_000 }), otp.waitFor({ timeout: 10_000 }),
        passkey.waitFor({ timeout: 10_000 }), registerPasskey.waitFor({ timeout: 10_000 }),
        passwordNew.waitFor({ timeout: 10_000 }), infoNext.waitFor({ timeout: 10_000 }),
        page.waitForURL(url => url.origin !== keycloak, { timeout: 10_000 }),
      ]).catch(() => undefined);
      if (new URL(page.url()).origin !== keycloak) break;
      if (newPassword && await passwordNew.isVisible()) {
        await passwordNew.fill(newPassword);
        await page.locator("#password-confirm").fill(newPassword);
        await page.locator("input[type=submit], button[type=submit]").first().click();
      } else if (await infoNext.isVisible()) {
        if (!newPassword) break; // an information page ends a sign-in; after a reset it leads on to the next step
        await infoNext.click();
      } else if (await registerPasskey.isVisible()) {
        await registerPasskey.click();
        await page.waitForURL(url => !url.toString().includes("required-action") || url.origin !== keycloak, { timeout: 15_000 }).catch(() => undefined);
      } else if (await passkey.isVisible()) {
        await passkey.click();
        await page.waitForURL(url => url.origin !== keycloak, { timeout: 15_000 }).catch(() => undefined);
      } else if (await manual.isVisible()) {
        await manual.click();
        const secret = (await page.locator("#kc-totp-secret-key").innerText()).replace(/\s+/g, "");
        writeFileSync(file(user, "totp"), secret);
        await page.locator("#totp").fill(await freshCode(user, secret));
        await page.locator("#userLabel").fill("Playwright live e2e");
        await page.locator('#kc-totp-settings-form [type="submit"]').first().click();
      } else if (await otp.isVisible() && PASSKEY_USERS.has(user) && read(file(user, "passkey"))) {
        // Keycloak offers the first factor the account enrolled (the app code); a passkey role confirms with its passkey.
        await page.locator("#try-another-way").click();
        await page.locator("#kc-select-credential-form").getByRole("button", { name: /passkey|security key/i }).first().click();
      } else if (await otp.isVisible()) {
        const secret = secretFor(user);
        if (!secret) throw new Error(`Keycloak asks ${user} for an authenticator code but no secret is known: set ${user.toUpperCase()}_TOTP_SECRET, or remove ${user}'s OTP credential in Keycloak so the next run enrols again`);
        await otp.fill(await freshCode(user, secret));
        await page.locator("#kc-login").click();
      }
    }
  }
}
