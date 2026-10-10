import { createHmac } from "node:crypto";
import { mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Page } from "@playwright/test";

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
    const keycloak = new URL(OIDC_AUTHORITY).origin;
    for (let attempt = 0; attempt < 6 && new URL(page.url()).origin === keycloak; attempt++) {
      await page.waitForLoadState("domcontentloaded");
      const manual = page.getByRole("link", { name: "Unable to scan?" });
      const otp = page.locator("#otp");
      await Promise.race([
        manual.waitFor({ timeout: 10_000 }), otp.waitFor({ timeout: 10_000 }),
        page.waitForURL(url => url.origin !== keycloak, { timeout: 10_000 }),
      ]).catch(() => undefined);
      if (new URL(page.url()).origin !== keycloak) break;
      if (await manual.isVisible()) {
        await manual.click();
        const secret = (await page.locator("#kc-totp-secret-key").innerText()).replace(/\s+/g, "");
        writeFileSync(file(user, "totp"), secret);
        await page.locator("#totp").fill(await freshCode(user, secret));
        await page.locator("#userLabel").fill("Playwright live e2e");
        await page.getByRole("button", { name: "Submit" }).click();
      } else if (await otp.isVisible()) {
        const secret = secretFor(user);
        if (!secret) throw new Error(`Keycloak asks ${user} for an authenticator code but no secret is known: set ${user.toUpperCase()}_TOTP_SECRET, or remove ${user}'s OTP credential in Keycloak so the next run enrols again`);
        await otp.fill(await freshCode(user, secret));
        await page.locator("#kc-login").click();
      }
    }
  });
}
