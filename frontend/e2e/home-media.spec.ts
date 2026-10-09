import { expect, test } from "@playwright/test";

// Playwright's bundled Chromium has no H.264/AAC decoders, so the journey video needs a branded browser: installed Chrome
// by default (present on GitHub's Ubuntu runners too), or the channel named in PLAYWRIGHT_MEDIA_CHANNEL.
test.use({ channel: process.env.PLAYWRIGHT_MEDIA_CHANNEL ?? "chrome" });

for (const locale of ["en", "ar"] as const) {
  test(`homepage image and journey video load ${locale}`, async ({ page }) => {
    await page.setViewportSize({ width: locale === "ar" ? 390 : 1440, height: 900 });
    await page.goto(`/${locale}`);
    const hero = page.locator("main figure img").first();
    await expect(hero).toBeVisible();
    await expect(hero).toHaveAttribute("src", "/media/rehletshifaa-hero-consultation.jpg");
    await expect.poll(() => hero.evaluate(image => (image as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
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
