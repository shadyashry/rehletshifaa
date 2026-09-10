import { expect, test, type Page } from "@playwright/test";

/**
 * Browser verification of the patient proposal at the viewports real patients use, in both
 * directions. The backend is mocked so the run is hermetic; what is being checked is layout,
 * direction and keyboard behaviour, not workflow.
 */
const TOKEN = "responsive-token";
const BASE = "http://localhost:8080/api/v1/public/proposals";

const VIEWPORTS = [
  { name: "320", width: 320, height: 720 },
  { name: "375", width: 375, height: 812 },
  { name: "390", width: 390, height: 844 },
  { name: "768", width: 768, height: 1024 },
  { name: "1024", width: 1024, height: 768 },
  { name: "1440", width: 1440, height: 900 },
];

const summary = { caseNumber: "RS-2026-000030", channel: "WHATSAPP", destinationHint: "***7898", whatsappHint: "***7898", emailHint: null };

// A deliberately awkward payload: a very long service name, a long consultant name and a
// four-figure line beside a six-figure total are what break price rows if anything will.
const proposal = {
  caseNumber: "RS-2026-000030", patientName: "Mohamed Abdelrahman Ahmed", documentType: "PRELIMINARY_ESTIMATE",
  versionNumber: 1, currency: "USD",
  items: [
    { id: "i1", category: "MEDICAL", description: "Exercise stress test", quantity: 1, unitPrice: 150, optional: false },
    { id: "i2", category: "MEDICAL", description: "Transoesophageal echocardiography with contrast and continuous rhythm monitoring throughout the procedure", quantity: 1, unitPrice: 1800, optional: false },
    { id: "i3", category: "MEDICAL", description: "Dual chamber pacemaker implant", quantity: 1, unitPrice: 6250, optional: false },
  ],
  totalExpected: 8200, includedServices: "Stress test; echocardiography; pacemaker implant",
  excludedServices: "", validUntil: new Date(Date.now() + 14 * 86400000).toISOString(), decided: false,
  recommendedTreatment: "Dual-chamber pacemaker implantation following the findings of the remote cardiology review.",
  risksAndLimitations: "Standard procedural risks apply.", depositDueDisplay: 820,
  consultantName: "Dr. Yasmine Farouk Abdelaziz",
};

async function mockBackend(page: Page) {
  await page.route(`${BASE}/${TOKEN}`, (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(summary) }));
  await page.route(`${BASE}/${TOKEN}/request-access`, (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(summary) }));
  await page.route(`${BASE}/${TOKEN}/verify`, (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ grant: "grant-1" }) }));
  await page.route(`${BASE}/${TOKEN}/view`, (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(proposal) }));
  await page.route(`${BASE}/${TOKEN}/decision`, (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ id: "v1", status: "ACCEPTED" }) }));
}

async function openProposal(page: Page, locale: "en" | "ar") {
  await mockBackend(page);
  await page.goto(`/${locale}/proposal/${TOKEN}`);
  await page.getByRole("button", { name: locale === "ar" ? "إرسال الرمز" : "Send code" }).click();
  await page.getByLabel(locale === "ar" ? "أدخل الرمز المكوّن من 6 أرقام" : "Enter the 6-digit code").fill("123456");
  await page.getByRole("button", { name: locale === "ar" ? "تحقّق" : "Verify" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
}

/** The single most common responsive defect, checked on the document rather than by eye. */
async function expectNoHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(() => {
    const doc = document.documentElement;
    const offenders: string[] = [];
    // Scoped to the proposal itself: the site header keeps its collapsed mobile menu off-canvas by
    // design, which is not this page's concern. The document-level check below still catches any
    // overflow a viewer would actually feel.
    const root = document.querySelector("section.section") ?? document.body;
    root.querySelectorAll<HTMLElement>("*").forEach((el) => {
      const rect = el.getBoundingClientRect();
      if (rect.width > 0 && (rect.right > doc.clientWidth + 1 || rect.left < -1)) offenders.push(`${el.tagName}.${el.className}`.slice(0, 120));
    });
    return { scrolls: doc.scrollWidth > doc.clientWidth + 1, offenders: offenders.slice(0, 5) };
  });
  expect(overflow.offenders, `elements outside the viewport: ${overflow.offenders.join(" | ")}`).toEqual([]);
  expect(overflow.scrolls, "document scrolls horizontally").toBe(false);
}

for (const viewport of VIEWPORTS) {
  test(`proposal fits ${viewport.name}px with no horizontal overflow`, async ({ page }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await openProposal(page, "en");

    await expect(page.getByRole("heading", { name: "Your preliminary care estimate" })).toBeVisible();
    await expect(page.getByText("Reviewed by Dr. Yasmine Farouk Abdelaziz")).toBeVisible();
    await expect(page.getByText("Dual chamber pacemaker implant")).toBeVisible();
    await expect(page.getByText("$8,200").first()).toBeVisible();
    await expect(page.getByRole("checkbox")).toBeVisible();

    await expectNoHorizontalOverflow(page);
    await page.screenshot({ path: `e2e/screenshots/proposal-en-${viewport.name}.png`, fullPage: true });
  });
}

test("proposal renders right-to-left in Arabic without overflow", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openProposal(page, "ar");

  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await expect(page.getByRole("heading", { name: "تقديرك المبدئي للرعاية" })).toBeVisible();
  await expect(page.getByText("راجعها Dr. Yasmine Farouk Abdelaziz")).toBeVisible();

  // Prices must stay on the line-end side under RTL, not collide with the service name.
  const row = page.locator("li", { hasText: "Dual chamber pacemaker implant" }).first();
  const rowBox = await row.boundingBox();
  const priceBox = await row.getByText("٦٬٢٥٠").or(row.getByText("6,250")).first().boundingBox();
  expect(rowBox && priceBox).toBeTruthy();
  expect(priceBox!.x).toBeLessThan(rowBox!.x + rowBox!.width / 2);

  await expectNoHorizontalOverflow(page);
  await page.screenshot({ path: "e2e/screenshots/proposal-ar-390.png", fullPage: true });

  await page.setViewportSize({ width: 1440, height: 900 });
  await expectNoHorizontalOverflow(page);
  await page.screenshot({ path: "e2e/screenshots/proposal-ar-1440.png", fullPage: true });
});

test("decision controls are reachable and operable from the keyboard", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await openProposal(page, "en");

  const checkbox = page.getByRole("checkbox");
  await checkbox.focus();
  await expect(checkbox).toBeFocused();
  await page.keyboard.press("Space");
  await expect(checkbox).toBeChecked();

  // The dialog traps focus and gives it back to the page on Escape.
  await page.getByRole("button", { name: "Request changes" }).first().click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("radio").first()).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();

  await page.getByRole("button", { name: "Acknowledge & continue" }).first().focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { name: "your estimate is acknowledged" })).toBeVisible();
});

test("the sticky bar carries the decision only while the decision block is off screen", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openProposal(page, "en");

  // Near the top the decision block is far below, so the bar stands in for it.
  const stickyPrimary = page.locator("div.fixed").getByRole("button", { name: "Acknowledge & continue" });
  await expect(stickyPrimary).toBeVisible();

  await page.getByRole("checkbox").scrollIntoViewIfNeeded();
  await expect(stickyPrimary).toBeHidden();
  await expect(page.getByRole("button", { name: "Acknowledge & continue" })).toHaveCount(1);
});

test("remains usable at 200% zoom", async ({ page }) => {
  // 200% zoom on a 1280px window is equivalent to a 640px CSS viewport.
  await page.setViewportSize({ width: 640, height: 720 });
  await openProposal(page, "en");
  await expect(page.getByRole("heading", { name: "Your preliminary care estimate" })).toBeVisible();
  await expect(page.getByRole("checkbox")).toBeVisible();
  await expect(page.getByRole("button", { name: "Acknowledge & continue" }).first()).toBeVisible();
  await expectNoHorizontalOverflow(page);
  await page.screenshot({ path: "e2e/screenshots/proposal-en-zoom200.png", fullPage: true });
});
