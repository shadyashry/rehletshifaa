import { defineConfig, devices } from "@playwright/test";
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3100";
const oidcAuthority = process.env.PLAYWRIGHT_OIDC_AUTHORITY ?? "http://localhost:8180/realms/rehletshifaa";
const externalServer = process.env.PLAYWRIGHT_EXTERNAL_SERVER === "true";
export default defineConfig({
  testDir: "./e2e",
  // Next.js dev blocks cross-origin asset requests, so the browser must use the
  // same host the dev server reports (localhost) or the page never hydrates.
  use: { baseURL, trace: "retain-on-failure" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: externalServer ? undefined : {
    command: `pnpm dev --port ${new URL(baseURL).port || "3100"}`,
    url: `${baseURL}/en`,
    reuseExistingServer: true,
    timeout: 120000,
    env: { ...process.env, NEXT_PUBLIC_OIDC_AUTHORITY: oidcAuthority, NEXT_PUBLIC_OIDC_CLIENT_ID: "rehletshifaa-web" },
  },
});

