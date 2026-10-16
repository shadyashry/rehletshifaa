import { expect, test, type Page } from "@playwright/test";

import { OIDC_AUTHORITY } from "./env";
import { meFor, routeMe } from "./me-fixture";

/**
 * P1-7 session 2 (retention, purge, erasure): Control Center › Retention for Compliance (policies and the purge log, no erasure) and
 * the Care Coordination Manager's erasure of a person (preview, reference, irreversible confirmation, result), in English and Arabic
 * at 390 and 1440. Synthetic fixtures only; the erasure is answered by the mock, never sent. Screenshots go to test-results (not tracked).
 */
const noSideScroll = (page: Page) => expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
const shot = (page: Page, name: string) => page.screenshot({ path: `test-results/p1-7/${name}.png`, fullPage: true });

const policies = [
  { recordClass: "DRAFT_INTAKE", retentionDays: 7, anchor: "CREATED", legalHold: false, enforced: true, basis: "Design 7.13: abandoned drafts after about 7 days, audited",
    lastPurgedAt: "2026-10-15T01:15:00Z", tables: ["medical_cases", "case_documents", "case_submission_contacts"] },
  { recordClass: "TRANSPORT_LOG", retentionDays: 30, anchor: "PROCESSED", legalHold: false, enforced: true, basis: "P1-7: transport copy", tables: ["whatsapp_inbound_queue"] },
  { recordClass: "INTAKE_CONVERSATION", retentionDays: 90, anchor: "CLOSED", legalHold: false, enforced: false, basis: "P1-7: 90 days after close", tables: ["intake_conversations"] },
  { recordClass: "LEGAL_RECORD", retentionDays: null, anchor: "NONE", legalHold: true, enforced: false, basis: "Never purged", tables: ["audit_events", "retention_purges"] },
  { recordClass: "PERSONAL_IDENTITY", retentionDays: null, anchor: "CASE_CLOSED", legalHold: false, enforced: false, basis: "Term with counsel", tables: ["patient_profiles"] },
];
const purges = {
  from: "2026-09-16T00:00:00Z", to: "2026-10-16T00:00:00Z", truncated: false,
  totals: [{ recordClass: "DRAFT_INTAKE", purges: 2, rowsAffected: 14, filesDeleted: 3, bytesDeleted: 3_145_728, lastPurgedAt: "2026-10-15T01:15:00Z" },
    { recordClass: "PERSONAL_IDENTITY", purges: 1, rowsAffected: 9, filesDeleted: 0, bytesDeleted: 0, lastPurgedAt: "2026-10-14T10:00:00Z" }],
  purges: [
    { id: "p3", recordClass: "DRAFT_INTAKE", subjectType: "DRAFT_CASE", subjectId: "c1", caseNumber: "RS-2026-000041", cause: "SCHEDULE", policyDays: 7,
      rowsAffected: 7, filesDeleted: 2, bytesDeleted: 2_097_152, actor: "SYSTEM", purgedAt: "2026-10-15T01:15:00Z" },
    { id: "p2", recordClass: "PERSONAL_IDENTITY", subjectType: "PATIENT", subjectId: "pt1", cause: "ERASURE_REQUEST", rowsAffected: 9, filesDeleted: 0, bytesDeleted: 0,
      actor: "kc-manager", requestReference: "Email to support, 14 October 2026", purgedAt: "2026-10-14T10:00:00Z" },
  ],
};
const preview = {
  patientId: "pt1", hasAccount: true, blockers: [],
  cases: [{ caseNumber: "RS-2026-000050", status: "CLOSED", draft: false, purged: false }, { caseNumber: "RS-2026-000051", status: "DRAFT", draft: true, purged: false }],
};
const result = { purgeId: "p9", patientId: "pt1", erasedAt: "2026-10-16T09:00:00Z", casesKept: 1, draftsPurged: 1, rowsAffected: 14, filesDeleted: 2, accountRemovalQueued: true };

async function serve(page: Page, roles: string[], data: Record<string, unknown>, writes: Record<string, unknown> = {}) {
  await page.addInitScript(({ authority }) => sessionStorage.setItem(`oidc.user:${authority}:rehletshifaa-web`, JSON.stringify({
    access_token: "synthetic-access", token_type: "Bearer", scope: "openid", profile: { sub: "kc-staff", name: "Synthetic Staff", auth_time: Math.floor(Date.now() / 1000) },
    expires_at: Math.floor(Date.now() / 1000) + 3600 })), { authority: OIDC_AUTHORITY });
  const sent: { path: string; body: unknown }[] = [];
  await page.route("**/api/v1/**", async (route) => {
    const url = new URL(route.request().url()); const path = url.pathname.replace(/^\/api\/v1/, ""); const method = route.request().method();
    if (method === "OPTIONS") return route.fulfill({ status: 204 });
    if (method !== "GET") {
      sent.push({ path, body: route.request().postDataJSON() });
      if (path in writes) return route.fulfill({ contentType: "application/json", body: JSON.stringify(writes[path]) });
      return route.fulfill({ status: 409, contentType: "application/json", body: JSON.stringify({ code: "BLOCKED_IN_REVIEW", message: "Writes are blocked in this review." }) });
    }
    const body = path in data ? data[path] : path === "/notifications" ? { items: [], unread: 0 } : path === "/account/preferences" ? { displayName: null, locale: null } : [];
    return route.fulfill({ contentType: "application/json", body: JSON.stringify(body) });
  });
  await routeMe(page, meFor("kc-staff", roles, { displayName: "Synthetic Staff" }));
  return sent;
}

for (const locale of ["en", "ar"] as const) for (const width of [390, 1440]) {
  const en = locale === "en";

  test(`Compliance reads the policies and the purge log, with no erasure (${locale}, ${width})`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await serve(page, ["COMPLIANCE_AUDITOR"], { "/compliance/retention/policies": policies, "/compliance/retention/purges": purges });
    await page.goto(`/${locale}/portal/control-center/retention`);
    await expect(page.getByRole("heading", { level: 1, name: en ? "Retention" : "الاحتفاظ بالسجلات" })).toBeVisible();
    await expect(page.locator("h1")).toHaveCount(1);
    await expect(page.getByRole("tab")).toHaveCount(2);
    await expect(page.getByText(en ? "Removed nightly" : "يُزال ليلًا").first()).toBeVisible();
    await expect(page.getByText(en ? "On legal hold" : "تحت حجز قانوني")).toBeVisible();
    await page.getByText(en ? "Where it is stored (2)" : "أماكن تخزينه (2)").click();
    await expect(page.getByText("retention_purges")).toBeVisible();
    await noSideScroll(page);
    await shot(page, `retention-policies-${locale}-${width}`);

    await page.getByRole("tab", { name: en ? "Purge log" : "سجل الإزالة" }).click();
    await expect(page).toHaveURL(/[?&]tab=purges/);
    await expect(page.getByRole("table")).toBeVisible();
    await expect(page.getByText(en ? /Unsent draft\s*.?RS-2026-000041/ : /مسودة لم تُرسل\s*.?RS-2026-000041/)).toBeVisible();
    await expect(page.getByText("Email to support, 14 October 2026", { exact: false })).toBeVisible();
    await page.getByRole("combobox", { name: en ? "Record" : "السجل" }).selectOption("DRAFT_INTAKE");
    await expect(page).toHaveURL(/[?&]class=DRAFT_INTAKE/);
    await noSideScroll(page);
    await shot(page, `retention-purges-${locale}-${width}`);
  });

  test(`a Care Coordination Manager erases a person on request (${locale}, ${width})`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    const sent = await serve(page, ["CARE_COORDINATION_MANAGER"], { "/compliance/retention/erasures/preview": preview, "/compliance/retention/purges": purges },
      { "/compliance/retention/erasures": result });
    await page.goto(`/${locale}/portal/control-center/retention?tab=erase`);
    const panel = page.getByRole("tabpanel");
    await panel.getByRole("textbox", { name: en ? /Case number/ : /رقم الحالة/ }).fill("rs-2026-000050");
    await panel.getByRole("button", { name: en ? "Show what would be erased" : "عرض ما سيُمحى" }).click();
    await expect(panel.getByText(en ? "Their sign-in account will be removed." : "سيُحذف حساب الدخول الخاص به.")).toBeVisible();
    await expect(page).toHaveURL(/[?&]case=RS-2026-000050/);
    // One primary action on the step: the erasure; looking up again is secondary.
    await expect(panel.locator("button:not(.cc-secondary)")).toHaveCount(1);
    const primary = panel.locator("button:not(.cc-secondary)");
    expect((await primary.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    await panel.getByRole("textbox", { name: en ? /Request reference/ : /مرجع الطلب/ }).fill(en ? "Email to support, 15 October 2026" : "بريد إلى الدعم، 15 أكتوبر 2026");
    await noSideScroll(page);
    await shot(page, `retention-erase-preview-${locale}-${width}`);
    await primary.click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByText(en ? "This cannot be undone." : "لا يمكن التراجع عن هذا.")).toBeVisible();
    await shot(page, `retention-erase-confirm-${locale}-${width}`);
    await dialog.getByRole("button", { name: en ? "Erase permanently" : "المحو نهائيًا" }).click();
    await expect(page.getByRole("heading", { name: en ? "The person is erased" : "مُحيت بيانات الشخص" })).toBeVisible();
    expect(sent).toEqual([{ path: "/compliance/retention/erasures", body: { caseNumber: "RS-2026-000050", reference: en ? "Email to support, 15 October 2026" : "بريد إلى الدعم، 15 أكتوبر 2026" } }]);
    await noSideScroll(page);
    await shot(page, `retention-erase-done-${locale}-${width}`);
  });
}
