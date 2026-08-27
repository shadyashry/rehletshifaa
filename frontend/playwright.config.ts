import { defineConfig, devices } from "@playwright/test";
export default defineConfig({
  testDir: "./e2e",
  // Next.js dev blocks cross-origin asset requests, so the browser must use the
  // same host the dev server reports (localhost) or the page never hydrates.
  use: { baseURL: "http://localhost:3000", trace: "retain-on-failure" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: { command: "pnpm dev", url: "http://localhost:3000/en", reuseExistingServer: true, timeout: 120000 },
});

