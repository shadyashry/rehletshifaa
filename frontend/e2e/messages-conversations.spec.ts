import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import path from "node:path";

import { setupCoordinatorDay } from "./coordinator-fixture";

// UX area 2, slice 2-3: messages that show who is owed a reply — the case's thread tabs, the reply from the strip, and the
// Conversations list (synthetic fixtures only).
const shot = (name: string) => path.join("../docs/ux-redesign/screenshots/area-2/2-3", `${name}.png`);
const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];
const reviewReply = { code: "WORK_ITEM", kind: "COMPLETE", workItemId: "w1", workItemVersion: 0, workType: "REVIEW_PATIENT_RESPONSE", title: "Review the patient's reply" };

async function blocking(page: Page, include: string) {
  const result = await new AxeBuilder({ page }).include(include).withTags(TAGS).analyze();
  return result.violations.filter(v => v.impact === "serious" || v.impact === "critical").map(v => v.id);
}

for (const locale of ["en", "ar"] as const) {
  const ar = locale === "ar";
  const copy = ar
    ? { messages: /الرسائل/, patient: /المريض/, consultant: /الاستشاري/, reply: "الرد على المريض", composer: "رسالتك", send: "إرسال الرسالة", sent: "أُرسلت الرسالة.",
        awaitingYou: "بانتظار ردّك", awaiting: "بانتظار الرد", closes: "تنتهي مهلة الرد", closed: "انتهت مهلة الرد", replyField: "ردّك", sendReply: "إرسال الرد", replySent: "أُرسل الرد.", queue: "قائمة الانتظار" }
    : { messages: /Messages/, patient: /Patient/, consultant: /Consultant/, reply: "Reply to the patient", composer: "Your message", send: "Send message", sent: "Message sent.",
        awaitingYou: "Awaiting your reply", awaiting: "Awaiting a reply", closes: "Reply window closes", closed: "Reply window closed", replyField: "Your reply", sendReply: "Send reply", replySent: "Reply sent.", queue: "Queue" };

  test(`case messages: thread tabs with unread counts, Consultant naming, keyboard between threads (${locale})`, async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await setupCoordinatorDay(page);
    await page.goto(`/${locale}/portal?case=owned`);
    await page.getByRole("button", { name: copy.messages }).click();
    const drawer = page.locator("dialog[open]");
    const tabs = drawer.getByRole("tab");
    await expect(tabs).toHaveCount(4);
    await expect(drawer.getByText(/Doctor|الطبيب/)).toHaveCount(0);
    // Opens where a reply is owed: the patient's thread holds the unread WhatsApp message.
    const patient = drawer.getByRole("tab", { name: copy.patient });
    await expect(patient).toHaveAttribute("aria-selected", "true");
    await expect(patient).toContainText(ar ? "غير مقروءة" : "1 unread message");
    await expect(drawer.getByRole("tabpanel")).toContainText("I uploaded the echo report");
    await page.waitForTimeout(200);
    await page.screenshot({ path: shot(`case-messages-${locale}-1440`) });
    expect(await blocking(page, "dialog[open]")).toEqual([]);

    await patient.focus();
    await page.keyboard.press(ar ? "ArrowLeft" : "ArrowRight");
    const consultant = drawer.getByRole("tab", { name: copy.consultant });
    await expect(consultant).toBeFocused();
    await expect(consultant).toHaveAttribute("aria-selected", "true");
    await expect(drawer.getByRole("tabpanel")).toContainText("New echo report attached");
    await expect(drawer.getByRole("tabpanel")).not.toContainText("I uploaded the echo report");

    await page.setViewportSize({ width: 390, height: 844 });
    await patient.click();
    await page.waitForTimeout(200);
    await page.screenshot({ path: shot(`case-messages-${locale}-390`) });
  });

  test(`the strip offers the reply to the patient when the step is the patient's reply (${locale})`, async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await setupCoordinatorDay(page, "COORDINATOR_LEAD", { currentAction: reviewReply });
    await page.goto(`/${locale}/portal?case=owned`);
    const strip = page.locator("#current-action");
    const reply = strip.getByRole("button", { name: copy.reply });
    await expect(reply).toBeVisible();
    // A quiet action beside the step's one filled button.
    await expect(strip.locator(".btn-primary")).toHaveCount(1);
    await expect(reply).toHaveClass(/btn-secondary/);
    await page.waitForTimeout(200);
    await page.locator("section[aria-labelledby='case-heading']").screenshot({ path: shot(`strip-reply-${locale}-1440`) });

    await reply.click();
    const drawer = page.locator("dialog[open]");
    await expect(drawer.getByRole("tab", { name: copy.patient })).toHaveAttribute("aria-selected", "true");
    const composer = drawer.getByLabel(copy.composer);
    await expect(composer).toBeFocused();
    await composer.fill(ar ? "شكراً، وصلنا التقرير." : "Thank you, the report arrived.");
    await drawer.getByRole("button", { name: copy.send }).click();
    await expect(drawer.getByRole("status").filter({ hasText: copy.sent })).toBeVisible();
    await expect(composer).toHaveValue("");
    await page.keyboard.press("Escape");
    await expect(page.locator("dialog[open]")).toHaveCount(0);
    await expect(reply).toBeFocused();

    await page.setViewportSize({ width: 390, height: 844 });
    await reply.scrollIntoViewIfNeeded();
    await page.waitForTimeout(200);
    await page.locator("section[aria-labelledby='case-heading']").screenshot({ path: shot(`strip-reply-${locale}-390`) });
  });

  test(`no reply from the strip on any other step (${locale})`, async ({ page }) => {
    await setupCoordinatorDay(page);
    await page.goto(`/${locale}/portal?case=owned`);
    await expect(page.locator("#current-action")).toBeVisible();
    await expect(page.getByRole("button", { name: copy.reply })).toHaveCount(0);
  });

  test(`conversations: who is owed a reply, the window, a roving list, focus to the thread, a confirmed send (${locale})`, async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await setupCoordinatorDay(page);
    await page.goto(`/${locale}/portal?view=conversations`);
    const view = page.locator("#staff-view:not([hidden])");
    const list = view.locator("[data-roving-list]");
    const row = (id: string) => list.locator(`[data-row="${id}"] [data-roving-primary]`);
    await expect(row("c1")).toContainText(copy.awaitingYou);
    await expect(row("c1")).toContainText(copy.closes);
    await expect(row("c2")).not.toContainText(copy.awaitingYou);
    await expect(row("c2")).toContainText(copy.closed);
    await expect(list.locator('[data-roving-primary][tabindex="0"]')).toHaveCount(1);
    // Scope tabs share the case page's underline style; the selected one is a tab.
    await expect(view.getByRole("tab", { selected: true })).toHaveCount(1);

    await page.keyboard.press("j");
    await expect(row("c1")).toBeFocused();
    await page.keyboard.press("ArrowDown");
    await expect(row("c2")).toBeFocused();
    await page.keyboard.press("k");
    await expect(row("c1")).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page.locator("#conversation-thread-title")).toBeFocused();
    await expect(row("c1")).toHaveAttribute("aria-current", "true");

    await page.getByLabel(copy.replyField).fill(ar ? "أهلاً، يسعدنا مساعدتك." : "Hello, we can help.");
    await page.getByRole("button", { name: copy.sendReply }).click();
    await expect(page.locator("#staff-view").getByRole("status").filter({ hasText: copy.replySent })).toBeVisible();
    // The list and the thread together: the view from its top, under the site header.
    await view.locator("section").first().evaluate(node => node.scrollIntoView({ block: "start", behavior: "instant" }));
    await page.waitForTimeout(200);
    await page.screenshot({ path: shot(`conversations-${locale}-1440`) });
    expect(await blocking(page, "#staff-view")).toEqual([]);

    // The queue: an Arabic name, a Latin phone hint and a date, each isolated.
    await view.getByRole("tab", { name: copy.queue }).click();
    await expect(row("c3")).toContainText(copy.awaiting);
    await expect(row("c3").locator("bdi").first()).toHaveText("سارة مثال");

    await page.setViewportSize({ width: 390, height: 844 });
    await view.getByRole("tab", { selected: false }).first().click();
    await row("c1").click();
    await expect(page.locator("#conversation-thread-title")).toBeFocused();
    await page.waitForTimeout(200);
    await page.screenshot({ path: shot(`conversations-${locale}-390`), fullPage: true });
  });
}
