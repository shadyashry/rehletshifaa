import { expect, test } from "@playwright/test";
import path from "node:path";

import { setupOperationsDay } from "./operations-fixture";

// D-10: the case team files the hospital's paperwork under Documents, through the work endpoint, in both languages.
// Synthetic Operations fixture only; shots go beside the deep-validation evidence.
const shot = (name: string) => path.join("../docs/qa/deep-platform-validation/2026-10-29/raw/shots", `${name}.png`);
const PDF = Buffer.from("%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n");

for (const locale of ["en", "ar"] as const) for (const width of [390, 1440]) {
  test(`Operations adds a document to the case (${locale}, ${width})`, async ({ page }) => {
    await setupOperationsDay(page);
    const calls: string[] = [];
    await page.route("**/api/v1/work/cases/plan/documents/**", async route => {
      const url = new URL(route.request().url());
      calls.push(url.pathname.replace(/^.*\/api\/v1/, ""));
      if (url.pathname.endsWith("/presign")) return route.fulfill({ status: 201, contentType: "application/json",
        body: JSON.stringify({ documentId: "d-new", uploadUrl: `${url.origin}/api/v1/__upload/d-new`, requiredHeaders: { "Content-Type": "application/pdf" } }) });
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ documentId: "d-new", status: "CLEAN" }) });
    });
    await page.route("**/api/v1/__upload/**", route => route.fulfill({ status: 200, body: "" }));
    await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
    await page.goto(`/${locale}/portal?case=plan`);
    await page.locator("#case-heading").waitFor();
    await page.locator("#case-tab-documents").click();
    const input = page.locator('#case-tab-panel input[type="file"]');
    await expect(input).toHaveCount(1);
    await page.waitForLoadState("networkidle");
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth), "no sideways scroll").toBeLessThanOrEqual(0);
    await page.screenshot({ path: shot(`staff-upload-${locale}-${width}`), fullPage: true });

    await input.setInputFiles({ name: "admission-letter.pdf", mimeType: "application/pdf", buffer: PDF });
    await expect(page.getByRole("status").filter({ hasText: "admission-letter.pdf" })).toBeVisible();
    expect(calls).toEqual(["/work/cases/plan/documents/presign", "/work/cases/plan/documents/confirm"]);
    await page.screenshot({ path: shot(`staff-upload-done-${locale}-${width}`), fullPage: true });
  });
}
