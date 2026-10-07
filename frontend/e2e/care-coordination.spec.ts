import { expect, test, type Page } from "@playwright/test";
import { OIDC_AUTHORITY } from "./env";
import { leadsCoordinationTeam, meFor, routeMe } from "./me-fixture";

// UX-7 live sanity: synthetic HTTP fixtures render the real built UI; every write is blocked and recorded (enforcement has
// its own integration tests). Staff Portal Team queue, transfer and assignment history; Coordination Setup sections.
const now = Date.now();
const iso = (hours: number) => new Date(now + hours * 3_600_000).toISOString();
const card = (o: Record<string, unknown>) => ({ caseSummary: { id: "c-1", caseNumber: "RS-2026-0101", status: "RECEIVED", patientName: "Layla Hassan", country: "EG", preferredLanguage: "ar", careCategory: "cardiology", createdAt: iso(-50), updatedAt: iso(-3), version: 1, travelPackageRequested: false, waitingOn: "STAFF", ...o }, openTaskCount: 1, overdueTaskCount: 0, documentCount: 2 });
const cases = [
  card({}),
  card({ id: "c-2", caseNumber: "RS-2026-0102", status: "INTAKE_REVIEW", patientName: "Karim Adel", coordinatorSubject: "kc-omar", coordinatorName: "Omar Nabil" }),
  card({ id: "c-3", caseNumber: "RS-2026-0103", status: "INTAKE_REVIEW", patientName: "Nadia Samir", coordinatorSubject: "kc-lead", coordinatorName: "Mohamed Ali" }),
];
const staff = [{ subject: "kc-omar", name: "Omar Nabil", role: "COORDINATOR" }, { subject: "kc-sara", name: "Sara Ahmed", role: "COORDINATOR" }, { subject: "kc-lead", name: "Mohamed Ali", role: "COORDINATOR_LEAD" }];
const workspace = { caseSummary: cases[1].caseSummary, timeline: [{ type: "STATUS", label: "INTAKE_REVIEW", occurredAt: iso(-20), status: "INTAKE_REVIEW" }], tasks: [], messages: [],
  assignments: [{ id: "a-1", assigneeSubject: "kc-omar", assigneeName: "Omar Nabil", assigneeRole: "COORDINATOR", assignmentType: "PRIMARY", status: "ACTIVE", assignedAt: iso(-20), version: 0 }], clinicalReviews: [],
  actions: { journeyStage: "INTAKE_REVIEW", waitingOn: "STAFF", currentAction: { code: "VIEW_ONLY", kind: "NONE" }, blockers: [], availableActions: [] } };
const history = [
  { role: "COORDINATOR", assigneeName: "Omar Nabil", status: "ACTIVE", assignedAt: iso(-20), endedAt: null, assignedByKind: "PERSON", assignedByName: "Mohamed Ali", reason: "Coverage change" },
  { role: "COORDINATOR", assigneeName: "Sara Ahmed", status: "ENDED", assignedAt: iso(-48), endedAt: iso(-20), assignedByKind: "PERSON", assignedByName: "Sara Ahmed", reason: "Coordinator claimed intake queue case" },
];
const base = "/admin/coordination/org-1";
const team = { id: "team-1", organizationId: "org-1", name: "Cardiology Desk", configuration: { active: true, purpose: "Cardiology intake and follow-up", careAreas: ["cardiology"], languages: ["en", "ar"], timeZone: "Africa/Cairo", fallbackTeam: null }, revision: 1 };
const people = [
  { subject: "kc-sara", name: "Sara Ahmed", account: "ACTIVE", member: true, workload: 3, teams: [{ team: "team-1", active: true, lead: true, effectiveFrom: iso(-900), effectiveTo: null, revision: 2 }], capacity: { subject: "kc-sara", maximum: 12, onDuty: true, languages: ["en", "ar"], careAreas: [], revision: 1 } },
  { subject: "kc-omar", name: "عمر نبيل", account: "ACTIVE", member: true, workload: 7, teams: [{ team: "team-1", active: true, lead: false, effectiveFrom: iso(-900), effectiveTo: null, revision: 1 }], capacity: { subject: "kc-omar", maximum: 8, onDuty: false, languages: ["ar"], careAreas: ["cardiology"], revision: 3 } },
  { subject: "kc-hala", name: "Hala Mostafa", account: "DISABLED", member: true, workload: 0, teams: [], capacity: null },
];
const coordination: Record<string, unknown> = {
  "/admin/coordination/organizations": [{ id: "org-1", displayName: "Al Noor Hospital", type: "HOSPITAL", status: "ACTIVE" }],
  [`${base}/overview`]: { liveCases: 0, evaluatedCases: 14, liveQueue: 0, policyVersion: 2, policyEffectiveFrom: iso(-2000), policyEffectiveTo: iso(4000) },
  [`${base}/teams`]: [team], [`${base}/people`]: people,
  [`${base}/consultants`]: [{ consultantId: "prac-1", name: "Dr Salma Farouk", current: { id: "p1", organizationId: "org-1", consultantId: "prac-1", version: 1, effectiveFrom: iso(-900), effectiveTo: iso(4000), coordinator: "kc-sara", team: "team-1", fallbackTeam: null }, latest: null }, { consultantId: "prac-2", name: "د. هاني رزق", current: null, latest: null }],
  [`${base}/policies`]: [{ id: "policy-2", organizationId: "org-1", version: 2, effectiveFrom: iso(-2000), effectiveTo: iso(4000), configuration: { capacityWeight: 80, languageWeight: 20, requireOnDuty: true, mandatoryLanguage: false, providerTeam: "team-1", careAreaTeams: { cardiology: "team-1" }, defaultTeam: null, fallbackTeam: null, queueHours: 24 } }],
  [`${base}/decisions`]: [
    { id: "d-2", caseId: "c-2", caseNumber: "RS-2026-0102", mode: "SHADOW", path: "PREFERRED_COORDINATOR", source: "LEGACY_ASSIGNMENT", actorName: null, previousOwner: "kc-omar", previousOwnerName: "Omar Nabil", selectedOwner: "kc-sara", selectedOwnerName: "Sara Ahmed", team: "team-1", reason: null, evaluatedAt: iso(-20), legacyMatches: false, policyVersion: 2 },
    { id: "d-1", caseId: "c-3", caseNumber: "RS-2026-0103", mode: "SHADOW", path: "CONTINUITY", source: "LEGACY_ASSIGNMENT", actorName: null, previousOwner: "kc-lead", previousOwnerName: "Mohamed Ali", selectedOwner: "kc-lead", selectedOwnerName: "Mohamed Ali", team: "team-1", reason: null, evaluatedAt: iso(-30), legacyMatches: true, policyVersion: 2 },
  ],
};
const simulation = { policyId: "policy-2", policyVersion: 2, algorithm: "coordination-v1",
  candidates: [{ subject: "kc-sara", teams: ["team-1"], maximum: 12, workload: 3, onDuty: true, languageMatch: true, lastAssignment: null, exclusions: [] }, { subject: "kc-omar", teams: ["team-1"], maximum: 8, workload: 7, onDuty: false, languageMatch: true, lastAssignment: null, exclusions: ["OFF_DUTY"] }],
  selection: { subject: "kc-sara", team: "team-1", path: "PROVIDER_TEAM", scores: [{ candidate: { subject: "kc-sara", teams: ["team-1"], maximum: 12, workload: 3, onDuty: true, languageMatch: true, lastAssignment: null, exclusions: [] }, capacityFactor: "0.75", languageFactor: "1", score: "80" }] } };
const KEYS = ["assignment.team.view", "assignment.policy.view", "assignment.simulate", "assignment.audit.view", "assignment.queue.manage", "assignment.team.manage", "assignment.preference.manage", "assignment.policy.manage"];

async function serve(page: Page, keys: string[], roles: string[]) {
  await page.addInitScript(({ authority, roles }) => sessionStorage.setItem(`oidc.user:${authority}:rehletshifaa-web`, JSON.stringify({ access_token: "synthetic-access", token_type: "Bearer", scope: "openid", profile: { sub: "kc-lead", name: "Mohamed Ali", realm_access: { roles } }, expires_at: Math.floor(Date.now() / 1000) + 3600 })), { authority: OIDC_AUTHORITY, roles });
  const writes: string[] = [];
  await page.route("**/api/v1/**", async (route) => {
    const url = new URL(route.request().url()); const path = url.pathname.replace(/^\/api\/v1/, ""); const method = route.request().method();
    if (method === "OPTIONS") return route.fulfill({ status: 204 });
    if (method === "POST" && path === `${base}/simulate`) return route.fulfill({ contentType: "application/json", body: JSON.stringify(simulation) });
    if (method !== "GET") { writes.push(`${method} ${path}`); return route.fulfill({ status: 409, contentType: "application/json", body: JSON.stringify({ code: "BLOCKED_IN_LIVE_REVIEW", message: "Writes are blocked in this review" }) }); }
    let data: unknown = [];
    if (path.endsWith("/admin/access/me")) data = keys.map((permission) => ({ permission, allowed: true, reason: "ALLOWED" }));
    else if (path in coordination) data = coordination[path];
    else if (path === "/coordinator/cases") data = cases;
    else if (path === "/coordinator/staff") data = url.searchParams.get("role") === "COORDINATOR" ? staff : [];
    else if (path === "/coordinator/cases/c-2") data = workspace;
    else if (path === "/coordinator/cases/c-2/assignment-history") data = history;
    else if (path === "/coordinator/me") data = { displayName: "Mohamed Ali", role: "COORDINATOR_LEAD" };
    else if (path === "/notifications") data = { items: [], unread: 0 };
    else if (path === "/account/preferences") data = { displayName: null, locale: null };
    else if (path === "/provider-workspace/me") data = { practices: [] };
    return route.fulfill({ contentType: "application/json", body: JSON.stringify(data) });
  });
  // The staff portal persona is a Coordinator leading a care-coordination team; Coordination Setup is the manager's.
  await routeMe(page, roles.length ? meFor("kc-lead", ["COORDINATOR"], { displayName: "Mohamed Ali", teams: leadsCoordinationTeam })
    : meFor("kc-lead", ["CARE_COORDINATION_MANAGER"], { displayName: "Mohamed Ali" }));
  return writes;
}
const sane = async (page: Page) => {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBeTruthy();
  await expect(page.locator("h1")).toHaveCount(1);
};

for (const locale of ["en", "ar"] as const) test(`Staff Portal team queue, transfer and assignment history (${locale})`, async ({ page }, testInfo) => {
  const en = locale === "en";
  const shot = async (name: string) => { await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" })); await page.screenshot({ path: testInfo.outputPath(`${name}-${locale}.png`), fullPage: true }); };
  const writes = await serve(page, [], ["COORDINATOR", "COORDINATOR_LEAD"]);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(`/${locale}/portal`);
  await page.getByRole("tab", { name: en ? /Team queue/ : /قائمة الفريق/ }).click();
  await expect(page.getByRole("tab", { name: en ? "Needs an owner" : "تحتاج إلى مالك" })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByText("Layla Hassan")).toBeVisible();
  await sane(page); await shot("team-queue-unowned-desktop");
  await page.getByRole("tab", { name: en ? "Owned by my team" : "حالات فريقي" }).click();
  await expect(page.getByText("Karim Adel")).toBeVisible();
  await sane(page); await shot("team-queue-team-desktop");
  await page.getByRole("button", { name: en ? "Transfer ownership" : "نقل الملكية" }).click();
  const drawer = page.getByRole("dialog");
  await drawer.getByRole("radio", { name: /Sara Ahmed/ }).check();
  await drawer.getByRole("textbox").fill(en ? "Leave coverage" : "تغطية إجازة");
  await drawer.getByRole("button", { name: en ? "Review transfer" : "مراجعة النقل" }).click();
  // OPS-1: the review states the real notification behaviour (in-app + work email after the transfer completes).
  await expect(drawer.getByText(en ? /gets a Staff Portal notification and a work email after the transfer is completed/ : /إشعارًا في بوابة الموظفين ورسالة على بريد العمل بعد اكتمال النقل/)).toBeVisible();
  await shot("transfer-review-desktop");
  await page.setViewportSize({ width: 390, height: 844 });
  await sane(page); await shot("transfer-review-mobile");
  await page.keyboard.press("Escape");
  await sane(page); await shot("team-queue-mobile");
  await page.getByRole("tab", { name: en ? /My work/ : /عملي/ }).click();
  await sane(page); await shot("my-work-mobile");
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.getByRole("tab", { name: en ? /Team queue/ : /قائمة الفريق/ }).click();
  await page.getByRole("tab", { name: en ? "Owned by my team" : "حالات فريقي" }).click();
  await page.getByRole("button", { name: en ? /^Open/ : /^فتح/ }).first().click();
  await page.getByRole("tab", { name: en ? "Activity" : "السجل" }).click();
  await expect(page.getByRole("heading", { name: en ? "Assignment history" : "سجل التعيينات" })).toBeVisible();
  await expect(page.getByText(en ? "Reason: Coverage change" : "السبب: Coverage change")).toBeVisible();
  await sane(page); await shot("assignment-history-desktop");
  expect(writes).toEqual([]);
});

for (const locale of ["en", "ar"] as const) test(`Coordination Setup sections (${locale})`, async ({ page }, testInfo) => {
  const en = locale === "en";
  const shot = async (name: string) => { await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" })); await page.screenshot({ path: testInfo.outputPath(`${name}-${locale}.png`), fullPage: true }); };
  const writes = await serve(page, KEYS, []);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(`/${locale}/portal/control-center/coordination`);
  await expect(page).toHaveURL(/\/coordination\/org-1/);
  await expect(page.getByText(en ? "Evaluation mode" : "وضع التقييم")).toBeVisible();
  await expect(page.getByText("3 of 12 cases").or(page.getByText("3 من 12 حالات"))).toBeVisible();
  await sane(page); await shot("teams-people-desktop");
  await page.getByRole("button", { name: en ? "Add person" : "إضافة شخص" }).click();
  await shot("add-person-desktop");
  await page.keyboard.press("Escape");
  await page.setViewportSize({ width: 390, height: 844 });
  await sane(page); await shot("teams-people-mobile");
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.getByRole("tab", { name: en ? "Clinician Preferences" : "تفضيلات الأطباء" }).click();
  await expect(page.getByText("Dr Salma Farouk")).toBeVisible();
  await sane(page); await shot("preferences-desktop");
  await page.getByRole("tab", { name: en ? "Rules" : "القواعد" }).click();
  await expect(page.getByRole("heading", { name: en ? "Hard requirements" : "متطلبات إلزامية" })).toBeVisible();
  await sane(page); await shot("rules-desktop");
  await page.getByRole("tab", { name: en ? "Advanced" : "متقدم" }).click();
  await page.getByRole("button", { name: en ? "Preview recommendation" : "معاينة التوصية" }).click();
  await expect(page.getByRole("heading", { name: en ? /Recommended: Sara Ahmed/ : /الموصى به: Sara Ahmed/ })).toBeVisible();
  await sane(page); await shot("advanced-desktop");
  await page.setViewportSize({ width: 390, height: 844 });
  await sane(page); await shot("advanced-mobile");
  expect(writes).toEqual([]);
});
