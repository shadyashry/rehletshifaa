import { expect, test } from "@playwright/test";

import { setupPortal } from "./portal-fixture";

/**
 * Opening a different case straight from a notification (without going back to the queue) must start that case's
 * workspace afresh: nothing typed, chosen or opened in the previous patient's case may carry over, where it could be
 * submitted against the wrong case. The workspace tab stands in for every piece of per-case local state.
 * Synthetic fixtures only.
 */
test("opening another case from a notification starts a fresh workspace", async ({ page }) => {
  await setupPortal(page, "COORDINATOR_LEAD");
  // Registered after the fixture, so it answers first: one unread notification about the team case.
  await page.route("**/api/v1/notifications**", route => route.request().method() === "OPTIONS" ? route.fulfill({ status: 204 })
    : route.fulfill({ contentType: "application/json", body: JSON.stringify({ unread: 1, items: [
      { id: "n1", caseId: "team", caseNumber: "RS-2026-000003", taskId: null, eventType: "CASE_UPDATED", title: "Patient sent new documents",
        context: null, createdAt: "2026-09-05T12:00:00Z", read: false }] }) }));
  await page.goto("/en/portal");

  await page.getByRole("tab", { name: /My cases/ }).click();
  await page.getByRole("button", { name: "Open", exact: true }).first().click();
  await expect(page.getByRole("heading", { name: "Maya Example" })).toBeVisible();

  // Leave per-case state behind in this workspace.
  const workspaceTabs = page.getByRole("tablist", { name: /case workspace/i });
  await workspaceTabs.getByRole("tab", { name: /Activity/ }).click();
  await expect(workspaceTabs.getByRole("tab", { name: /Activity/ })).toHaveAttribute("aria-selected", "true");

  // Jump to the other case from the bell, without returning to the queue.
  await page.getByRole("button", { name: /Notifications/ }).click();
  await page.getByRole("dialog", { name: /Notifications/ }).getByRole("button", { name: /RS-2026-000003|Open case|View case/ }).first().click();
  await expect(page.getByRole("heading", { name: "Omar Example" })).toBeVisible();

  // A fresh workspace: back on the default tab, nothing from Maya's case.
  await expect(page.getByRole("tablist", { name: /case workspace/i }).getByRole("tab", { name: /Overview/ })).toHaveAttribute("aria-selected", "true");
});
