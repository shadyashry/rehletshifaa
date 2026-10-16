import { expect, test, type Page } from "@playwright/test";

import { OIDC_AUTHORITY } from "./env";
import { meFor, routeMe } from "./me-fixture";
import { PRELIMINARY_ESTIMATE, PROPOSAL_TOKEN, openProposalView, setupProposalLink } from "./proposal-fixture";

/**
 * P1-19 session 2 (hospital-agreement audit): Control Center › Compliance (declaration review, a drawn sample), Virtual Clinic ›
 * Affiliations (no current declaration, the yearly form) and the final quote's payees apart on the secure link, in English and
 * Arabic at 390 and 1440. Synthetic fixtures only; writes are recorded, never sent. Screenshots go to test-results (not tracked).
 */
const noSideScroll = (page: Page) => expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
const shot = (page: Page, name: string) => page.screenshot({ path: `test-results/p1-19/${name}.png`, fullPage: true });

const declaration = {
  id: "d1", practitionerId: "p1", consultantName: "Dr Ahmed Saleh", declaredAt: "2026-10-01T09:00:00Z", validUntil: "2027-10-01T09:00:00Z", current: true,
  attestationVersion: "affiliation-attestation-2026-10", reviewStatus: "PENDING",
  lines: [{ facilityId: "f1", facilityName: "Nile Heart Hospital", kind: "PRIVILEGES" }, { facilityId: "f1", facilityName: "Nile Heart Hospital", kind: "FINANCIAL_INTEREST", note: "5% shareholding" }],
};
const sample = {
  sample: { id: "s1", month: "2026-09", kind: "MONTHLY", requestedSize: 5, candidates: 7, cases: 1, pending: 1, drawnAt: "2026-10-01T03:00:00Z" },
  cases: [{ caseId: "c1", caseNumber: "RS-2026-000123", closedAt: "2026-09-20T09:00:00Z", consultantName: "Dr Ahmed Saleh", facilityName: "Nile Heart Hospital",
    record: { statementNumber: "ST-2026-0007", statementTotalChargedEgp: "120000.00", finalQuoteCONSULTANTEgp: "80000.00", finalQuoteFACILITYEgp: "40000.00" },
    mismatches: ["UNAPPROVED_EXTRA"], reviewStatus: "PENDING" }],
};
const directory = [{ id: "f1", name: "Nile Heart Hospital", city: "Cairo", kind: "HOSPITAL", accreditationStatus: "CURRENT", packages: [] }];
const clinic = {
  practitionerId: "p1", relation: "OWNER", permissions: ["PROFILE", "SCHEDULE", "SERVICES"],
  professional: { displayName: "Dr Ahmed Saleh", specialty: "Cardiology", credentialingStatus: "VERIFIED", credentialsCurrent: true, capabilities: [], availabilityStatus: "AVAILABLE", assignable: false, practitionerVersion: 1 },
  publicProfile: {}, draft: null, managerChangesRequireApproval: true, services: [], pendingChanges: [], slots: [], managers: [], version: 1,
};

async function serve(page: Page, roles: string[], extraPermissions: string[], data: Record<string, unknown>) {
  await page.addInitScript(({ authority }) => sessionStorage.setItem(`oidc.user:${authority}:rehletshifaa-web`, JSON.stringify({
    access_token: "synthetic-access", token_type: "Bearer", scope: "openid", profile: { sub: "kc-staff", name: "Synthetic Staff", auth_time: Math.floor(Date.now() / 1000) },
    expires_at: Math.floor(Date.now() / 1000) + 3600 })), { authority: OIDC_AUTHORITY });
  const writes: { path: string; body: unknown }[] = [];
  await page.route("**/api/v1/**", async (route) => {
    const url = new URL(route.request().url()); const path = url.pathname.replace(/^\/api\/v1/, ""); const method = route.request().method();
    if (method === "OPTIONS") return route.fulfill({ status: 204 });
    if (method !== "GET") { writes.push({ path, body: route.request().postDataJSON() }); return route.fulfill({ status: 409, contentType: "application/json", body: JSON.stringify({ code: "BLOCKED_IN_REVIEW", message: "Writes are blocked in this review." }) }); }
    const body = path in data ? data[path] : path === "/notifications" ? { items: [], unread: 0 } : path === "/account/preferences" ? { displayName: null, locale: null } : [];
    return route.fulfill({ contentType: "application/json", body: JSON.stringify(body) });
  });
  // The fixture's tables predate P1-19; add this phase's grants (RolePolicy) on top of the role's.
  const me = meFor("kc-staff", roles, { displayName: "Synthetic Staff" });
  await routeMe(page, { ...me, permissions: [...new Set([...me.permissions, ...extraPermissions])].sort() });
  return writes;
}

for (const locale of ["en", "ar"] as const) for (const width of [390, 1440]) {
  const en = locale === "en";

  test(`Compliance reviews a declaration and opens a sample (${locale}, ${width})`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await serve(page, ["COMPLIANCE_AUDITOR"], ["AFFILIATION_READ", "SCORECARD_READ", "AUDIT_SAMPLE_READ", "COMPLIANCE_REVIEW", "FACILITY_READ", "INCIDENT_READ"], {
      "/compliance/affiliations/declarations": [declaration], "/compliance/audit-samples": [sample.sample], "/compliance/audit-samples/s1": sample,
    });
    await page.goto(`/${locale}/portal/control-center/compliance`);
    await expect(page.getByRole("heading", { level: 1, name: en ? "Compliance" : "الامتثال" })).toBeVisible();
    await expect(page.locator("h1")).toHaveCount(1);
    await page.getByRole("button", { name: en ? "Open Dr Ahmed Saleh's declaration" : "فتح تصريح Dr Ahmed Saleh" }).click();
    await expect(page.getByText("5% shareholding")).toBeVisible();
    const panel = page.getByRole("tabpanel");
    // One primary action on the surface: record the review (back is secondary).
    await expect(panel.locator("button:not(.cc-secondary)")).toHaveCount(1);
    await panel.getByRole("radio", { name: en ? /Finding: Consultant Operations/ : /ملاحظة: تتابعها/ }).check();
    await noSideScroll(page);
    await shot(page, `compliance-declaration-${locale}-${width}`);

    await page.getByRole("tab", { name: en ? "Audit samples" : "عينات التدقيق" }).click();
    await page.getByRole("button", { name: en ? "Open sample 2026-09" : "فتح عينة 2026-09" }).click();
    await expect(page.getByText(en ? "The hospital billed an extra nobody approved." : "فوترت المستشفى بندًا إضافيًا لم يعتمده أحد.")).toBeVisible();
    await expect(page.getByText("ST-2026-0007")).toBeVisible();
    await noSideScroll(page);
    await shot(page, `compliance-sample-${locale}-${width}`);
  });

  test(`a Consultant with no current declaration sees why and files one (${locale}, ${width})`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    const writes = await serve(page, ["CONSULTANT"], ["AFFILIATION_DECLARE", "AFFILIATION_READ"], {
      "/clinics/mine": [{ practitionerId: "p1", consultantName: "Dr Ahmed Saleh", relation: "OWNER", permissions: ["PROFILE", "SCHEDULE", "SERVICES"] }],
      "/clinics/p1": clinic, "/facilities/directory": directory,
      "/clinics/p1/affiliations": { practitionerId: "p1", declarationCurrent: false, renewBy: null, attestationVersion: "affiliation-attestation-2026-10", current: null, history: [], flags: [] },
    });
    await page.goto(`/${locale}/portal/virtual-clinic`);
    await page.getByRole("tab", { name: en ? "Affiliations" : "الارتباطات" }).click();
    await expect(page.getByText(en ? "No current declaration: you cannot receive new cases." : "لا يوجد تصريح ساري: لا يمكنك استقبال حالات جديدة.")).toBeVisible();
    await page.getByRole("combobox", { name: en ? "Facility" : "المنشأة" }).selectOption("f1");
    await page.getByRole("button", { name: en ? "Add facility" : "إضافة المنشأة" }).click();
    await page.getByRole("checkbox", { name: en ? "Admitting or practising privileges" : "امتيازات إدخال المرضى أو الممارسة" }).check();
    await page.getByRole("checkbox", { name: en ? /I declare that this list is complete/ : /أُقرّ بأن هذه القائمة كاملة/ }).check();
    // 44px targets on the form's own controls.
    const remove = page.getByRole("button", { name: en ? "Remove Nile Heart Hospital" : "إزالة Nile Heart Hospital" });
    expect((await remove.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    await expect(page.locator("main .btn-primary")).toHaveCount(1);
    await noSideScroll(page);
    await shot(page, `affiliations-${locale}-${width}`);
    await page.getByRole("button", { name: en ? "File declaration" : "تقديم التصريح" }).click();
    await expect.poll(() => writes.find((w) => w.path === "/clinics/p1/affiliations")?.body).toEqual({
      lines: [{ facilityId: "f1", kind: "PRIVILEGES" }], attested: true, attestationVersion: "affiliation-attestation-2026-10" });
  });

  test(`the final quote shows the Consultant's and the hospital's lines apart on the secure link (${locale}, ${width})`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await setupProposalLink(page, { ...PRELIMINARY_ESTIMATE, documentType: "FINAL_TREATMENT_QUOTE", totalMin: null, totalMax: null, totalExpected: 2000,
      items: [
        { id: "i1", category: "MEDICAL", description: "Consultant's fee for the procedure", quantity: 1, unitPrice: 1600, optional: false, payee: "CONSULTANT" },
        { id: "i2", category: "MEDICAL", description: "Hospital stay, cath lab and implant", quantity: 1, unitPrice: 400, optional: false, payee: "FACILITY" },
      ], payeeTotals: [{ payee: "CONSULTANT", total: 1600 }, { payee: "FACILITY", total: 400 }] });
    await page.goto(`/${locale}/proposal/${PROPOSAL_TOKEN}`);
    await openProposalView(page);
    const payees = page.getByRole("region", { name: en ? "Who is paid" : "لمن يُدفع" });
    await expect(payees).toBeVisible();
    await expect(payees.getByText(en ? "Paid to the hospital" : "يُدفع للمستشفى")).toBeVisible();
    if (en) await expect(payees.getByText("$400")).toBeVisible();
    await noSideScroll(page);
    await payees.scrollIntoViewIfNeeded();
    await shot(page, `final-quote-payees-${locale}-${width}`);
  });
}
