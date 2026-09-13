import { defineConfig, devices } from "@playwright/test";

/**
 * Release-candidate QA suite: runs ONLY against the live tunnel stack (no dev server). All three URLs must
 * match how the frontend container was built. Chromium runs the full suite; Firefox and WebKit run the
 * critical patient path only (Start My Case → proposal → activation → sign-in → My Care → deposit).
 *
 *   PLAYWRIGHT_BASE_URL=https://dev.rehletshifaa.com PLAYWRIGHT_API_BASE_URL=https://api-dev.rehletshifaa.com \
 *   PLAYWRIGHT_OIDC_AUTHORITY=https://auth-dev.rehletshifaa.com/realms/rehletshifaa \
 *   PORTAL_TEST_PASSWORD=… DOCTOR_TEST_PASSWORD=… FINANCE_TEST_PASSWORD=… OPERATIONS_TEST_PASSWORD=… \
 *   pnpm exec playwright test -c playwright.qa.config.ts
 */
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "https://dev.rehletshifaa.com";
export default defineConfig({
  testDir: "./e2e/qa",
  timeout: 600000,
  expect: { timeout: 15000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"], ["json", { outputFile: "../docs/qa/release-candidate/evidence/playwright-report.json" }]],
  use: { baseURL, trace: "retain-on-failure", screenshot: "only-on-failure", actionTimeout: 20000, navigationTimeout: 45000 },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "firefox", use: { ...devices["Desktop Firefox"] }, testMatch: /qa-09-critical-crossbrowser\.spec\.ts/ },
    { name: "webkit", use: { ...devices["Desktop Safari"] }, testMatch: /qa-09-critical-crossbrowser\.spec\.ts/ },
  ],
});
