import { expect, test, type Page } from "@playwright/test";
import path from "node:path";

import { API } from "./env";
import { setupPatient } from "./patient-fixture";
import { portalAlerts, setupPortal } from "./portal-fixture";

/**
 * The coordinator-mediated Arabic proposal decision (plans/arabic-proposal-decision.md), on every surface that relies on
 * the deposit, refund and cancellation terms: the secure link, the My Care drawer and the coordinator's recording.
 * Synthetic fixtures only.
 */
const shots = (name: string) => path.join("../docs/ux-redesign/screenshots/pass-2", `${name}.png`);
const noOverflow = (page: Page) => expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

const TOKEN = "assisted-token";
const BASE = `${API}/public/proposals`;
const summary = { caseNumber: "RS-2026-000040", channel: "WHATSAPP", destinationHint: "***7898", whatsappHint: "***7898", emailHint: null };
const proposal = {
  caseNumber: "RS-2026-000040", patientName: "Maya Example", documentType: "PRELIMINARY_ESTIMATE", versionNumber: 1, currency: "USD",
  items: [{ id: "i1", category: "MEDICAL", description: "Dual chamber pacemaker implant", quantity: 1, unitPrice: 4850, optional: false }],
  totalExpected: 4850, validUntil: new Date(Date.now() + 14 * 86400000).toISOString(), decided: false,
  recommendedTreatment: "Dual-chamber pacemaker implantation.", depositDueDisplay: 500, consultantName: "Dr. Example Consultant", assistance: null,
};

async function openSecureLink(page: Page, locale: "en" | "ar") {
  const asked: unknown[] = [];
  const reply = (body: unknown) => ({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
  await page.route(`${BASE}/${TOKEN}`, route => route.fulfill(reply(summary)));
  await page.route(`${BASE}/${TOKEN}/request-access`, route => route.fulfill(reply(summary)));
  await page.route(`${BASE}/${TOKEN}/verify`, route => route.fulfill(reply({ grant: "grant-1" })));
  await page.route(`${BASE}/${TOKEN}/view`, route => route.fulfill(reply(proposal)));
  await page.route(`${BASE}/${TOKEN}/assistance`, route => { asked.push(route.request().postDataJSON()); return route.fulfill(reply({ requestedAt: "2026-10-08T09:00:00Z" })); });
  await page.goto(`/${locale}/proposal/${TOKEN}`);
  await page.getByRole("button", { name: locale === "ar" ? "إرسال الرمز" : "Send code" }).click();
  await page.getByLabel(locale === "ar" ? "أدخل الرمز المكوّن من 6 أرقام" : "Enter the 6-digit code").fill("123456");
  await page.getByRole("button", { name: locale === "ar" ? "تحقّق" : "Verify" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  return asked;
}

for (const width of [390, 1440]) {
  test(`secure link in Arabic asks the coordinator instead of a dead acknowledgement (${width})`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    const asked = await openSecureLink(page, "ar");
    await expect(page.getByRole("checkbox")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "الإقرار والمتابعة" })).toHaveCount(0);
    // "What happens next" starts with the conversation, not an acknowledgement the page does not offer.
    await expect(page.locator("ol li").first()).toContainText("يراجع منسّق حالتك الشروط معك بالعربية ويسجّل قرارك.");
    await expect(page.getByText("تُقرّ بهذا التقدير للمتابعة.")).toHaveCount(0);
    await expect(page.getByRole("link", { name: "عرض المقترح بالإنجليزية" })).toHaveAttribute("href", `/en/proposal/${TOKEN}`);
    await page.getByRole("button", { name: /منسّقي مراجعة الشروط معي/ }).first().click();
    await expect(page.getByRole("status").filter({ hasText: "ستصلك رسالة من منسّقك" })).toBeVisible();
    expect(asked).toEqual([{ grant: "grant-1" }]);
    await noOverflow(page);
    await page.screenshot({ path: shots(`secure-link-assisted-ar-${width}`), fullPage: true });
  });
}

test("secure link in English keeps the acknowledgement", async ({ page }) => {
  await openSecureLink(page, "en");
  await expect(page.getByRole("checkbox")).toBeVisible();
  await expect(page.getByRole("button", { name: /go through the terms/i })).toHaveCount(0);
});

test("My Care in Arabic: the drawer offers the coordinator, and Decline asks again in place", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const { writes } = await setupPatient(page, "proposal-ready");
  await page.goto("/ar/portal");
  await page.getByRole("button", { name: "مراجعة العرض" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("checkbox")).toHaveCount(0);
  await dialog.getByRole("button", { name: /Sara Ahmed.*مراجعة الشروط معي/ }).click();
  await expect(dialog.getByRole("status").filter({ hasText: "ستصلك رسالة من" })).toBeVisible();
  // The confirmation takes the focus the replaced button had, inside the drawer.
  await expect(dialog.getByRole("status").filter({ hasText: "ستصلك رسالة من" })).toBeFocused();
  expect(writes.some(w => w.path.endsWith("/proposals/v1/assistance"))).toBe(true);
  await page.screenshot({ path: shots("my-care-assisted-ar-390"), fullPage: true });
  await dialog.getByRole("button", { name: "لا أرغب في المتابعة بهذا المقترح" }).click();
  await expect(dialog.getByRole("button", { name: "الإبقاء على المقترح" })).toBeFocused();
  await dialog.getByRole("button", { name: "الإبقاء على المقترح" }).click();
  expect(writes.some(w => w.path.endsWith("/decision"))).toBe(false);
});

for (const locale of ["en", "ar"] as const) {
  test(`a recorded decision tells the patient who recorded it and how (${locale})`, async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await setupPatient(page, "proposal-recorded");
    await page.goto(`/${locale}/portal`);
    await page.getByRole("button", { name: locale === "ar" ? /عرض العرض/ : /View proposal/ }).first().click();
    await expect(page.getByRole("dialog")).toContainText(locale === "ar" ? "سُجّل هذا القرار بواسطة" : "Recorded by");
    await expect(page.getByRole("dialog")).toContainText(locale === "ar" ? "مكالمة واتساب" : "WhatsApp call with you");
    await page.screenshot({ path: shots(`my-care-recorded-${locale}-1440`), fullPage: true });
  });

  test(`the coordinator picks which authorised representative confirmed (${locale})`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const { writes } = await setupPortal(page, "COORDINATOR", { assistedDecision: true, representatives: true });
    await page.goto(`/${locale}/portal`);
    const ar = locale === "ar";
    await page.getByRole("button", { name: ar ? /^فتح(،| RS-)/ : /^Open(:| RS-)/ }).first().click();
    const form = page.locator("#current-action").getByRole("group", { name: ar ? "تسجيل قرار المريض" : "Record the patient's decision" });
    await form.getByRole("radio", { name: ar ? "الإقرار بالتقدير" : "Acknowledge the estimate" }).check();
    await form.getByRole("radio", { name: ar ? "أحد ممثّلي المريض" : "One of their representatives" }).check();
    const which = form.getByRole("combobox", { name: ar ? "أيّ ممثّل" : "Which representative" });
    await expect(which.locator("option")).toHaveCount(3);
    await which.selectOption("rep-2");
    await form.getByRole("checkbox").check();
    await page.screenshot({ path: path.join("../docs/ux-redesign/screenshots/pass-3", `record-decision-representative-${locale}-390.png`), fullPage: true });
    await form.getByRole("button", { name: ar ? "تسجيل القرار" : "Record decision" }).click();
    await expect.poll(() => writes.find(w => w.path.endsWith("/decision/on-behalf"))?.body).toMatchObject({ confirmedBy: "REPRESENTATIVE", representativeId: "rep-2" });
  });

  test(`the owning coordinator records the decision from the current action (${locale})`, async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await setupPortal(page, "COORDINATOR", { assistedDecision: true });
    await page.goto(`/${locale}/portal`);
    const ar = locale === "ar";
    await page.getByRole("button", { name: ar ? /^فتح(،| RS-)/ : /^Open(:| RS-)/ }).first().click();
    const panel = page.locator("#current-action");
    const form = panel.getByRole("group", { name: ar ? "تسجيل قرار المريض" : "Record the patient's decision" });
    await expect(form).toBeVisible();
    // Worded from the work item's code in the page's language, never the backend's English on an Arabic page.
    await expect(panel).toContainText(ar ? "طلب المريض مراجعة شروط المقترح معه بالعربية" : "The patient asked you to go through the proposal’s terms with them in Arabic");
    // Offered once: not again in More actions while it is the current action.
    await page.getByRole("button", { name: ar ? "المزيد" : "More" }).click();
    await expect(page.getByRole("dialog").getByRole("button", { name: ar ? /تسجيل قرار المريض/ : /Record the patient's decision/ })).toHaveCount(0);
    await page.keyboard.press("Escape");
    await form.getByRole("radio", { name: ar ? "الإقرار بالتقدير" : "Acknowledge the estimate" }).check();
    await form.getByRole("checkbox").check();
    await page.screenshot({ path: shots(`record-decision-${locale}-1440`), fullPage: true });
    await form.getByRole("button", { name: ar ? "تسجيل القرار" : "Record decision" }).click();
    await expect(form).toHaveCount(0);
    await expect(portalAlerts(page)).toHaveCount(0);
  });
}
