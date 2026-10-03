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
const RESTORE_ID = process.env.RESTORE_GATE_ID ?? `live-ops04-${Date.now()}`;

type EvidenceIdentity = { subject: string; username: string; password: string };
type Claims = { sub: string; acr?: string };

const identities = [
  identity("RESTORE_COORDINATOR"),
  identity("RESTORE_COORDINATOR_2"),
  identity("RESTORE_OPERATIONS"),
  identity("RESTORE_FINANCE"),
];
const restoreOperator = identity("RESTORE_OPERATOR");
const enabled = process.env.RESTORE_GATE_LIVE === "true" && restoreOperator && identities.every(Boolean);
const replayOperator = identity("RESTORE_REPLAY_OPERATOR");
const replayEnabled = process.env.RESTORE_REPLAY_LIVE === "true" && replayOperator;

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
  for (const character of secret.replace(/\s+/g, "").toUpperCase()) {
    bits += alphabet.indexOf(character).toString(2).padStart(5, "0");
  }
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
      await page.locator("#userLabel").fill("OPS-04 restore evidence");
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

async function authorize(
  page: Page,
  request: APIRequestContext,
  evidenceIdentity: EvidenceIdentity,
  secret: { value?: string },
  acr: string,
) {
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
  if (await page.locator("#username").isVisible()) await page.locator("#username").fill(evidenceIdentity.username);
  await page.locator("#password").fill(evidenceIdentity.password);
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
  expect(claims(token)).toMatchObject({ sub: evidenceIdentity.subject, acr });
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

function startRestoreBackend(restoreId: string, pauseIdentityWorker = false) {
  const directory = mkdtempSync(join(tmpdir(), "rehletshifaa-restore-gate-"));
  const override = join(directory, "restore.yml");
  writeFileSync(override, [
    "services:",
    "  backend:",
    "    environment:",
    `      APP_IDENTITY_RESTORE_ID: "${restoreId}"`,
    ...(pauseIdentityWorker ? ["      APP_IDENTITY_OPERATIONS_INITIAL_DELAY_MILLISECONDS: \"300000\""] : []),
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

function makeReplayOperationDue() {
  execFileSync("docker", ["compose", "-f", "docker-compose.yml", "-f", "docker-compose.tunnel.yml", "exec", "-T",
    "postgres", "psql", "-U", "rehletshifaa", "-d", "rehletshifaa", "-v", "ON_ERROR_STOP=1", "-c",
    "UPDATE identity_operations SET next_attempt_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP,revision=revision+1 WHERE id='c54df5e1-9769-4ce0-8373-a5c797d9c31d' AND status='PENDING';"], {
    cwd: PROJECT_ROOT,
    encoding: "utf8",
    stdio: "pipe",
    timeout: 30_000,
  });
}

async function waitForBackend(request: APIRequestContext) {
  for (let attempt = 0; attempt < 90; attempt++) {
    try {
      const response = await request.get(HEALTH_URL, { timeout: 2_000 });
      if (response.status() === 200) return;
    } catch { /* backend is still restarting */ }
    await new Promise(resolve => setTimeout(resolve, 1_000));
  }
  throw new Error("Backend did not become healthy after the restore-gate restart");
}

const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

test("restore gate blocks workforce access until a passing post-restore reconciliation", async ({ page, request }) => {
  test.skip(!enabled, "Set RESTORE_GATE_LIVE and the RESTORE_OPERATOR identity triplet");
  test.setTimeout(420_000);
  const operator = restoreOperator!;
  const workforceIdentities = identities as EvidenceIdentity[];
  const secrets = new Map<string, { value?: string }>();
  const secret = (evidenceIdentity: EvidenceIdentity) => {
    const value = secrets.get(evidenceIdentity.subject) ?? {};
    secrets.set(evidenceIdentity.subject, value);
    return value;
  };

  await enableVirtualPasskey(page);
  let workforceToken = "";
  for (const evidenceIdentity of workforceIdentities) {
    const token = await authorize(page, request, evidenceIdentity, secret(evidenceIdentity), "2");
    if (evidenceIdentity === workforceIdentities[0]) workforceToken = token;
  }
  await authorize(page, request, operator, secret(operator), "2");
  const operatorToken = await authorize(page, request, operator, secret(operator), "3");

  const beforeRestore = await request.get(`${API}/me`, { headers: bearer(workforceToken) });
  expect(beforeRestore.status(), await beforeRestore.text()).toBe(200);

  let backendReconfigured = false;
  try {
    startRestoreBackend(RESTORE_ID);
    backendReconfigured = true;
    await waitForBackend(request);

    const blocked = await request.get(`${API}/me`, { headers: bearer(workforceToken) });
    expect(blocked.status(), await blocked.text()).toBe(503);
    expect(await blocked.json()).toMatchObject({ code: "IDENTITY_RESTORE_RECONCILIATION_REQUIRED" });

    const reconciliation = await request.post(`${API}/admin/identity-reconciliation`, {
      headers: bearer(operatorToken),
      data: { postRestore: true, reason: "Live OPS-04 restore gate release evidence" },
    });
    expect(reconciliation.status(), await reconciliation.text()).toBe(200);
    const run = (await reconciliation.json()) as {
      id: string;
      trigger: string;
      status: string;
      checkedCount: number;
      discrepancyCount: number;
    };
    expect(run).toMatchObject({ trigger: "POST_RESTORE", status: "PASSED", checkedCount: 8, discrepancyCount: 0 });

    const discrepancies = await request.get(`${API}/admin/identity-reconciliation/${run.id}/discrepancies`, {
      headers: bearer(operatorToken),
    });
    expect(discrepancies.status(), await discrepancies.text()).toBe(200);
    expect(await discrepancies.json()).toEqual([]);

    const released = await request.get(`${API}/me`, { headers: bearer(workforceToken) });
    expect(released.status(), await released.text()).toBe(200);
  } finally {
    if (backendReconfigured) {
      compose(["up", "-d", "--no-deps", "--force-recreate", "backend"]);
      await waitForBackend(request);
    }
  }
});

test("restore gate remains blocked until a pending inactive-identity disable is replayed", async ({ page, request }) => {
  test.skip(!replayEnabled, "Set RESTORE_REPLAY_LIVE and the RESTORE_REPLAY_OPERATOR identity triplet");
  test.setTimeout(420_000);
  const operator = replayOperator!;
  const secret: { value?: string } = {};
  const restoreId = process.env.RESTORE_REPLAY_GATE_ID ?? `live-ops04-replay-${Date.now()}`;

  await enableVirtualPasskey(page);
  await authorize(page, request, operator, secret, "2");
  const operatorToken = await authorize(page, request, operator, secret, "3");

  let backendReconfigured = false;
  try {
    startRestoreBackend(restoreId, true);
    backendReconfigured = true;
    await waitForBackend(request);

    const blocked = await request.get(`${API}/me`, { headers: bearer(operatorToken) });
    expect(blocked.status(), await blocked.text()).toBe(503);

    const beforeReplay = await request.post(`${API}/admin/identity-reconciliation`, {
      headers: bearer(operatorToken),
      data: { postRestore: true, reason: "OPS-04 proof before durable disable replay" },
    });
    expect(beforeReplay.status(), await beforeReplay.text()).toBe(200);
    const blockedRun = (await beforeReplay.json()) as { id: string; status: string; checkedCount: number; discrepancyCount: number };
    expect(blockedRun).toMatchObject({ status: "DISCREPANCIES", checkedCount: 10, discrepancyCount: 1 });

    const findings = await request.get(`${API}/admin/identity-reconciliation/${blockedRun.id}/discrepancies`, {
      headers: bearer(operatorToken),
    });
    expect(findings.status(), await findings.text()).toBe(200);
    expect(await findings.json()).toEqual([expect.objectContaining({
      subject: "045dbff9-9baf-4ea9-a9cc-d2cb20013308",
      type: "DATABASE_INACTIVE_IDENTITY_ENABLED",
    })]);

    makeReplayOperationDue();
    startRestoreBackend(restoreId);
    await waitForBackend(request);

    let releasedRun: { status: string; checkedCount: number; discrepancyCount: number } | undefined;
    for (let attempt = 0; attempt < 15; attempt++) {
      await new Promise(resolve => setTimeout(resolve, 1_000));
      const response = await request.post(`${API}/admin/identity-reconciliation`, {
        headers: bearer(operatorToken),
        data: { postRestore: true, reason: "OPS-04 proof after durable disable replay" },
      });
      expect(response.status(), await response.text()).toBe(200);
      releasedRun = await response.json() as typeof releasedRun;
      if (releasedRun?.status === "PASSED") break;
    }
    expect(releasedRun).toMatchObject({ status: "PASSED", checkedCount: 10, discrepancyCount: 0 });

    const released = await request.get(`${API}/me`, { headers: bearer(operatorToken) });
    expect(released.status(), await released.text()).toBe(200);
  } finally {
    if (backendReconfigured) {
      compose(["up", "-d", "--no-deps", "--force-recreate", "backend"]);
      await waitForBackend(request);
    }
  }
});
