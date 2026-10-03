import { execFileSync } from "node:child_process";
import { createHash, createHmac, randomBytes } from "node:crypto";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

import { API, OIDC_AUTHORITY } from "./env";

const CLIENT_ID = "rehletshifaa-web";
const BASE = (process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000").replace(/\/+$/, "");
const REDIRECT_URI = `${BASE}/__oauth-capture`;
const PROJECT_ROOT = resolve(process.cwd(), "..");
const HEALTH_URL = process.env.PLAYWRIGHT_BACKEND_HEALTH_URL ?? "http://localhost:8080/actuator/health";
const COMPOSE_PROJECT = process.env.GOVERNANCE_REHEARSAL_COMPOSE_PROJECT ?? "rehletshifaa-owner-governance-rehearsal";
const BACKEND_PORT = process.env.GOVERNANCE_REHEARSAL_BACKEND_PORT ?? "8080";

type EvidenceIdentity = { subject: string; username: string; password: string; name: string; email: string };
type Claims = { sub: string; acr?: string; auth_time?: number };
type Versioned = { id: string; status: string; revision: number };

const owner = identity("GOVERNANCE_OWNER");
const primary = identity("GOVERNANCE_ADMIN_PRIMARY");
const backup = identity("GOVERNANCE_ADMIN_BACKUP");
const successor = identity("GOVERNANCE_OWNER_SUCCESSOR");
const enabled = process.env.OWNER_GOVERNANCE_REHEARSAL_LIVE === "true" && owner && primary && backup && successor;

test.skip(!enabled, "Set OWNER_GOVERNANCE_REHEARSAL_LIVE and all four GOVERNANCE_* identity quintets");

function identity(prefix: string): EvidenceIdentity | undefined {
  const subject = process.env[`${prefix}_SUBJECT`];
  const username = process.env[`${prefix}_USERNAME`];
  const password = process.env[`${prefix}_PASSWORD`];
  const name = process.env[`${prefix}_NAME`];
  const email = process.env[`${prefix}_EMAIL`];
  return subject && username && password && name && email ? { subject, username, password, name, email } : undefined;
}

const base64url = (value: Buffer) => value.toString("base64url");
const claims = (token: string) => JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString()) as Claims;
const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

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
    protocol: "ctap2", transport: "usb", hasResidentKey: true, hasUserVerification: true,
    isUserVerified: true, automaticPresenceSimulation: true,
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
      await page.locator("#userLabel").fill("Owner governance rehearsal");
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

async function authorize(page: Page, request: APIRequestContext, person: EvidenceIdentity, secret: { value?: string }, acr: string) {
  await page.context().clearCookies();
  const verifier = base64url(randomBytes(32));
  const challenge = base64url(createHash("sha256").update(verifier).digest());
  const query = new URLSearchParams({
    client_id: CLIENT_ID, redirect_uri: REDIRECT_URI, response_type: "code", scope: "openid profile email",
    state: base64url(randomBytes(16)), code_challenge: challenge, code_challenge_method: "S256",
    prompt: "login", max_age: "0", acr_values: acr,
  });
  await page.goto(`${OIDC_AUTHORITY}/protocol/openid-connect/auth?${query}`);
  if (await page.locator("#username").isVisible()) await page.locator("#username").fill(person.username);
  await page.locator("#password").fill(person.password);
  await page.locator("#kc-login").click();
  await completeAuthenticationSteps(page, secret);
  await page.waitForURL(url => callbackReached(page), { timeout: 30_000 });
  const code = new URL(page.url()).searchParams.get("code");
  expect(code).toBeTruthy();
  const response = await request.post(`${OIDC_AUTHORITY}/protocol/openid-connect/token`, { form: {
    grant_type: "authorization_code", client_id: CLIENT_ID, redirect_uri: REDIRECT_URI,
    code: code!, code_verifier: verifier,
  } });
  expect(response.status(), await response.text()).toBe(200);
  const token = ((await response.json()) as { access_token: string }).access_token;
  expect(claims(token)).toMatchObject({ sub: person.subject, acr });
  return token;
}

function dockerCompose(args: string[]) {
  return execFileSync("docker", ["compose", "-p", COMPOSE_PROJECT, "-f", "docker-compose.yml", ...args], {
    cwd: PROJECT_ROOT, encoding: "utf8", stdio: "pipe", timeout: 240_000,
  });
}

function reconfigureBackend(environment: Record<string, string>) {
  const directory = mkdtempSync(join(tmpdir(), "rehletshifaa-owner-governance-"));
  const override = join(directory, "backend.yml");
  const values = {
    SPRING_PROFILES_ACTIVE: "rehearsal",
    GOVERNANCE_NOTIFICATION_EMAILS: "security@local.test",
    ...environment,
  };
  writeFileSync(override, [
    "services:", "  backend:",
    ...(BACKEND_PORT === "8080" ? [] : ["    ports: !override", `      - ${JSON.stringify(`${BACKEND_PORT}:8080`)}`]),
    "    environment:",
    ...Object.entries(values).map(([key, value]) => `      ${key}: ${JSON.stringify(value)}`), "",
  ].join("\n"));
  try {
    execFileSync("docker", ["compose", "-p", COMPOSE_PROJECT, "-f", "docker-compose.yml", "-f", override,
      "up", "-d", "--no-deps", "--force-recreate", "backend"], {
      cwd: PROJECT_ROOT, encoding: "utf8", stdio: "pipe", timeout: 240_000,
    });
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

async function waitForBackend(request: APIRequestContext) {
  for (let attempt = 0; attempt < 120; attempt++) {
    try {
      const response = await request.get(HEALTH_URL, { timeout: 2_000 });
      if (response.status() === 200) return;
    } catch { /* restarting */ }
    await new Promise(resolve => setTimeout(resolve, 1_000));
  }
  throw new Error("Backend did not become healthy after governance command restart");
}

async function waitForIdentityProvider(request: APIRequestContext) {
  for (let attempt = 0; attempt < 120; attempt++) {
    try {
      const response = await request.get(`${OIDC_AUTHORITY}/.well-known/openid-configuration`, { timeout: 2_000 });
      if (response.status() === 200) return;
    } catch { /* Keycloak is still importing the clean realm */ }
    await new Promise(resolve => setTimeout(resolve, 1_000));
  }
  throw new Error("Keycloak did not become ready after the clean realm import");
}

function databaseScalar(sql: string) {
  return dockerCompose(["exec", "-T", "postgres", "psql", "-U", "rehletshifaa", "-d", "rehletshifaa", "-Atc", sql]).trim();
}

async function expectStatus(response: Awaited<ReturnType<APIRequestContext["get"]>>, status: number) {
  expect(response.status(), await response.text()).toBe(status);
}

test("commissioning, administrator replacement, owner recovery and normal transfer", async ({ page, request }) => {
  test.setTimeout(720_000);
  const initialOwner = owner!;
  const firstAdministrator = primary!;
  const secondAdministrator = backup!;
  const recoverySuccessor = successor!;
  const people = [initialOwner, firstAdministrator, secondAdministrator, recoverySuccessor];
  const secrets = new Map<string, { value?: string }>();
  const secret = (person: EvidenceIdentity) => {
    const value = secrets.get(person.subject) ?? {};
    secrets.set(person.subject, value);
    return value;
  };

  await waitForIdentityProvider(request);
  await waitForBackend(request);
  await enableVirtualPasskey(page);
  for (const person of people) await authorize(page, request, person, secret(person), "2");
  const ownerToken = await authorize(page, request, initialOwner, secret(initialOwner), "3");
  const primaryToken = await authorize(page, request, firstAdministrator, secret(firstAdministrator), "3");
  const backupToken = await authorize(page, request, secondAdministrator, secret(secondAdministrator), "3");
  const successorToken = await authorize(page, request, recoverySuccessor, secret(recoverySuccessor), "3");

  try {
    reconfigureBackend({
      APP_ACCESS_COMMISSIONING_ACTION: "start",
      APP_ACCESS_COMMISSIONING_OPERATOR: "rehearsal-deployment-operator",
      APP_ACCESS_COMMISSIONING_IDEMPOTENCY_KEY: `owner-governance-${Date.now()}`,
      APP_ACCESS_COMMISSIONING_OWNER_SUBJECT: initialOwner.subject,
      APP_ACCESS_COMMISSIONING_ADMINISTRATOR_SUBJECTS: `${firstAdministrator.subject},${secondAdministrator.subject}`,
      APP_ACCESS_COMMISSIONING_ADMINISTRATOR_NAMES: `${firstAdministrator.name},${secondAdministrator.name}`,
      APP_ACCESS_COMMISSIONING_ADMINISTRATOR_EMAILS: `${firstAdministrator.email},${secondAdministrator.email}`,
      APP_ACCESS_COMMISSIONING_ADMINISTRATOR_LOCALES: "en,en",
      APP_ACCESS_COMMISSIONING_REASON: "Isolated production-equivalent governance commissioning rehearsal",
    });
    await waitForBackend(request);

    const invitationResponse = await request.get(`${API}/governance/commissioning/current-invitation`, { headers: bearer(ownerToken) });
    await expectStatus(invitationResponse, 200);
    const invitation = (await invitationResponse.json()) as { commissioningId: string };
    for (const [token, reason] of [
      [ownerToken, "Accept owner accountability for the isolated rehearsal"],
      [primaryToken, "Accept primary administrator accountability"],
      [backupToken, "Accept backup administrator accountability"],
    ] as const) {
      const accepted = await request.post(`${API}/governance/commissioning/${invitation.commissioningId}/acceptance`, {
        headers: bearer(token), data: { reason },
      });
      await expectStatus(accepted, 200);
    }

    const ownerMe = await request.get(`${API}/me`, { headers: bearer(ownerToken) });
    await expectStatus(ownerMe, 200);
    expect(await ownerMe.json()).toMatchObject({ platformAccountOwner: true, workspaces: expect.arrayContaining(["OWNER"]) });
    const ownerOverview = await request.get(`${API}/owner/overview`, { headers: bearer(ownerToken) });
    await expectStatus(ownerOverview, 200);
    expect(ownerOverview.headers()["cache-control"]).toContain("no-store");
    for (const token of [primaryToken, backupToken]) {
      const me = await request.get(`${API}/me`, { headers: bearer(token) });
      await expectStatus(me, 200);
      expect(await me.json()).toMatchObject({ roles: expect.arrayContaining(["SYSTEM_ADMINISTRATOR"]) });
    }

    const removeAt = new Date().toISOString();
    const removeResponse = await request.post(`${API}/admin/platform-access/administrator-changes`, {
      headers: bearer(primaryToken),
      data: { type: "REMOVE", subject: secondAdministrator.subject, effectiveFrom: removeAt, effectiveTo: null, reason: "Administrator replacement rehearsal" },
    });
    await expectStatus(removeResponse, 200);
    const removal = (await removeResponse.json()) as Versioned;
    const removalApproval = await request.post(`${API}/admin/platform-access/administrator-changes/${removal.id}/approve`, {
      headers: bearer(ownerToken), data: { revision: removal.revision, reason: "Owner approves controlled administrator removal" },
    });
    await expectStatus(removalApproval, 200);
    await expectStatus(await request.get(`${API}/admin/platform-access/administrator-changes`, { headers: bearer(backupToken) }), 403);

    const appointResponse = await request.post(`${API}/admin/platform-access/administrator-changes`, {
      headers: bearer(primaryToken),
      data: { type: "APPOINT", subject: secondAdministrator.subject, effectiveFrom: new Date(Date.now() - 1_000).toISOString(), effectiveTo: null, reason: "Restore the verified backup administrator" },
    });
    await expectStatus(appointResponse, 200);
    const appointment = (await appointResponse.json()) as Versioned;
    const appointmentApproval = await request.post(`${API}/admin/platform-access/administrator-changes/${appointment.id}/approve`, {
      headers: bearer(ownerToken), data: { revision: appointment.revision, reason: "Owner approves verified administrator restoration" },
    });
    await expectStatus(appointmentApproval, 200);
    await expectStatus(await request.get(`${API}/admin/platform-access/administrator-changes`, { headers: bearer(backupToken) }), 200);

    const initiatedResponse = await request.post(`${API}/admin/platform-access/owner-recoveries`, {
      headers: bearer(primaryToken), data: {
        incomingOwnerSubject: recoverySuccessor.subject,
        reason: "Isolated unavailable-owner recovery rehearsal",
        evidenceReference: "sealed-rehearsal-evidence-2026",
        incidentReference: "REHEARSAL-OWNER-001",
      },
    });
    await expectStatus(initiatedResponse, 200);
    const initiated = (await initiatedResponse.json()) as Versioned;
    const confirmationResponse = await request.post(`${API}/admin/platform-access/owner-recoveries/${initiated.id}/confirm`, {
      headers: bearer(backupToken), data: { revision: initiated.revision, reason: "Independent administrator confirms recovery evidence" },
    });
    await expectStatus(confirmationResponse, 200);
    const confirmed = (await confirmationResponse.json()) as Versioned;

    reconfigureBackend({
      APP_OWNER_RECOVERY_COMMAND_ENABLED: "true",
      APP_OWNER_RECOVERY_COMMAND_ACTION: "verify",
      APP_OWNER_RECOVERY_COMMAND_ID: initiated.id,
      APP_OWNER_RECOVERY_COMMAND_REVISION: String(confirmed.revision),
      APP_OWNER_RECOVERY_COMMAND_OPERATOR: "rehearsal-security-operator",
      APP_OWNER_RECOVERY_COMMAND_REASON: "Independent sealed-evidence verification",
      APP_OWNER_RECOVERY_COMMAND_EVIDENCE_REFERENCE: "vault-rehearsal-audit-001",
      APP_OWNER_RECOVERY_COMMAND_WAIVE_COOLING_OFF: "true",
    });
    await waitForBackend(request);
    const verifiedResponse = await request.get(`${API}/admin/platform-access/owner-recoveries/${initiated.id}`, { headers: bearer(primaryToken) });
    await expectStatus(verifiedResponse, 200);
    const verified = (await verifiedResponse.json()) as Versioned;
    expect(verified.status).toBe("PENDING_SUCCESSOR_ACCEPTANCE");

    const successorAcceptance = await request.post(`${API}/admin/platform-access/owner-recoveries/${initiated.id}/accept`, {
      headers: bearer(successorToken), data: { revision: verified.revision, reason: "Accept recovered owner accountability" },
    });
    await expectStatus(successorAcceptance, 200);
    const cooling = (await successorAcceptance.json()) as Versioned;
    expect(cooling.status).toBe("COOLING_OFF");

    reconfigureBackend({
      APP_OWNER_RECOVERY_COMMAND_ENABLED: "true",
      APP_OWNER_RECOVERY_COMMAND_ACTION: "complete",
      APP_OWNER_RECOVERY_COMMAND_ID: initiated.id,
      APP_OWNER_RECOVERY_COMMAND_REVISION: String(cooling.revision),
      APP_OWNER_RECOVERY_COMMAND_OPERATOR: "rehearsal-security-operator",
    });
    await waitForBackend(request);
    await expectStatus(await request.get(`${API}/owner/overview`, { headers: bearer(ownerToken) }), 403);
    await expectStatus(await request.get(`${API}/owner/overview`, { headers: bearer(successorToken) }), 200);

    const transferResponse = await request.post(`${API}/admin/platform-access/owner-transfers`, {
      headers: bearer(successorToken), data: { incomingOwnerSubject: initialOwner.subject, reason: "Return ownership after recovery rehearsal" },
    });
    await expectStatus(transferResponse, 200);
    const transfer = (await transferResponse.json()) as Versioned;
    const transferAcceptance = await request.post(`${API}/admin/platform-access/owner-transfers/${transfer.id}/accept`, {
      headers: bearer(ownerToken), data: { revision: transfer.revision, reason: "Accept normal ownership return" },
    });
    await expectStatus(transferAcceptance, 200);
    const acceptedTransfer = (await transferAcceptance.json()) as Versioned;
    const transferVerification = await request.post(`${API}/admin/platform-access/owner-transfers/${transfer.id}/verify`, {
      headers: bearer(primaryToken), data: { revision: acceptedTransfer.revision, reason: "Independent administrator verifies normal transfer" },
    });
    await expectStatus(transferVerification, 200);
    expect(await transferVerification.json()).toMatchObject({ status: "COMPLETED" });
    await expectStatus(await request.get(`${API}/owner/overview`, { headers: bearer(successorToken) }), 403);
    await expectStatus(await request.get(`${API}/owner/overview`, { headers: bearer(ownerToken) }), 200);

    expect(databaseScalar("SELECT COUNT(*) FROM platform_account_owner_relationships WHERE status='ACTIVE' AND effective_to IS NULL")).toBe("1");
    expect(databaseScalar("SELECT COUNT(*) FROM platform_role_assignments WHERE role_key='SYSTEM_ADMINISTRATOR' AND status='ACTIVE' AND effective_from<=CURRENT_TIMESTAMP AND (effective_to IS NULL OR effective_to>CURRENT_TIMESTAMP)")).toBe("2");
    await expect.poll(() => Number(databaseScalar("SELECT COUNT(*) FROM notification_outbox WHERE notification_type='GOVERNANCE' AND status='DELIVERED'")), { timeout: 30_000 }).toBeGreaterThanOrEqual(10);
  } finally {
    reconfigureBackend({});
    await waitForBackend(request);
  }
});
