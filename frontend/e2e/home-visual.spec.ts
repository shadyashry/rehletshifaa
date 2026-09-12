import { test } from "@playwright/test";

/** Visual capture of the public homepage for design review at real viewports, in both directions. */
const SHOTS = [
  { name: "320", width: 320, height: 568 },
  { name: "375", width: 375, height: 812 },
  { name: "390", width: 390, height: 844 },
  { name: "430", width: 430, height: 932 },
  { name: "768", width: 768, height: 1024 },
  { name: "1024", width: 1024, height: 768 },
  { name: "1100", width: 1100, height: 800 },
  { name: "1280", width: 1280, height: 800 },
  { name: "1440", width: 1440, height: 900 },
  { name: "1600", width: 1600, height: 900 },
];

for (const shot of SHOTS) {
  test(`home ${shot.name}`, async ({ page }) => {
    await page.setViewportSize({ width: shot.width, height: shot.height });
    await page.goto("/en");
    await page.waitForLoadState("networkidle");
    await page.screenshot({ path: `e2e/screenshots/home-en-${shot.name}.png`, fullPage: true });
  });
}

for (const shot of SHOTS.filter((s) => ["390", "768", "1024", "1280", "1440", "1600"].includes(s.name))) {
  test(`home arabic ${shot.name}`, async ({ page }) => {
    await page.setViewportSize({ width: shot.width, height: shot.height });
    await page.goto("/ar");
    await page.waitForLoadState("networkidle");
    await page.screenshot({ path: `e2e/screenshots/home-ar-${shot.name}.png`, fullPage: true });
  });
}
