import { expect, test } from "@playwright/test";

// Playwright's bundled Chromium has no H.264/AAC decoders, so the journey video needs a branded browser: installed Chrome
// by default (present on GitHub's Ubuntu runners too), or the channel named in PLAYWRIGHT_MEDIA_CHANNEL.
test.use({ channel: process.env.PLAYWRIGHT_MEDIA_CHANNEL ?? "chrome" });

for (const locale of ["en", "ar"] as const) {
  test(`homepage image and journey video load ${locale}`, async ({ page }) => {
    await page.setViewportSize({ width: locale === "ar" ? 390 : 1440, height: 900 });
    await page.goto(`/${locale}`);
    // The hero tells one example case in five scenes, each opening on a moment from the patient film (2026-10-16).
    const story = page.locator("main .case-story").first();
    await expect(story).toBeVisible();
    const tabs = story.getByRole("tab");
    await expect(tabs).toHaveCount(5);
    await expect(tabs.first()).toHaveAttribute("aria-selected", "true");
    const first = story.getByRole("tabpanel").first();
    // The stamped case file sits beside the uploads from 640px; phones show the uploads alone.
    if (locale === "en") await expect(first.locator(".case-stamp")).toBeVisible();
    await expect.poll(() => first.locator("img").first().evaluate(image => (image as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
    // Choosing a step shows its scene and hides the others from assistive technology.
    await tabs.nth(2).click();
    await expect(tabs.nth(2)).toHaveAttribute("aria-selected", "true");
    await expect(story.getByRole("tabpanel")).toHaveCount(1);
    await expect(story.getByRole("tabpanel").locator("img").first()).toBeVisible();
    const video = page.locator("#how-it-works video");
    await expect(video).toBeVisible();
    await expect(video).toHaveAttribute("src", new RegExp(`journey-${locale}\\.mp4`));
    // A composed poster first; native controls appear once the play control is pressed.
    await page.locator("#how-it-works").getByRole("button", { name: locale === "en" ? /Play the film/ : /تشغيل الفيلم/ }).click();
    await expect(video).toHaveAttribute("controls", "");
    await expect.poll(() => video.evaluate(element => (element as HTMLVideoElement).readyState), { timeout: 15000 }).toBeGreaterThanOrEqual(1).catch(async error => {
      console.log(await video.evaluate(element => { const media = element as HTMLVideoElement; return { ready: media.readyState, error: media.error?.message, code: media.error?.code, state: media.networkState, source: media.currentSrc }; }));
      throw error;
    });
    await expect.poll(() => video.evaluate(element => (element as HTMLVideoElement).videoWidth)).toBeGreaterThan(0);
    await video.evaluate(async element => { const media = element as HTMLVideoElement; media.muted = true; await media.play(); });
    await expect.poll(() => video.evaluate(element => (element as HTMLVideoElement).currentTime)).toBeGreaterThan(0);
    await video.evaluate(element => (element as HTMLVideoElement).pause());
    await page.addStyleTag({ content: "nextjs-portal { display: none !important; }" });
    await page.screenshot({ path: test.info().outputPath(`homepage-${locale}.png`), fullPage: true });
  });
}
