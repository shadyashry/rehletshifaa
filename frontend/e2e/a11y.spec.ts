import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

import { setupPatient } from "./patient-fixture";
import { setupPortal } from "./portal-fixture";

/**
 * WCAG 2.2 AA ratchet for the public site and the portal, in English and Arabic.
 *
 * Only serious and critical violations block. Known ones are recorded per page in `a11y-baseline.json`
 * (`"<locale>/<page>": ["rule-id", …]`); a page fails only on a rule id that is not in its entry, so the baseline can
 * only shrink. When a recorded rule stops occurring the test passes and adds a "baseline can shrink" annotation.
 * Every page attaches its full axe result.
 *
 * Refresh a page's entry with `A11Y_UPDATE_BASELINE=1 pnpm exec playwright test e2e/a11y.spec.ts --workers=1`
 * (one worker: every test rewrites the same file). Synthetic fixtures only.
 */
const BASELINE_PATH = path.join(__dirname, "a11y-baseline.json");
const UPDATE = process.env.A11Y_UPDATE_BASELINE === "1";
const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];
const BLOCKING = new Set(["serious", "critical"]);

type Baseline = Record<string, string[]>;
const readBaseline = (): Baseline => {
  try { return JSON.parse(readFileSync(BASELINE_PATH, "utf8")) as Baseline; } catch { return {}; }
};
const writeBaseline = (baseline: Baseline) => {
  const sorted = Object.fromEntries(Object.keys(baseline).sort().map(key => [key, [...baseline[key]].sort()]));
  writeFileSync(BASELINE_PATH, `${JSON.stringify(sorted, null, 2)}\n`);
};

type Target = { name: string; path: string; prepare?: (page: Page) => Promise<unknown>; ready?: (page: Page) => Promise<void> };

const PUBLIC: Target[] = [
  { name: "home", path: "" },
  { name: "care-areas", path: "/care-areas" },
  { name: "consultants", path: "/consultants" },
  { name: "how-it-works", path: "/how-it-works" },
  { name: "send-my-case", path: "/send-my-case" },
  { name: "track-case", path: "/track-case" },
  { name: "cardiology", path: "/cardiology" },
];
const PORTAL: Target[] = [
  { name: "portal-coordinator", path: "/portal", prepare: page => setupPortal(page, "COORDINATOR"), ready: page => expect(page.getByRole("tab").first()).toBeVisible() },
  { name: "portal-doctor", path: "/portal", prepare: page => setupPortal(page, "DOCTOR"), ready: page => expect(page.getByRole("tab").first()).toBeVisible() },
  { name: "my-care", path: "/portal", prepare: page => setupPatient(page, "deposit-arranging"), ready: page => expect(page.locator("#current-step-title")).toBeVisible() },
];

for (const locale of ["en", "ar"] as const) {
  for (const target of [...PUBLIC, ...PORTAL]) {
    const key = `${locale}/${target.name}`;
    test(`a11y ${key}`, async ({ page }, testInfo) => {
      await page.emulateMedia({ reducedMotion: "reduce" });
      await target.prepare?.(page);
      await page.goto(`/${locale}${target.path}`);
      await page.waitForLoadState("networkidle");
      await target.ready?.(page);

      const results = await new AxeBuilder({ page }).withTags(TAGS).exclude("nextjs-portal").analyze();
      await testInfo.attach(`axe-${key.replace("/", "-")}.json`, { body: JSON.stringify(results, null, 2), contentType: "application/json" });

      const found = [...new Set(results.violations.filter(v => BLOCKING.has(v.impact ?? "")).map(v => v.id))].sort();
      const baseline = readBaseline();
      if (UPDATE) {
        if (found.length) baseline[key] = found; else delete baseline[key];
        writeBaseline(baseline);
        return;
      }
      const known = baseline[key] ?? [];
      const fixed = known.filter(id => !found.includes(id));
      if (fixed.length) testInfo.annotations.push({ type: "baseline can shrink", description: `${key}: ${fixed.join(", ")} no longer occur` });
      const regressions = results.violations.filter(v => BLOCKING.has(v.impact ?? "") && !known.includes(v.id));
      expect(regressions.map(v => `${v.id} (${v.impact}): ${v.help} — ${v.nodes.length} node(s), e.g. ${v.nodes[0]?.target.join(" ")}`), `new serious/critical violations on ${key}`).toEqual([]);
    });
  }
}
