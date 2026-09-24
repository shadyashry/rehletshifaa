import { expect, test, type Page } from "@playwright/test";
import { OIDC_AUTHORITY } from "./env";

// UX-8 live sanity: synthetic session + HTTP fixtures render the real built UI. Every write is blocked and recorded; the
// Journey check/test commands are answered by fixtures (they are side-effect free on the backend too). Nothing publishes,
// nothing touches production intake or routing.
const org = { id: "org-1", legalName: "Al Noor Hospital LLC", businessName: "Al Noor", displayName: "Al Noor Hospital", type: "HOSPITAL", status: "ONBOARDING", countryCode: "EG", timeZone: "Africa/Cairo", defaultCurrency: "EGP", legacyMappingStatus: null, version: 4 };
const member = { subject: "kc-salma", kind: "CLINICIAN", practitionerId: "prac-1", status: "ACTIVE", effectiveFrom: "2026-01-01T00:00:00Z", effectiveTo: null, invitationStatus: "ACTIVE", revision: 1, roles: ["CONSULTANT"], displayName: "Dr Salma Farouk" };
const clinicianRow = { organizationId: "org-1", organizationName: "Al Noor Hospital", organizationStatus: "ONBOARDING", organizationLegacyMapping: false, practitionerId: "prac-1", displayName: "Dr Salma Farouk", clinicianType: "CONSULTANT", onboardingStatus: "PROFILE_INCOMPLETE", membershipStatus: "ACTIVE", providerCredentialing: true, credentialsRequired: 2, credentialStatuses: { VERIFIED: 1, UNDER_REVIEW: 1 } };
const price = (o: Record<string, unknown>) => ({ organizationId: "org-1", serviceCode: "CARD-CONSULT", serviceName: "Cardiology consultation", category: "Consultation", scopeType: "ORGANIZATION", scopeKey: "ORGANIZATION", clinicianId: null, amount: "3500.00", currency: "EGP", effectiveFrom: "2026-01-01T00:00:00Z", effectiveTo: null, status: "ACTIVE", versionNumber: 1, consultantApprovalRequired: false, consultantApprovedBy: null, legacyCatalogId: null, revision: 0, ...o });
const prices = [
  price({ id: "p-org" }),
  price({ id: "p-own", scopeType: "CONSULTANT", scopeKey: "prac-1", clinicianId: "prac-1", amount: "4200.00", versionNumber: 2, legacyCatalogId: "cat-1" }),
  price({ id: "p-draft", scopeType: "CONSULTANT", scopeKey: "prac-1", clinicianId: "prac-1", amount: "4500.00", versionNumber: 3, status: "DRAFT", effectiveFrom: "2026-11-01T00:00:00Z", consultantApprovalRequired: true }),
  price({ id: "p-echo", serviceCode: "CARD-ECHO", serviceName: "Echocardiogram", amount: "4500.00", versionNumber: 1 }),
];
const graph = { nodes: [
  { key: "start", label: "Start", type: "START", actorType: "SYSTEM", action: null, entry: null, exit: null, sla: null, timerMinutes: null, blocking: false },
  { key: "assign", label: "Assign Consultant", type: "STAFF_TASK", actorType: "COORDINATOR", action: "ASSIGN_CONSULTANT", entry: null, exit: null, sla: null, timerMinutes: null, blocking: true },
  { key: "end", label: "End", type: "END", actorType: "SYSTEM", action: null, entry: null, exit: null, sla: null, timerMinutes: null, blocking: false },
], edges: [{ key: "e1", from: "start", to: "assign", condition: null }] };
const v = (o: Record<string, unknown>) => ({ definitionId: "def-1", revision: 2, createdBy: "kc-maker", graph, graphHash: "9f2c1a", validationSummary: null, simulationSummary: null, publishedAt: null, retiredAt: null, runtimeDeployment: "NOT_DEPLOYED", ...o });
const versions = [v({ id: "v-1", number: 1, status: "PUBLISHED", publishedAt: "2026-09-10T08:00:00Z", simulationSummary: "COMPLETED", runtimeDeployment: "DEPLOYED" }), v({ id: "v-2", number: 2, status: "PENDING_APPROVAL", simulationSummary: "COMPLETED" }), v({ id: "v-3", number: 3, status: "DRAFT" })].slice(0, 2);
const draft = v({ id: "v-2", number: 2, status: "DRAFT" });
const definition = { id: "def-1", key: "INTERNATIONAL_CARE", name: "International Care Journey", createdAt: "2026-09-01T00:00:00Z" };

const fixtures: Record<string, unknown> = {
  "/admin/providers/clinicians": [clinicianRow],
  "/admin/providers/org-1": { organization: org, members: [member], relationships: [] },
  "/admin/providers/org-1/clinicians/prac-1/onboarding": { organizationId: "org-1", practitionerId: "prac-1", clinicianType: "CONSULTANT", status: "PROFILE_INCOMPLETE", jurisdiction: "EG", version: 1, ownerSubject: "kc-salma" },
  "/admin/providers/org-1/clinicians/prac-1/prices": prices,
  "/admin/providers/org-1/clinicians/prac-1/readiness": { identityProvisioned: true, organizationMembershipActive: true, providerProfileComplete: true, clinicianProfileComplete: true, requiredCredentialsSubmitted: true, requiredCredentialsVerified: false, mandatoryCredentialsUnexpired: true, requiredRelationshipsComplete: true, pricingSetupRequired: true, pricingSetupComplete: true, availabilitySetupRequired: true, availabilitySetupComplete: false, credentialReady: false, blockers: [{ code: "COMMERCIAL_ACCEPTANCE_MISSING", message: "Required commercial or legal acceptance is missing." }], readyForActivation: false, evaluatedAt: "2026-09-24T00:00:00Z" },
  "/admin/practitioners": [{ id: "d-1", displayName: "Dr Omar Said", specialty: "Cardiology", careCategory: "cardiology", credentialingStatus: "VERIFIED" }, { id: "prac-1", displayName: "Dr Salma Farouk", specialty: "Cardiology", careCategory: "cardiology", credentialingStatus: "UNDER_REVIEW", providerCredentialing: true }],
  "/admin/practitioners/d-1/catalog": [{ id: "c1", serviceCode: "CARD-CONSULT", serviceName: "Cardiology consultation", category: "Consultation", priceEgp: 3500, active: true }],
  "/admin/fx-rates": [{ currency: "EGP", rate: 1, rateDate: "2026-09-24", source: "BASE" }, { currency: "USD", rate: 0.0206, rateDate: "2026-09-24", source: "API" }, { currency: "EUR", rate: 0.0189, rateDate: "2026-09-24", source: "MANUAL" }, { currency: "SAR", rate: 0.0773, rateDate: "2026-09-24", source: "FALLBACK" }],
  "/finance/commercial-policies": [{ id: "m1", careCategory: null, marginRate: 0.12, active: true, version: 3, validFrom: "2026-06-01" }, { id: "m2", careCategory: "cardiology", marginRate: 0.15, active: true, version: 1, validFrom: "2026-08-01" }],
  "/finance/deposit-policies": [{ id: "d1", careCategory: null, coordinationDepositEgp: 5000, active: true, version: 2, validFrom: "2026-06-01" }],
  "/admin/journeys/summaries": [{ ...definition, liveVersion: 1, livePublishedAt: "2026-09-10T08:00:00Z", publishedVersions: 1, draftVersion: 2, draftStatus: "PENDING_APPROVAL", versions: 2, lastActivityAt: "2026-09-23T15:30:00Z" }],
  "/admin/journeys/def-1": { definition, versions },
  "/admin/journey-cutover": { productionIntakeEnabled: false, runtimeEnabled: false },
  "/admin/journeys/def-1/history": [{ actor: "kc-checker", entity: "v-1", action: "JOURNEY_PUBLISHED", outcome: "SUCCESS", reason: "graph=9f2c1a", changeReason: "Approved after operations review", occurredAt: "2026-09-10T08:00:00Z" }, { actor: "kc-maker", entity: "v-2", action: "JOURNEY_SUBMITTED", outcome: "SUCCESS", reason: "revision=2", changeReason: null, occurredAt: "2026-09-23T15:30:00Z" }],
  "/admin/journeys/registry": [{ key: "ASSIGN_CONSULTANT", label: "Assign Consultant", actors: ["COORDINATOR"], stage: "STAFF_TASK", sourceContract: "x", permissionReferences: [] }],
  "/admin/journeys/registry/metadata": { actorTypes: ["PATIENT", "COORDINATOR", "SYSTEM"], stageTypes: ["START", "STAFF_TASK", "END"], conditionFacts: ["CLINICAL_ACCEPTED", "DEPOSIT_SATISFIED"], maxNodes: 200, maxEdges: 400, cyclePolicy: "ACYCLIC_ONLY", runtimeDeployment: "NOT_DEPLOYED" },
  "/provider-workspace/me": { practices: [{ organizationId: "org-1", organizationName: "Al Noor Hospital", organizationStatus: "ONBOARDING", roles: ["CONSULTANT"], relationships: [], managedClinicians: [], managedCliniciansTruncated: false,
    organizationCapabilities: [{ permission: "provider.view", allowed: true, recentAuthentication: false }],
    clinician: { practitionerId: "prac-1", displayName: "Dr Salma Farouk", clinicianType: "CONSULTANT", setupStatus: "PROFILE_INCOMPLETE", providerCredentialing: true, capabilities: ["price_list.view"].map((permission) => ({ permission, allowed: true, recentAuthentication: false })) } }], truncated: false },
};
const KEYS = ["price_list.view", "price_list.manage", "price_list.publish", "provider.view", "provider.update", "journey.view", "journey.create", "journey.edit_draft", "journey.validate", "journey.simulate", "journey.submit", "journey.publish", "journey.approve", "journey.retire"];

async function serve(page: Page, keys: string[], roles: string[], extra: Record<string, unknown> = {}) {
  await page.addInitScript(({ authority, roles }) => sessionStorage.setItem(`oidc.user:${authority}:rehletshifaa-web`, JSON.stringify({ access_token: "synthetic-access", token_type: "Bearer", scope: "openid", profile: { sub: "kc-checker", name: "Mona Checker", realm_access: { roles } }, expires_at: Math.floor(Date.now() / 1000) + 3600 })), { authority: OIDC_AUTHORITY, roles });
  const writes: string[] = [];
  const data: Record<string, unknown> = { ...fixtures, ...extra };
  await page.route("**/api/v1/**", async (route) => {
    const url = new URL(route.request().url()); const path = url.pathname.replace(/^\/api\/v1/, ""); const method = route.request().method();
    if (method === "OPTIONS") return route.fulfill({ status: 204 });
    if (method === "POST" && path.endsWith("/validate")) return route.fulfill({ contentType: "application/json", body: JSON.stringify({ version: { ...draft, status: "DRAFT" }, result: { errors: [{ code: "OUTGOING_PATH", nodeKey: "assign", message: "Assign Consultant has no outgoing path." }, { code: "NO_COMPLETION", nodeKey: "assign", message: "Assign Consultant has no path to completion." }], warnings: [{ code: "RUNTIME_NOT_DEPLOYED", nodeKey: null, message: "This configuration is a dry-run domain model; existing cases continue using the current journey." }] } }) });
    if (method !== "GET") { writes.push(`${method} ${path}`); return route.fulfill({ status: 409, contentType: "application/json", body: JSON.stringify({ code: "BLOCKED_IN_LIVE_REVIEW", message: "Writes are blocked in this review." }) }); }
    let body: unknown = [];
    if (path.endsWith("/admin/access/me")) body = keys.map((permission) => ({ permission, allowed: true, reason: "ALLOWED" }));
    else if (path in data) body = data[path];
    else if (path.endsWith("/prices/effective")) body = url.searchParams.get("serviceCode") === "CARD-ECHO" ? { amount: "4500.00", currency: "EGP", sourceLevel: "ORGANIZATION", priceId: "p-echo", version: 1, effectiveFrom: "2026-01-01T00:00:00Z", effectiveTo: null } : { amount: "4200.00", currency: "EGP", sourceLevel: "CONSULTANT", priceId: "p-own", version: 2, effectiveFrom: "2026-01-01T00:00:00Z", effectiveTo: null };
    else if (path.endsWith("/versions/v-1/runtime")) body = { journeyVersionId: "v-1", status: "DEPLOYED", compilerVersion: "flowable-bpmn-1", artifactHash: "a7e41c0d" };
    else if (path === "/notifications") body = { items: [], unread: 0 };
    else if (path === "/account/preferences") body = { displayName: null, locale: null };
    else if (path.startsWith("/provider-workspace/cases")) body = { items: [], page: 0, hasMore: false };
    return route.fulfill({ contentType: "application/json", body: JSON.stringify(body) });
  });
  return writes;
}
const sane = async (page: Page) => {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBeTruthy();
  await expect(page.locator("h1")).toHaveCount(1);
};

for (const locale of ["en", "ar"] as const) test(`Commercial: Price Lists, Exchange Rates, Margin & Deposit (${locale})`, async ({ page }, testInfo) => {
  const en = locale === "en";
  const shot = async (name: string) => { await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" })); await page.screenshot({ path: testInfo.outputPath(`${name}-${locale}.png`), fullPage: true }); };
  const writes = await serve(page, KEYS, ["SYSTEM_ADMIN", "FINANCE", "FINANCE_LEAD"]);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(`/${locale}/portal/control-center/commercial/prices?org=org-1&clinician=prac-1`);
  await expect(page.getByText(en ? /Overrides the organization price for this service/ : /يحل محل سعر الجهة لهذه الخدمة/)).toBeVisible();
  await expect(page.getByText(en ? /Using organization price · Organization: Al Noor Hospital/ : /يُطبَّق سعر الجهة · الجهة: Al Noor Hospital/)).toBeVisible();
  await sane(page); await shot("price-lists-desktop");
  await page.getByRole("heading", { level: 4, name: en ? "Clinician-specific price" : "سعر خاص بالطبيب" }).first().locator("..").getByRole("button", { name: en ? "Retire" : "إنهاء" }).click();
  await expect(page.getByRole("dialog")).toContainText(en ? "the organization price applies to this clinician" : "يُطبَّق سعر الجهة على هذا الطبيب");
  await shot("price-retire-dialog-desktop");
  await page.keyboard.press("Escape");
  await page.setViewportSize({ width: 390, height: 844 });
  await sane(page); await shot("price-lists-mobile");
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.getByRole("button", { name: en ? "Direct clinician prices" : "أسعار الأطباء المباشرين" }).click();
  const picker = page.getByRole("combobox", { name: en ? /Direct clinician/ : /الطبيب المباشر/ });
  await expect(picker.locator("option")).toHaveText([en ? "Choose a Direct clinician" : "اختر طبيبًا مباشرًا", "Dr Omar Said — Cardiology"]);
  await picker.selectOption("d-1");
  await sane(page); await shot("price-lists-direct-desktop");
  await page.goto(`/${locale}/portal/control-center/commercial/exchange-rates`);
  await expect(page.getByText(en ? /not live market prices/ : /ليست أسعار سوق لحظية/)).toBeVisible();
  await sane(page); await shot("exchange-rates-desktop");
  await page.setViewportSize({ width: 390, height: 844 });
  await sane(page); await shot("exchange-rates-mobile");
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(`/${locale}/portal/control-center/commercial/margin-deposit`);
  await expect(page.getByRole("note")).toContainText(en ? "Internal only." : "داخلي فقط.");
  await page.getByLabel(en ? "Margin %" : "الهامش %").fill("13");
  await page.getByRole("button", { name: en ? "Review new version" : "مراجعة الإصدار الجديد" }).first().click();
  await expect(page.getByRole("dialog")).toContainText(en ? "Existing estimates and final quotes keep the margin" : "تحتفظ بالهامش الذي حُسبت به");
  await shot("margin-deposit-confirm-desktop");
  await page.keyboard.press("Escape");
  await page.setViewportSize({ width: 390, height: 844 });
  await sane(page); await shot("margin-deposit-mobile");
  expect(writes).toEqual([]);
});

test("Organization profile (en)", async ({ page }, testInfo) => {
  const shot = async (name: string) => { await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" })); await page.screenshot({ path: testInfo.outputPath(`${name}.png`), fullPage: true }); };
  const writes = await serve(page, KEYS, []);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/en/portal/control-center/providers/org-1");
  await expect(page.getByRole("heading", { name: "Organization profile" })).toBeVisible();
  await sane(page); await shot("org-profile-desktop");
  await page.getByRole("button", { name: "Edit profile" }).click();
  await page.getByRole("button", { name: "Save profile" }).click();
  await expect(page.locator("#org-profile-errors")).toContainText("Say why you are making this change.");
  await shot("org-profile-edit-errors-desktop");
  await page.setViewportSize({ width: 390, height: 844 });
  await sane(page); await shot("org-profile-edit-mobile");
  expect(writes).toEqual([]);
});

for (const locale of ["en", "ar"] as const) test(`Care Journeys: list, detail, check, test, approval (${locale})`, async ({ page }, testInfo) => {
  const en = locale === "en";
  const shot = async (name: string) => { await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" })); await page.screenshot({ path: testInfo.outputPath(`${name}-${locale}.png`), fullPage: true }); };
  const writes = await serve(page, KEYS, []);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(`/${locale}/portal/control-center/journeys`);
  await expect(page.getByText(en ? "Needs approval" : "يحتاج موافقة")).toBeVisible();
  await sane(page); await shot("journey-list-desktop");
  await page.goto(`/${locale}/portal/control-center/journeys/def-1`);
  await expect(page.getByText(en ? /Production intake is off/ : /الاستقبال الفعلي متوقف/)).toBeVisible();
  await sane(page); await shot("journey-detail-desktop");
  await page.setViewportSize({ width: 390, height: 844 });
  await sane(page); await shot("journey-detail-mobile");
  await page.setViewportSize({ width: 1280, height: 900 });
  // J-1: the reason saved with each governed action shows in History; older entries say none was recorded.
  await page.getByText(en ? "History" : "السجل", { exact: true }).click();
  await expect(page.getByText(en ? "Reason: Approved after operations review" : "السبب: Approved after operations review")).toBeVisible();
  await expect(page.getByText(en ? "Reason not recorded" : "لم يُسجَّل سبب", { exact: true })).toBeVisible();
  await shot("journey-history-reasons-desktop");
  await page.getByText(en ? "Advanced — technical details" : "متقدم — تفاصيل تقنية").click();
  await expect(page.getByText(/a7e41c0d/)).toBeVisible();
  await shot("journey-advanced-desktop");
  // Draft: Check tab with backend findings tied to named steps (validate is answered by a fixture).
  await page.route("**/api/v1/admin/journeys/def-1", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ definition, versions: [versions[0], draft] }) }));
  await page.goto(`/${locale}/portal/control-center/journeys/def-1/versions/v-2?tab=validation`);
  await page.getByLabel(en ? "Change note" : "ملاحظة التغيير").fill(en ? "Add the travel step" : "إضافة خطوة السفر");
  await page.getByRole("button", { name: en ? "Run check" : "تشغيل الفحص" }).click();
  await expect(page.getByText(en ? "2 problems must be fixed before this version can be tested." : "يجب إصلاح 2 مشكلة قبل اختبار هذا الإصدار.")).toBeVisible();
  await sane(page); await shot("journey-check-desktop");
  await page.getByRole("tab", { name: en ? "Test journey" : "اختبار الرحلة" }).click();
  await expect(page.getByText(en ? /Testing does not publish or change the live journey/ : /الاختبار لا ينشر/)).toBeVisible();
  await shot("journey-test-desktop");
  // Pending approval: the publish confirmation (opened, never confirmed).
  await page.unroute("**/api/v1/admin/journeys/def-1");
  await page.goto(`/${locale}/portal/control-center/journeys/def-1/versions/v-2?tab=publish`);
  await page.getByRole("button", { name: en ? "Publish" : "نشر", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText(en ? "Production intake is off" : "الاستقبال الفعلي متوقف");
  await shot("journey-publish-confirm-desktop");
  await page.setViewportSize({ width: 390, height: 844 });
  await shot("journey-publish-confirm-mobile");
  expect(writes).toEqual([]);
});

test("Provider Workspace: my prices (en)", async ({ page }, testInfo) => {
  const writes = await serve(page, [], ["PATIENT"]);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/en/portal/practice?view=prices");
  await expect(page.getByText(/Overrides the organization price for this service/)).toBeVisible();
  await expect(page.getByRole("button", { name: /New price|Edit draft|Publish|Retire/ })).toHaveCount(0);
  await sane(page); await page.screenshot({ path: testInfo.outputPath("workspace-prices-desktop.png"), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await sane(page); await page.screenshot({ path: testInfo.outputPath("workspace-prices-mobile.png"), fullPage: true });
  expect(writes).toEqual([]);
});
