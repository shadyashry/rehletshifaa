import { execFileSync } from "node:child_process";
import { createHash, createHmac, randomBytes } from "node:crypto";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

import { API, OIDC_AUTHORITY } from "./env";

const CLIENT_ID = "rehletshifaa-web";
const BASE = (process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3100").replace(/\/+$/, "");
const REDIRECT_URI = `${BASE}/__oauth-capture`;
const PROJECT_ROOT = resolve(process.cwd(), "..");
const HEALTH_URL = process.env.PLAYWRIGHT_BACKEND_HEALTH_URL ?? "http://localhost:8080/actuator/health";

type EvidenceIdentity = { subject: string; username: string; password: string };
type Claims = { sub: string; acr?: string; auth_time?: number };

const owner = identity("GOVERNANCE_OWNER");
const primary = identity("GOVERNANCE_ADMIN_PRIMARY");
const backup = identity("GOVERNANCE_ADMIN_BACKUP");
const enabled = process.env.GOVERNANCE_BOOTSTRAP_LIVE === "true" && owner && primary && backup;

test.skip(!enabled, "Set GOVERNANCE_BOOTSTRAP_LIVE and the three GOVERNANCE_* identity triplets");

function identity(prefix: string): EvidenceIdentity | undefined {
  const subject = process.env[`${prefix}_SUBJECT`];
  const username = process.env[`${prefix}_USERNAME`];
  const password = process.env[`${prefix}_PASSWORD`];
  return subject && username && password ? { subject, username, password } : undefined;
}

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
  return ((digest.readUInt32BE(offset) & 0x7fffffff) % 1_000_000).toString().padStart(6, "0");
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

const callbackReached = (page: Page) => {
  const url = new URL(page.url());
  return url.origin === new URL(BASE).origin && url.pathname === "/__oauth-capture" && url.searchParams.has("code");
};

async function completeAuthenticationSteps(page: Page, secret: { value?: string }) {
  for (let attempt = 0; attempt < 200 && !callbackReached(page); attempt++) {
    const manual = page.getByRole("link", { name: "Unable to scan?" });
    if (await manual.isVisible()) {
      await manual.click();
      secret.value = (await page.locator("#kc-totp-secret-key").innerText()).trim();
      await page.locator("#totp").fill(totp(secret.value));
      await page.locator("#userLabel").fill("Governance bootstrap evidence");
      await page.getByRole("button", { name: "Submit" }).click();
    }
    const otp = page.locator("#otp");
    if (await otp.isVisible()) {
      if (!secret.value) throw new Error("TOTP challenge appeared before this run enrolled the identity");
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
    if (!callbackReached(page)) await page.waitForTimeout(100);
  }
}

async function authorize(page: Page, request: APIRequestContext, identity: EvidenceIdentity, secret: { value?: string }, acr: string) {
  await page.context().clearCookies();
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
    acr_values: acr,
  });

  await page.goto(`${OIDC_AUTHORITY}/protocol/openid-connect/auth?${query}`);
  if (await page.locator("#username").isVisible()) await page.locator("#username").fill(identity.username);
  await page.locator("#password").fill(identity.password);
  await page.locator("#kc-login").click();
  await completeAuthenticationSteps(page, secret);
  await page.waitForURL(url => callbackReached(page), { timeout: 30_000 });
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
  expect(claims(token)).toMatchObject({ sub: identity.subject, acr });
  return token;
}

function compose(args: string[]) {
  return execFileSync("docker", ["compose", "-f", "docker-compose.yml", "-f", "docker-compose.tunnel.yml", ...args], {
    cwd: PROJECT_ROOT,
    encoding: "utf8",
    stdio: "pipe",
    timeout: 180_000,
  });
}

function startBootstrapBackend(ownerSubject: string, administratorSubjects: string[]) {
  const directory = mkdtempSync(join(tmpdir(), "rehletshifaa-governance-bootstrap-"));
  const override = join(directory, "bootstrap.yml");
  writeFileSync(override, [
    "services:",
    "  backend:",
    "    environment:",
    `      APP_ACCESS_BOOTSTRAP_OWNER_SUBJECT: \"${ownerSubject}\"`,
    `      APP_ACCESS_BOOTSTRAP_SYSTEM_ADMINISTRATOR_SUBJECTS: \"${administratorSubjects.join(",")}\"`,
    "",
  ].join("\n"));
  try {
    execFileSync("docker", ["compose", "-f", "docker-compose.yml", "-f", "docker-compose.tunnel.yml", "-f", override,
      "up", "-d", "--no-deps", "--force-recreate", "backend"], {
      cwd: PROJECT_ROOT,
      encoding: "utf8",
      stdio: "pipe",
      timeout: 180_000,
    });
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

async function waitForBackend(request: APIRequestContext) {
  for (let attempt = 0; attempt < 90; attempt++) {
    try {
      const response = await request.get(HEALTH_URL, { timeout: 2_000 });
      if (response.status() === 200) return;
    } catch { /* backend is still restarting */ }
    await new Promise(resolve => setTimeout(resolve, 1_000));
  }
  throw new Error("Backend did not become healthy after the governance bootstrap restart");
}

const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

test("controlled bootstrap and ordinary owner transfer at live LoA 3", async ({ page, request }) => {
  test.setTimeout(420_000);
  const bootstrapOwner = owner!;
  const firstAdministrator = primary!;
  const secondAdministrator = backup!;
  const secrets = new Map<string, { value?: string }>();
  const secret = (identity: EvidenceIdentity) => {
    const value = secrets.get(identity.subject) ?? {};
    secrets.set(identity.subject, value);
    return value;
  };

  await enableVirtualPasskey(page);
  for (const identity of [bootstrapOwner, firstAdministrator, secondAdministrator]) {
    await authorize(page, request, identity, secret(identity), "2");
  }
  const ownerToken = await authorize(page, request, bootstrapOwner, secret(bootstrapOwner), "3");
  const primaryToken = await authorize(page, request, firstAdministrator, secret(firstAdministrator), "3");
  const backupToken = await authorize(page, request, secondAdministrator, secret(secondAdministrator), "3");

  let backendReconfigured = false;
  try {
    startBootstrapBackend(bootstrapOwner.subject, [firstAdministrator.subject, secondAdministrator.subject]);
    backendReconfigured = true;
    await waitForBackend(request);

    for (const [identity, token] of [[firstAdministrator, primaryToken], [secondAdministrator, backupToken]] as const) {
      const me = await request.get(`${API}/me`, { headers: bearer(token) });
      expect(me.status(), await me.text()).toBe(200);
      expect((await me.json()) as { roles: string[] }).toMatchObject({ roles: expect.arrayContaining(["SYSTEM_ADMINISTRATOR"]) });
      expect(claims(token).sub).toBe(identity.subject);
    }

    const initiated = await request.post(`${API}/admin/platform-access/owner-transfers`, {
      headers: bearer(ownerToken),
      data: { incomingOwnerSubject: firstAdministrator.subject, reason: "Live controlled handover rehearsal" },
    });
    expect(initiated.status(), await initiated.text()).toBe(200);
    const transfer = (await initiated.json()) as { id: string; status: string; revision: number };
    expect(transfer).toMatchObject({ status: "PENDING_ACCEPTANCE", revision: 0 });

    const accepted = await request.post(`${API}/admin/platform-access/owner-transfers/${transfer.id}/accept`, {
      headers: bearer(primaryToken),
      data: { revision: transfer.revision, reason: "Accept live ownership rehearsal" },
    });
    expect(accepted.status(), await accepted.text()).toBe(200);
    const acceptedTransfer = (await accepted.json()) as { status: string; revision: number };
    expect(acceptedTransfer).toMatchObject({ status: "PENDING_VERIFICATION", revision: 1 });

    const verified = await request.post(`${API}/admin/platform-access/owner-transfers/${transfer.id}/verify`, {
      headers: bearer(backupToken),
      data: { revision: acceptedTransfer.revision, reason: "Independent live ownership verification" },
    });
    expect(verified.status(), await verified.text()).toBe(200);
    expect(await verified.json()).toMatchObject({ status: "COMPLETED", revision: 2 });

    for (const action of [
      "PLATFORM_GOVERNANCE_BOOTSTRAPPED",
      "PLATFORM_OWNER_TRANSFER_INITIATED",
      "PLATFORM_OWNER_TRANSFER_ACCEPTED",
      "PLATFORM_OWNER_TRANSFER_COMPLETED",
    ]) {
      const audit = await request.get(`${API}/admin/platform-access/audit?action=${action}`, { headers: bearer(backupToken) });
      expect(audit.status(), await audit.text()).toBe(200);
      expect((await audit.json()) as { action: string; outcome: string }[]).toContainEqual(expect.objectContaining({ action, outcome: "SUCCESS" }));
    }
  } finally {
    if (backendReconfigured) {
      compose(["up", "-d", "--no-deps", "--force-recreate", "backend"]);
      await waitForBackend(request);
    }
  }
});
