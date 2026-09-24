import { expect, test, type Page } from "@playwright/test";
import { OIDC_AUTHORITY } from "./env";

// UX-6 live sanity: synthetic HTTP fixtures render the real built UI (no writes reach the backend; enforcement has its own
// integration tests). Credential Reviews queue and review page, clinician readiness, My credentials — desktop/mobile, EN/AR.
const days = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString();
const REVIEW_KEYS = ["provider.view", "credential.view", "credential.review", "credential.verify", "credential.reject", "credential.request_information", "credential.suspend"];
const OPS_KEYS = ["provider.view", "provider.update", "credential.view", "credential.submit", "provider.activate", "price_list.view", "availability.view", "provider.relationship.manage"];
const row = (o: Record<string, unknown>) => ({ id: "rev-1", organizationId: "org-a", organizationName: "Al Noor Hospital", practitionerId: "prac-1", clinicianName: "Dr Sara Ahmed", clinicianType: "CONSULTANT",
  credentialType: "MEDICAL_LICENSE", revisionNumber: 1, status: "SUBMITTED", dossierStatus: "OPEN", jurisdiction: "AE", expiresAt: days(400), submittedAt: "2026-09-01T09:00:00Z",
  reviewedBy: null, reviewerName: null, reviewedAt: null, evidenceCount: 1, ...o });
const queue = [
  row({}),
  row({ id: "rev-2", clinicianName: "د. عمر نبيل", practitionerId: "prac-2", organizationName: "Delta Health Group", organizationId: "org-b", clinicianType: "ASSOCIATE_DOCTOR", credentialType: "QUALIFICATION", expiresAt: days(21) }),
  row({ id: "rev-3", status: "UNDER_REVIEW", clinicianName: "Dr Mai Hassan", reviewedBy: "reviewer", reviewedAt: "2026-09-05T09:00:00Z" }),
  row({ id: "rev-4", status: "MORE_INFORMATION_REQUIRED", clinicianName: "Dr Nour Saad", credentialType: "IDENTITY_EVIDENCE", expiresAt: null, reviewedBy: "reviewer-2", reviewerName: "Rana Aziz" }),
];
const detail = (o: Record<string, unknown>) => ({ id: "rev-1", dossierId: "d-1", organizationId: "org-a", practitionerId: "prac-1", ownerSubject: "kc-sara", credentialType: "MEDICAL_LICENSE", revisionNumber: 1, policyVersionId: "p", status: "SUBMITTED", dossierStatus: "OPEN",
  expiresAt: days(400), submittedBy: "kc-ops", submittedAt: "2026-09-01T09:00:00Z", version: 0, evidenceIds: ["ev-1"],
  submittedFacts: { issuer: "Dubai Health Authority", referenceNumber: "DHA-MED-004512", issuedAt: "2024-10-14T12:00:00Z", expiresAt: days(400), jurisdiction: "AE" }, reviewedBy: null, reviewedAt: null,
  clinicianName: "Dr Sara Ahmed", clinicianType: "CONSULTANT", organizationName: "Al Noor Hospital", submittedByName: "Hany Nabil", reviewerName: null, reviewerView: true,
  evidence: [{ id: "ev-1", fileName: "DHA-licence-2026.pdf", contentType: "application/pdf", sizeBytes: 312000, securityCheck: "CLEAN", checkedAt: "2026-09-01T09:00:00Z", uploadedByName: "Hany Nabil", uploadedAt: "2026-09-01T09:00:00Z" }],
  history: [{ event: "SUBMITTED", revisionNumber: 1, at: "2026-09-01T09:00:00Z", actorName: "Hany Nabil", byYou: false, reason: null }], ...o });
const details: Record<string, unknown> = {
  "rev-1": detail({}),
  "rev-3": detail({ id: "rev-3", status: "UNDER_REVIEW", reviewedBy: "reviewer", history: [{ event: "REVIEW_STARTED", revisionNumber: 1, at: "2026-09-05T09:00:00Z", actorName: "You", byYou: true, reason: null }, { event: "SUBMITTED", revisionNumber: 1, at: "2026-09-01T09:00:00Z", actorName: "Hany Nabil", byYou: false, reason: null }] }),
  "rev-4": detail({ id: "rev-4", status: "MORE_INFORMATION_REQUIRED", credentialType: "IDENTITY_EVIDENCE", expiresAt: null, reviewedBy: "reviewer-2", reviewerName: "Rana Aziz",
    history: [{ event: "MORE_INFORMATION_REQUIRED", revisionNumber: 1, at: "2026-09-10T09:00:00Z", actorName: "Rana Aziz", byYou: false, reason: "Updated licence showing the current expiry date" }, { event: "REVIEW_STARTED", revisionNumber: 1, at: "2026-09-09T09:00:00Z", actorName: "Rana Aziz", byYou: false, reason: null }, { event: "SUBMITTED", revisionNumber: 1, at: "2026-09-01T09:00:00Z", actorName: "Hany Nabil", byYou: false, reason: null }] }),
  "rev-5": detail({ id: "rev-5", status: "VERIFIED", dossierStatus: "VERIFIED", expiresAt: days(21), reviewedBy: "reviewer-2", reviewerName: "Rana Aziz", history: [{ event: "VERIFIED", revisionNumber: 1, at: "2026-09-12T09:00:00Z", actorName: "Rana Aziz", byYou: false, reason: "Checked against the DHA register" }] }),
  "rev-6": detail({ id: "rev-6", status: "VERIFIED", dossierStatus: "VERIFIED", expiresAt: "2026-09-14T12:00:00Z", reviewedBy: "reviewer-2", reviewerName: "Rana Aziz", history: [{ event: "VERIFIED", revisionNumber: 1, at: "2025-09-12T09:00:00Z", actorName: "Rana Aziz", byYou: false, reason: "Register checked" }] }),
};
const organization = { id: "org-a", legalName: "Al Noor Hospital LLC", businessName: null, displayName: "Al Noor Hospital", type: "HOSPITAL", status: "ONBOARDING", countryCode: "AE", timeZone: "Asia/Dubai", defaultCurrency: "AED", legacyMappingStatus: null, version: 3 };
const member = { subject: "kc-sara", kind: "CLINICIAN", practitionerId: "prac-1", status: "ACTIVE", effectiveFrom: "2026-01-01T00:00:00Z", effectiveTo: null, invitationStatus: "ACTIVE", revision: 1, roles: ["CONSULTANT"], displayName: "Dr Sara Ahmed" };
const readiness = { identityProvisioned: true, organizationMembershipActive: true, providerProfileComplete: true, clinicianProfileComplete: true, requiredCredentialsSubmitted: true, requiredCredentialsVerified: false, mandatoryCredentialsUnexpired: true, requiredRelationshipsComplete: true, pricingSetupRequired: true, pricingSetupComplete: true, availabilitySetupRequired: true, availabilitySetupComplete: false, credentialReady: false,
  blockers: [{ code: "CREDENTIAL_MORE_INFORMATION_REQUIRED", message: "Identity or professional evidence needs more information before review can continue." }, { code: "AVAILABILITY_INCOMPLETE", message: "x" }, { code: "COMMERCIAL_ACCEPTANCE_MISSING", message: "y" }], readyForActivation: false, evaluatedAt: "2026-09-24T09:00:00Z" };
const requirements = [{ type: "IDENTITY_EVIDENCE", displayName: "Identity or professional evidence", mandatory: true, expiryRequired: false }, { type: "MEDICAL_LICENSE", displayName: "Professional medical license", mandatory: true, expiryRequired: true }, { type: "QUALIFICATION", displayName: "Professional qualification", mandatory: true, expiryRequired: false }];
const revisions = [
  { ...detail({}), id: "rev-4", credentialType: "IDENTITY_EVIDENCE", status: "MORE_INFORMATION_REQUIRED", expiresAt: null },
  { ...detail({}), id: "rev-5", status: "VERIFIED", dossierStatus: "VERIFIED", expiresAt: days(21) },
  { ...detail({}), id: "rev-7", credentialType: "QUALIFICATION", status: "UNDER_REVIEW", expiresAt: null },
];
const workspace = { practices: [{ organizationId: "org-a", organizationName: "Al Noor Hospital", organizationStatus: "ONBOARDING", roles: ["CONSULTANT"], relationships: [], managedClinicians: [], managedCliniciansTruncated: false,
  organizationCapabilities: [{ permission: "provider.view", allowed: true, recentAuthentication: false }],
  clinician: { practitionerId: "prac-1", displayName: "Dr Sara Ahmed", clinicianType: "CONSULTANT", setupStatus: "MORE_INFORMATION_REQUIRED", providerCredentialing: true, capabilities: ["credential.view"].map((permission) => ({ permission, allowed: true, recentAuthentication: false })) } }], truncated: false };

async function serve(page: Page, keys: string[], sub: string) {
  await page.addInitScript(({ authority, sub }) => sessionStorage.setItem(`oidc.user:${authority}:rehletshifaa-web`, JSON.stringify({ access_token: "synthetic-access", token_type: "Bearer", scope: "openid", profile: { sub }, expires_at: Math.floor(Date.now() / 1000) + 3600 })), { authority: OIDC_AUTHORITY, sub });
  const writes: string[] = [];
  await page.route("**/api/v1/**", async (route) => {
    const url = new URL(route.request().url()); const path = url.pathname.replace(/^\/api\/v1/, ""); const method = route.request().method();
    if (method === "OPTIONS") return route.fulfill({ status: 204 });
    if (method !== "GET") { writes.push(path); return route.fulfill({ status: 409, contentType: "application/json", body: JSON.stringify({ code: "BLOCKED_IN_LIVE_REVIEW", message: "Writes are blocked in this review" }) }); }
    let data: unknown = [];
    if (path.endsWith("/admin/access/me")) data = keys.map((permission) => ({ permission, allowed: true, reason: "ALLOWED" }));
    else if (path === "/admin/providers/credential-reviews") data = url.searchParams.get("view") === "completed" ? [row({ id: "rev-5", status: "VERIFIED", dossierStatus: "VERIFIED", reviewedBy: "reviewer", reviewedAt: "2026-09-12T09:00:00Z", expiresAt: days(21) })] : queue;
    else if (/\/credential-reviews\/rev-\d$/.test(path)) data = details[path.split("/").pop()!] ?? detail({});
    else if (path === "/admin/providers/org-a") data = { organization, members: [member], relationships: [] };
    else if (path.endsWith("/clinicians/prac-1/onboarding")) data = { organizationId: "org-a", practitionerId: "prac-1", clinicianType: "CONSULTANT", status: "MORE_INFORMATION_REQUIRED", jurisdiction: "AE", version: 4, ownerSubject: "kc-sara" };
    else if (path.endsWith("/clinicians/prac-1/readiness")) data = readiness;
    else if (path.endsWith("/credential-requirements")) data = requirements;
    else if (path.endsWith("/clinicians/prac-1/credentials")) data = revisions;
    else if (path.endsWith("/clinicians/prac-1/profile")) data = { registrationNumber: "DHA-1", specialty: "Cardiology", subspecialty: null, qualifications: "MBBS", jurisdiction: "AE", version: 4 };
    else if (path === "/admin/providers/clinicians") data = [{ organizationId: "org-a", organizationName: "Al Noor Hospital", organizationStatus: "ONBOARDING", organizationLegacyMapping: false, practitionerId: "prac-1", displayName: "Dr Sara Ahmed", clinicianType: "CONSULTANT", onboardingStatus: "MORE_INFORMATION_REQUIRED", membershipStatus: "ACTIVE", providerCredentialing: true, credentialsRequired: 3, credentialStatuses: { MORE_INFORMATION_REQUIRED: 1, VERIFIED: 1, UNDER_REVIEW: 1 } }];
    else if (path === "/provider-workspace/me") data = workspace;
    else if (path.startsWith("/provider-workspace/cases")) data = { items: [], page: 0, hasMore: false };
    else if (path === "/account/preferences") data = { displayName: null, locale: null };
    return route.fulfill({ contentType: "application/json", body: JSON.stringify(data) });
  });
  return writes;
}
async function sane(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBeTruthy();
  await expect(page.locator("h1")).toHaveCount(1);
}

for (const locale of ["en", "ar"] as const) test(`Credential reviews, readiness and My credentials (${locale})`, async ({ page }, testInfo) => {
  const en = locale === "en";
  const shot = async (name: string) => { await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" })); await page.screenshot({ path: testInfo.outputPath(`${name}-${locale}.png`), fullPage: true }); };
  const writes = await serve(page, REVIEW_KEYS, "reviewer");

  await page.goto(`/${locale}/portal/control-center/credentials`);
  await expect(page.getByRole("button", { name: en ? "Needs review 2" : "تحتاج إلى مراجعة 2" })).toBeVisible();
  await expect(page.locator(".cc-queue-list").getByText(en ? "Expiring soon" : "تنتهي قريبًا").first()).toBeVisible();
  await sane(page); await shot("queue-desktop");
  await page.getByRole("button", { name: en ? "More information required 1" : "مطلوب مزيد من المعلومات 1" }).click();
  await expect(page.getByText("Dr Nour Saad")).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await sane(page); await shot("queue-mobile");
  await page.setViewportSize({ width: 1280, height: 900 });

  for (const id of ["rev-1", "rev-3", "rev-4", "rev-5", "rev-6"]) {
    await page.goto(`/${locale}/portal/control-center/credentials/org-a/${id}`);
    await expect(page.getByText("DHA-MED-004512")).toBeVisible();
    await sane(page); await shot(`review-${id}-desktop`);
  }
  await expect(page.locator(".cc-review-status .cc-status")).toHaveText(en ? "Expired" : "منتهي الصلاحية");
  await page.goto(`/${locale}/portal/control-center/credentials/org-a/rev-3`);
  await page.getByRole("button", { name: en ? "Verify…" : "التحقق من الاعتماد…" }).click();
  await expect(page.getByRole("group", { name: en ? "Verify this credential?" : "التحقق من هذا الاعتماد؟" })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await sane(page); await shot("review-verify-mobile");
  expect(writes).toEqual([]);

  const ops = await page.context().newPage();
  await serve(ops, OPS_KEYS, "kc-ops");
  await ops.setViewportSize({ width: 1280, height: 900 });
  await ops.goto(`/${locale}/portal/control-center/providers/clinicians/org-a/prac-1?tab=overview`);
  await expect(ops.getByRole("heading", { name: en ? "Operational readiness" : "الجاهزية التشغيلية" })).toBeVisible();
  await ops.screenshot({ path: testInfo.outputPath(`clinician-readiness-${locale}.png`), fullPage: true });
  await ops.goto(`/${locale}/portal/control-center/providers/clinicians/org-a/prac-1?tab=credentials`);
  await expect(ops.getByText(en ? "Updated licence showing the current expiry date" : "Updated licence showing the current expiry date")).toBeVisible();
  await ops.screenshot({ path: testInfo.outputPath(`clinician-credentials-${locale}.png`), fullPage: true });
  await ops.close();

  const self = await page.context().newPage();
  await serve(self, [], "kc-sara");
  await self.setViewportSize({ width: 1280, height: 900 });
  await self.goto(`/${locale}/portal/practice`);
  await self.getByRole("link", { name: en ? "My credentials" : "اعتماداتي" }).first().click();
  await expect(self.getByText("Updated licence showing the current expiry date")).toBeVisible();
  await expect(self.getByRole("button", { name: en ? "Submit a new version" : "إرسال نسخة جديدة" })).toHaveCount(0);
  await self.screenshot({ path: testInfo.outputPath(`my-credentials-${locale}.png`), fullPage: true });
  await self.close();
});
