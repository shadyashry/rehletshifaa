import { expect, test, type Page } from "@playwright/test";
import { API } from "./env";
import { setupPortal } from "./portal-fixture";

// STF-02, synthetic fixtures: an invited coordinator's first sign-in activates the account, then the granted role opens.
// The backend's MFA check against Keycloak is covered by StaffLifecycleService tests; this proves the browser triggers it.
async function invitedCoordinator(page: Page, activation: { status: number; body: unknown }) {
  const { writes } = await setupPortal(page, "COORDINATOR");
  let active = false;
  const me = () => ({
    subject: "qa-coordinator", roles: active ? ["COORDINATOR"] : [], permissions: [], reauthenticate: [],
    workspaces: active ? ["COORDINATION"] : [], managedFunctions: [], platformAccountOwner: false, workforce: null,
    pendingActions: active ? [] : ["ACTIVATE_ACCOUNT"],
  });
  // Registered after the fixture, so these win for the two identity endpoints.
  await page.route(`${API}/me`, (route) => route.request().method() === "OPTIONS" ? route.fulfill({ status: 204 })
    : route.fulfill({ contentType: "application/json", body: JSON.stringify(me()) }));
  await page.route(`${API}/me/activation`, (route) => {
    if (route.request().method() === "OPTIONS") return route.fulfill({ status: 204 });
    writes.push({ path: "/me/activation", body: {} });
    if (activation.status === 200) active = true;
    return route.fulfill({ status: activation.status, contentType: "application/json", body: JSON.stringify(activation.body) });
  });
  return { writes };
}

test("an invited coordinator becomes ACTIVE on first sign-in and lands in their workspace", async ({ page }) => {
  const { writes } = await invitedCoordinator(page, { status: 200, body: { lifecycle: "ACTIVE" } });
  await page.goto("/en/portal");
  await expect(page.getByRole("heading", { level: 1, name: "Coordinator" })).toBeVisible();
  expect(writes.filter((w) => w.path === "/me/activation")).toHaveLength(1);
  await expect(page.getByRole("heading", { name: "Finish setting up your account" })).toHaveCount(0);
});

test("an invited coordinator without MFA is asked to set it up and is never treated as a patient", async ({ page }) => {
  const { writes } = await invitedCoordinator(page, { status: 409, body: { code: "MFA_ENROLMENT_REQUIRED", message: "Set up two-step verification before activating your account" } });
  await page.goto("/en/portal");
  await expect(page.getByRole("heading", { name: "Finish setting up your account" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Sign in to set it up" })).toBeVisible();
  expect(writes.some((w) => w.path === "/patient/account/session")).toBeFalsy();
  // "Try again" re-asks the platform; it does not loop on its own.
  expect(writes.filter((w) => w.path === "/me/activation")).toHaveLength(1);
  await page.getByRole("button", { name: "Try again" }).click();
  await expect.poll(() => writes.filter((w) => w.path === "/me/activation").length).toBe(2);
});
