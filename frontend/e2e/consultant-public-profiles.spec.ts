import { expect, test, type Page } from "@playwright/test";
import path from "node:path";
import { OIDC_AUTHORITY } from "./env";
import { meFor, routeMe } from "./me-fixture";

const practitionerId = "649ae588-0f5d-58f6-a2a3-606a57e2c4ce";
const contentEn = {
  initials: "AA", name: "Dr Ahmed AlAshry", credentials: "MD", achievementBadges: ["Interventional cardiology"], specialty: "Interventional Cardiology",
  role: "Consultant Cardiologist", location: "Cairo, Egypt", summary: "Synthetic preview copy for the public-profile editor.",
  cardSummary: "Synthetic bilingual card preview for staff review.", expertise: { anchor: "Complex coronary intervention", areas: ["Coronary angiography", "PCI planning"] },
  distinction: "Synthetic fixture", signals: ["CV supplied"], focusAreas: ["Coronary intervention"], qualifications: ["Synthetic qualification"],
  appointments: ["Synthetic appointment"], professionalStanding: [], verification: "Synthetic fixture for visual QA.", achievements: [], externalLinks: [],
};
const contentAr = {
  ...contentEn, initials: "أع", name: "د. أحمد العشري", credentials: "دكتوراه", achievementBadges: ["قسطرة القلب التداخلية"], specialty: "قسطرة القلب التداخلية",
  role: "استشاري أمراض القلب", location: "القاهرة، مصر", summary: "نص اصطناعي لمعاينة محرر الملف العام.", cardSummary: "معاينة اصطناعية للبطاقة العامة باللغتين.",
  expertise: { anchor: "التدخلات التاجية المعقدة", areas: ["تصوير الشرايين التاجية", "تخطيط القسطرة العلاجية"] }, distinction: "بيانات اختبار اصطناعية",
  signals: ["سيرة ذاتية مقدمة"], focusAreas: ["التدخلات التاجية"], qualifications: ["مؤهل اصطناعي"], appointments: ["منصب اصطناعي"], verification: "بيانات اصطناعية للاختبار البصري.",
};
const consultants = [
  { id: practitionerId, displayName: "Dr Ahmed AlAshry", specialty: "Interventional Cardiology", subspecialty: "Complex PCI", careCategory: "cardiology", credentialingStatus: "VERIFIED", availabilityStatus: "AVAILABLE", accountStatus: "ACTIVE" },
  { id: "f03f297d-baa6-5b37-a8f4-fe3d2c10ad02", displayName: "Dr Hanan Elshoura", specialty: "Rheumatology & Rehabilitation", careCategory: "rheumatology-rehabilitation", credentialingStatus: "UNDER_REVIEW", availabilityStatus: "UNAVAILABLE", accountStatus: "ACTIVE" },
  { id: "16d603df-9d1b-56ae-a523-a0bfcc7c9431", displayName: "Dr Mostafa Farid", specialty: "Interventional Neuroradiology", careCategory: "interventional-neuroradiology", credentialingStatus: "VERIFIED", availabilityStatus: "AVAILABLE", accountStatus: "ACTIVE" },
];
const profiles = [
  { practitionerId, slug: "ahmed-alashry", published: true, sortOrder: 1, version: 3, affiliationReady: true, priceListReady: true },
  { practitionerId: consultants[1].id, slug: "hanan-elshoura", published: false, sortOrder: 2, version: 1, affiliationReady: false, priceListReady: true },
  { practitionerId: consultants[2].id, slug: "mostafa-farid", published: true, sortOrder: 3, version: 2, affiliationReady: true, priceListReady: false },
];

async function serve(page: Page) {
  await page.addInitScript(({ authority }) => sessionStorage.setItem(`oidc.user:${authority}:rehletshifaa-web`, JSON.stringify({
    access_token: "synthetic-access", token_type: "Bearer", scope: "openid", profile: { sub: "synthetic-ops", name: "Synthetic Operations Manager" },
    expires_at: Math.floor(Date.now() / 1000) + 3600,
  })), { authority: OIDC_AUTHORITY });
  await page.route("**/api/v1/**", async (route) => {
    const url = new URL(route.request().url()); const apiPath = url.pathname.replace(/^\/api\/v1/, "");
    if (route.request().method() === "OPTIONS") return route.fulfill({ status: 204 });
    const body = apiPath === "/admin/practitioners" ? consultants
      : apiPath === "/control-center/consultants/public-profiles" ? profiles
      : apiPath === `/control-center/consultants/${practitionerId}/public-profile` ? { practitionerId, slug: "ahmed-alashry", published: true, everPublished: true, sortOrder: 1, version: 3, careArea: "cardiology", contentEn, contentAr }
      : apiPath === "/notifications" ? { items: [], unread: 0 }
      : apiPath === "/account/preferences" ? { displayName: null, locale: null }
      : [];
    return route.fulfill({ contentType: "application/json", body: JSON.stringify(body) });
  });
  await routeMe(page, meFor("synthetic-ops", ["CONSULTANT_OPERATIONS_MANAGER"], { displayName: "Synthetic Operations Manager" }));
}

const shots = (name: string) => path.join("../docs/ux-redesign/screenshots/consultant-profiles", `${name}.png`);
for (const locale of ["en", "ar"] as const) for (const width of [390, 1440]) test(`Consultant public profiles visual QA (${locale}, ${width})`, async ({ page }) => {
  await page.setViewportSize({ width, height: 900 });
  await serve(page);
  await page.goto(`/${locale}/portal/control-center/consultants`);
  await expect(page.getByRole("heading", { level: 2, name: locale === "en" ? "Directory overview" : "نظرة عامة على الدليل" })).toBeVisible();
  await expect(page.getByText(locale === "en" ? "Affiliation declaration" : "إقرار الانتماءات").first()).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBeTruthy();
  await page.screenshot({ path: shots(`directory-readiness-${locale}-${width}`), fullPage: true });

  await page.goto(`/${locale}/portal/control-center/consultants/${practitionerId}?tab=public-profile`);
  await expect(page.getByRole("heading", { level: 2, name: locale === "en" ? "Public profile" : "الملف العام" })).toBeVisible();
  await expect(page.getByText(locale === "en" ? "Live public preview" : "معاينة عامة مباشرة")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBeTruthy();
  await page.screenshot({ path: shots(`editor-preview-${locale}-${width}`), fullPage: true });
});
