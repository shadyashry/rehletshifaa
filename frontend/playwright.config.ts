import { defineConfig, devices } from "@playwright/test";
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3100";
const oidcAuthority = process.env.PLAYWRIGHT_OIDC_AUTHORITY ?? "http://localhost:8180/realms/rehletshifaa";
const externalServer = process.env.PLAYWRIGHT_EXTERNAL_SERVER === "true";
const port = new URL(baseURL).port || "3100";
// The suite runs against a fresh production build by default. Under parallel workers the dev server compiles routes
// concurrently and can corrupt `.next/dev/prerender-manifest.json` mid-run, after which every page fails until a
// restart; that, and first-compile delays, were the "cold-run timeouts". PLAYWRIGHT_DEV_SERVER=true keeps the dev
// server for quick, targeted iteration. A server already listening on the port is reused as is.
const devServer = process.env.PLAYWRIGHT_DEV_SERVER === "true";
export default defineConfig({
  testDir: "./e2e",
  // The release-candidate QA pack runs only under playwright.qa.config.ts (it imports other specs, which this run
  // would refuse to load).
  testIgnore: "qa/**",
  // Half the cores (the default) is 11 browsers on a 22-thread laptop that also runs the Docker stack; even six left a
  // page taking over 30s to open about once a run. Four ran two cold full runs clean in under three minutes. PLAYWRIGHT_WORKERS
  // overrides; CI keeps the default.
  workers: process.env.PLAYWRIGHT_WORKERS ? Number(process.env.PLAYWRIGHT_WORKERS) : process.env.CI ? undefined : 4,
  // Next.js dev blocks cross-origin asset requests, so the browser must use the
  // same host the dev server reports (localhost) or the page never hydrates.
  use: { baseURL, trace: "retain-on-failure" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: externalServer ? undefined : {
    command: devServer ? `pnpm dev --port ${port}` : `pnpm build && pnpm start --port ${port}`,
    url: `${baseURL}/en`,
    reuseExistingServer: true,
    timeout: devServer ? 120000 : 600000,
    env: { ...process.env, NEXT_PUBLIC_OIDC_AUTHORITY: oidcAuthority, NEXT_PUBLIC_OIDC_CLIENT_ID: "rehletshifaa-web" },
  },
});
