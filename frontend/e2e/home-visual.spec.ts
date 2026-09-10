import { test } from "@playwright/test";

/** Visual capture of the public homepage for design review at real viewports. */
const SHOTS = [
  { name: "390", width: 390, height: 844 },
  { name: "768", width: 768, height: 1024 },
  { name: "1024", width: 1024, height: 768 },
  { name: "1440", width: 1440, height: 900 },
];

for (const shot of SHOTS) {
  test(`home ${shot.name}`, async ({ page }) => {
    await page.setViewportSize({ width: shot.width, height: shot.height });
    await page.goto("/en");
    await page.waitForLoadState("networkidle");
    await page.screenshot({ path: `e2e/screenshots/home-en-${shot.name}.png`, fullPage: true });
  });
}

test("home arabic", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/ar");
  await page.waitForLoadState("networkidle");
  await page.screenshot({ path: "e2e/screenshots/home-ar-1440.png", fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: "e2e/screenshots/home-ar-390.png", fullPage: true });
});
