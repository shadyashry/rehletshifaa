import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { ProviderWorkspace } from "./ProviderWorkspace";
import { attention, canManageOrganization, sections, type Capability, type Practice } from "./provider-workspace-model";
import { apiFetchAs } from "@/lib/api";
import { failure, fakeApi, json } from "@/components/platform-control-center/test-support";

const auth = vi.hoisted(() => ({ user: { access_token: "test", profile: { sub: "u1", name: "Salma Farouk" } }, roles: ["PATIENT"] as string[], loading: false, signIn: vi.fn(), signOut: vi.fn() }));
const router = vi.hoisted(() => ({ replace: vi.fn(), push: vi.fn(), refresh: vi.fn() }));
vi.mock("@/components/AuthProvider", () => ({ useAuth: () => auth }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));
vi.mock("@/lib/api", () => ({ apiFetchAs: vi.fn(), SITE_URL: "https://example.org", OIDC_AUTHORITY: "https://auth.example/realms/r" }));

const caps = (allowed: string[], evaluated: string[] = allowed): Capability[] => [...new Set([...evaluated, ...allowed])].map((permission) => ({ permission, allowed: allowed.includes(permission), recentAuthentication: false }));
const ORG_KEYS = ["provider.view", "provider.update", "provider.member.invite", "provider.clinician.invite", "provider.practice_staff.manage", "provider.relationship.manage"];
const base = (overrides: Partial<Practice>): Practice => ({
  organizationId: "org-a", organizationName: "Al Noor Practice", organizationStatus: "ONBOARDING", roles: [], clinician: null, relationships: [],
  managedClinicians: [], managedCliniciansTruncated: false, organizationCapabilities: caps(["provider.view"], ORG_KEYS), ...overrides,
});
const consultant = base({
  roles: ["CONSULTANT"],
  clinician: { practitionerId: "prac-1", displayName: "Dr Salma Farouk", clinicianType: "CONSULTANT", setupStatus: "PROFILE_INCOMPLETE", providerCredentialing: true, capabilities: caps(["credential.view", "price_list.view", "availability.view"]) },
  // The seeded organization-wide relationship grant is reported, but never earns a consultant "Manage organization".
  organizationCapabilities: caps(["provider.view", "provider.relationship.manage"], ORG_KEYS),
  relationships: [{ type: "MANAGES", direction: "INCOMING", counterpartName: "Mona Adel", status: "ACTIVE", effectiveFrom: null, effectiveTo: null }],
});
const associate = base({
  roles: ["ASSOCIATE_DOCTOR"],
  clinician: { practitionerId: "prac-2", displayName: "Dr Omar Nabil", clinicianType: "ASSOCIATE_DOCTOR", setupStatus: "PROFILE_INCOMPLETE", providerCredentialing: true, capabilities: caps(["price_list.view", "availability.view"], ["credential.view", "price_list.view", "availability.view"]) },
  relationships: [{ type: "SUPERVISES", direction: "INCOMING", counterpartName: "د. سلمى فاروق", status: "ACTIVE", effectiveFrom: null, effectiveTo: null }],
});
const MANAGED = ["price_list.view", "price_list.manage", "price_list.publish", "availability.view", "availability.manage"];
const manager = base({
  roles: ["PRACTICE_MANAGER"], organizationCapabilities: caps(["provider.view", "provider.practice_staff.manage", "provider.relationship.manage"], ORG_KEYS),
  managedClinicians: [
    { practitionerId: "prac-1", displayName: "Dr Salma Farouk", clinicianType: "CONSULTANT", setupStatus: "PROFILE_INCOMPLETE", membershipStatus: "ACTIVE", capabilities: caps(MANAGED) },
    { practitionerId: "prac-3", displayName: "Dr Karim Adel", clinicianType: "CONSULTANT", setupStatus: "ACTIVE", membershipStatus: "ACTIVE", capabilities: caps([], MANAGED) },
  ],
  relationships: [{ type: "MANAGES", direction: "OUTGOING", counterpartName: "Dr Salma Farouk", status: "ACTIVE", effectiveFrom: null, effectiveTo: null }],
});
const assistant = base({ roles: ["CONSULTANT_ASSISTANT"], relationships: [{ type: "ASSISTS", direction: "OUTGOING", counterpartName: "Dr Salma Farouk", status: "ACTIVE", effectiveFrom: null, effectiveTo: null }] });
const owner = base({ roles: ["ORGANIZATION_OWNER"], organizationCapabilities: caps(ORG_KEYS) });

const emptyCases = { items: [], page: 0, hasMore: false };
const assignedCases = { items: [
  { caseNumber: "RS-2026-0042", patientDisplayName: "ليلى حداد", caseStatus: "CONSULTANT_REVIEW", assignmentStatus: "PENDING", assignedAt: "2026-09-20T10:00:00Z", proposalStage: "NONE", proposalDocumentType: null },
  { caseNumber: "RS-2026-0043", patientDisplayName: "John Smith", caseStatus: "PROPOSAL_PREPARATION", assignmentStatus: "ACTIVE", assignedAt: "2026-09-18T10:00:00Z", proposalStage: "IN_PREPARATION", proposalDocumentType: "PRELIMINARY_ESTIMATE" },
], page: 0, hasMore: false };

function serve(practices: Practice[], extra: Record<string, unknown> = {}) {
  vi.mocked(apiFetchAs).mockImplementation(fakeApi({ "/provider-workspace/me": { practices, truncated: false }, "/provider-workspace/cases?page=0": emptyCases, "/account/preferences": { displayName: null, locale: null }, ...extra }));
}
const paths = () => vi.mocked(apiFetchAs).mock.calls.map(([, path]) => path as string);
const nav = () => screen.queryByRole("navigation", { name: "My Practice sections" });
const navLinks = () => { const n = nav(); return n ? within(n).getAllByRole("link").map((l) => l.textContent) : []; };

beforeEach(() => { window.history.replaceState({}, "", "/en/portal/practice"); const slot = document.createElement("div"); slot.id = "portal-account-slot"; document.body.appendChild(slot); });
afterEach(() => { cleanup(); vi.clearAllMocks(); document.getElementById("portal-account-slot")?.remove(); auth.roles = ["PATIENT"]; });

describe("Provider Workspace — A. Provider consultant", () => {
  it("lands in My Practice with own work sections only, a truthful empty case list and no administration entry", async () => {
    serve([consultant]);
    render(<ProviderWorkspace locale="en" />);
    expect(await screen.findByRole("heading", { level: 1, name: "My Practice" })).toBeVisible();
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(navLinks()).toEqual(["Home", "My cases", "My credentials", "My schedule", "My prices"]);
    expect(screen.queryByRole("link", { name: "Manage organization" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Control Center/ })).not.toBeInTheDocument();
    expect(screen.getByText("Nothing needs your attention right now.")).toBeVisible();
    expect(screen.getByText("Managed by")).toBeVisible();
    fireEvent.click(within(nav()!).getByRole("link", { name: "My cases" }));
    expect(await screen.findByText("No assigned cases yet.")).toBeVisible();
    expect(screen.getByText("Cases will appear here when you are eligible for assignment and a case is assigned to you.")).toBeVisible();
    expect(screen.getByRole("heading", { level: 2, name: "My cases" })).toHaveFocus();
    // Only the self read, the narrow case read and account preferences — never a broad case, staff or organization read.
    expect(new Set(paths())).toEqual(new Set(["/provider-workspace/me", "/provider-workspace/cases?page=0", "/account/preferences"]));
  });

  it("shows assigned cases as summaries only: name, case number, status, own assignment and proposal stage", async () => {
    serve([consultant], { "/provider-workspace/cases?page=0": assignedCases });
    render(<ProviderWorkspace locale="en" />);
    expect(await screen.findByText("2 cases are assigned to you")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Open: My cases" }));
    const list = await screen.findByRole("list", { name: "My cases" });
    const rows = within(list).getAllByRole("listitem");
    expect(rows).toHaveLength(2);
    expect(within(rows[0]).getByText("ليلى حداد").tagName).toBe("BDI");
    expect(within(rows[0]).getByText("RS-2026-0042")).toBeVisible();
    expect(within(rows[0]).getByText("Under consultant review")).toBeVisible();
    expect(within(rows[0]).getByText("Offered to you")).toBeVisible();
    expect(within(rows[1]).getByText("In preparation")).toBeVisible();
    expect(within(rows[1]).getByText(/Preliminary estimate/)).toBeVisible();
    // No link or action into case content: clinical records, documents and commercial detail are not part of UX-4.
    expect(within(list).queryByRole("link")).not.toBeInTheDocument();
    expect(within(list).queryByRole("button")).not.toBeInTheDocument();
    expect(list.textContent).not.toMatch(/EGP|USD|\d+\.\d{2}|@|\+\d{6,}/);
  });

  it("pages with Show more and never asks for more than the server says exists", async () => {
    serve([consultant], {
      "/provider-workspace/cases?page=0": { ...assignedCases, hasMore: true },
      "/provider-workspace/cases?page=1": { items: [{ ...assignedCases.items[1], caseNumber: "RS-2026-0044" }], page: 1, hasMore: false },
    });
    window.history.replaceState({}, "", "/en/portal/practice?view=cases");
    render(<ProviderWorkspace locale="en" />);
    fireEvent.click(await screen.findByRole("button", { name: "Show more cases" }));
    expect(await screen.findByText("RS-2026-0044")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Show more cases" })).not.toBeInTheDocument();
  });

  it("shows own schedule and prices view-only from the self read — no edit, publish or approval", async () => {
    serve([consultant], {
      "/admin/providers/org-a/clinicians/prac-1/availability": { organizationId: "org-a", practitionerId: "prac-1", recurring: [], exceptions: [] },
      "/admin/providers/org-a/clinicians/prac-1/availability/effective": { available: false, source: "NONE", sourceId: null, evaluatedAt: "2026-09-24T00:00:00Z" },
      "/admin/providers/org-a/clinicians/prac-1/onboarding": { organizationId: "org-a", practitionerId: "prac-1", clinicianType: "CONSULTANT", status: "PROFILE_INCOMPLETE", jurisdiction: "EG", version: 1, ownerSubject: "u1" },
      "/admin/providers/org-a/clinicians/prac-1/prices": [
        { id: "p1", organizationId: "org-a", serviceCode: "CONSULT", serviceName: "Consultation", category: null, scopeType: "CONSULTANT", scopeKey: "prac-1", clinicianId: "prac-1", amount: "100.00", currency: "EGP", effectiveFrom: "2026-01-01T00:00:00Z", effectiveTo: null, status: "ACTIVE", versionNumber: 1, consultantApprovalRequired: false, consultantApprovedBy: null, legacyCatalogId: null, revision: 0 },
        // A draft awaiting approval is not shown: approving is not granted to the consultant (future capability), so no prompt.
        { id: "p2", organizationId: "org-a", serviceCode: "FOLLOWUP", serviceName: "Follow-up visit", category: null, scopeType: "CONSULTANT", scopeKey: "prac-1", clinicianId: "prac-1", amount: "80.00", currency: "EGP", effectiveFrom: "2026-10-01T00:00:00Z", effectiveTo: null, status: "DRAFT", versionNumber: 1, consultantApprovalRequired: true, consultantApprovedBy: null, legacyCatalogId: null, revision: 0 },
      ],
    });
    render(<ProviderWorkspace locale="en" />);
    fireEvent.click(within((await screen.findByRole("navigation", { name: "My Practice sections" }))).getByRole("link", { name: "My schedule" }));
    expect(await screen.findByText("Weekly schedule")).toBeVisible();
    expect(screen.queryByRole("button", { name: /New weekly slot|New exception|Edit/ })).not.toBeInTheDocument();
    fireEvent.click(within(nav()!).getByRole("link", { name: "My prices" }));
    expect(await screen.findByText("Consultation")).toBeVisible();
    expect(screen.queryByText("Follow-up visit")).not.toBeInTheDocument();
    expect(screen.queryByText(/Consultant approval|approval/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /New price|Edit|Publish|Record Consultant approval|Retire/ })).not.toBeInTheDocument();
    // The editors used the self-read decisions, not the organization-level capability read.
    expect(paths()).not.toContain("/admin/access/me");
  });

  it("links to the Consultant workspace instead of duplicating case work for a Direct doctor", async () => {
    auth.roles = ["DOCTOR"];
    serve([consultant]);
    render(<ProviderWorkspace locale="en" />);
    expect(await screen.findByRole("link", { name: "Open the Consultant workspace" })).toHaveAttribute("href", "/en/portal?role=doctor");
    expect(paths()).not.toContain("/provider-workspace/cases?page=0");
  });
});

describe("Provider Workspace — B. Associate doctor", () => {
  it("shows own sections the self read allows and the supervising consultant, with no credentials section when denied", async () => {
    serve([associate]);
    render(<ProviderWorkspace locale="en" />);
    await screen.findByRole("heading", { level: 1, name: "My Practice" });
    expect(navLinks()).toEqual(["Home", "My cases", "My schedule", "My prices"]);
    expect(screen.getByText("Supervised by")).toBeVisible();
    expect(screen.getByText("د. سلمى فاروق").tagName).toBe("BDI");
    expect(screen.queryByText("My clinicians")).not.toBeInTheDocument();
  });
});

describe("Provider Workspace — C. Practice manager", () => {
  it("shows managed clinicians and setup attention, Manage organization, and no case read", async () => {
    serve([manager], {
      "/admin/providers/org-a/clinicians/prac-1/onboarding": { organizationId: "org-a", practitionerId: "prac-1", clinicianType: "CONSULTANT", status: "PROFILE_INCOMPLETE", jurisdiction: "EG", version: 1, ownerSubject: "kc-consultant" },
      "/admin/providers/org-a/clinicians/prac-1/prices": [
        { id: "org-price", organizationId: "org-a", serviceCode: "CONSULT", serviceName: "Consultation", category: null, scopeType: "ORGANIZATION", scopeKey: "ORGANIZATION", clinicianId: null, amount: "100.00", currency: "EGP", effectiveFrom: "2026-01-01T00:00:00Z", effectiveTo: null, status: "ACTIVE", versionNumber: 1, consultantApprovalRequired: false, consultantApprovedBy: null, legacyCatalogId: null, revision: 0 },
        { id: "own-draft", organizationId: "org-a", serviceCode: "CONSULT", serviceName: "Consultation", category: null, scopeType: "CONSULTANT", scopeKey: "prac-1", clinicianId: "prac-1", amount: "120.00", currency: "EGP", effectiveFrom: "2026-10-01T00:00:00Z", effectiveTo: null, status: "DRAFT", versionNumber: 1, consultantApprovalRequired: false, consultantApprovedBy: null, legacyCatalogId: null, revision: 0 },
      ],
    });
    render(<ProviderWorkspace locale="en" />);
    expect(await screen.findByText("1 clinician you manage is still in setup")).toBeVisible();
    expect(navLinks()).toEqual(["Home", "My clinicians"]);
    expect(screen.getByRole("link", { name: "Manage organization" })).toHaveAttribute("href", "/en/portal/control-center/providers/org-a");
    fireEvent.click(screen.getByRole("button", { name: "Open: My clinicians" }));
    const cards = await screen.findAllByRole("listitem");
    expect(cards.map((c) => within(c).getByText(/^Dr /).textContent)).toEqual(["Dr Salma Farouk", "Dr Karim Adel"]);
    // Actions follow the per-clinician decision: nothing offered where the backend would refuse.
    expect(within(cards[1]).queryByRole("button")).not.toBeInTheDocument();
    fireEvent.click(within(cards[0]).getByRole("button", { name: "Prices — Dr Salma Farouk" }));
    expect(await screen.findByRole("heading", { level: 2, name: "Prices — Dr Salma Farouk" })).toHaveFocus();
    expect(await screen.findByRole("button", { name: /New price/ })).toBeVisible();
    // The clinician's own draft can be edited and published; the organization-wide price — which also governs clinicians
    // this manager does not manage — offers no action here (backend breadth recorded for Phase 8D).
    expect(screen.getAllByRole("button", { name: "Edit draft" })).toHaveLength(1);
    expect(screen.getAllByRole("button", { name: "Publish" })).toHaveLength(1);
    expect(screen.queryByRole("button", { name: "Retire" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /New price/ }));
    expect(within(screen.getByLabelText(/Scope|Applies to|Price level/i) as HTMLElement).queryByRole("option", { name: /Organization/ })).not.toBeInTheDocument();
    expect(paths().some((p) => p.startsWith("/provider-workspace/cases"))).toBe(false);
    expect(paths()).not.toContain("/admin/access/me");
  });

  it("says so truthfully when no clinician is managed yet", async () => {
    serve([{ ...manager, managedClinicians: [] }]);
    window.history.replaceState({}, "", "/en/portal/practice?view=clinicians");
    render(<ProviderWorkspace locale="en" />);
    expect(await screen.findByText("You don't manage any clinicians yet.")).toBeVisible();
  });
});

describe("Provider Workspace — D. Consultant assistant", () => {
  it("is deliberately small: who they assist, no schedule, cases, prices or credentials", async () => {
    serve([assistant]);
    render(<ProviderWorkspace locale="en" />);
    expect(await screen.findByText("No supported practice tasks are available right now.")).toBeVisible();
    expect(nav()).not.toBeInTheDocument();
    expect(screen.getByText("You assist")).toBeVisible();
    expect(screen.queryByText(/My schedule|My cases|My prices|My credentials|My clinicians/)).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Manage organization" })).not.toBeInTheDocument();
    expect(new Set(paths())).toEqual(new Set(["/provider-workspace/me", "/account/preferences"]));
  });
});

describe("Provider Workspace — E. Organization owner", () => {
  it("offers Manage organization and no patient or case data", async () => {
    serve([owner]);
    render(<ProviderWorkspace locale="en" />);
    expect(await screen.findByRole("link", { name: "Manage organization" })).toHaveAttribute("href", "/en/portal/control-center/providers/org-a");
    expect(screen.getByText("Nothing needs your attention here. Organization setup is in Manage organization.")).toBeVisible();
    expect(nav()).not.toBeInTheDocument();
    expect(paths().some((p) => p.startsWith("/provider-workspace/cases"))).toBe(false);
  });
});

describe("Provider Workspace — F. RehletShifaa staff who also works with a provider", () => {
  it("offers an understandable workspace switch; the two navigation systems never share a screen", async () => {
    auth.roles = ["COORDINATOR"];
    serve([consultant]);
    render(<ProviderWorkspace locale="en" />);
    const switcher = await screen.findByRole("navigation", { name: "Workspace" });
    expect(within(switcher).getByRole("link", { name: "Staff Portal" })).toHaveAttribute("href", "/en/portal");
    expect(within(switcher).getByText("My Practice")).toHaveAttribute("aria-current", "page");
    expect(screen.queryByText(/Team queue|Case queue/)).not.toBeInTheDocument();
  });
});

describe("Provider Workspace — context, language and failure", () => {
  it("lists only the caller's practices and moves focus to the page heading after a change", async () => {
    serve([consultant, { ...owner, organizationId: "org-b", organizationName: "مركز الشفاء" }]);
    render(<ProviderWorkspace locale="en" />);
    const select = await screen.findByLabelText("Practice");
    expect(within(select).getAllByRole("option").map((o) => o.textContent)).toEqual(["Al Noor Practice", "مركز الشفاء"]);
    fireEvent.change(select, { target: { value: "org-b" } });
    await waitFor(() => expect(screen.getByRole("heading", { level: 1 })).toHaveFocus());
    expect(screen.getByRole("link", { name: "Manage organization" })).toHaveAttribute("href", "/en/portal/control-center/providers/org-b");
    expect(window.location.search).toContain("org=org-b");
  });

  it("renders in Arabic with isolated names", async () => {
    serve([associate]);
    render(<ProviderWorkspace locale="ar" />);
    expect(await screen.findByRole("heading", { level: 1, name: "عيادتي" })).toBeVisible();
    expect(within(screen.getByRole("navigation", { name: "أقسام عيادتي" })).getAllByRole("link").map((l) => l.textContent)).toEqual(["الرئيسية", "حالاتي", "جدولي", "أسعاري"]);
    expect(screen.getByText("يشرف عليك")).toBeVisible();
  });

  it("reports a failed self read as a failure with retry, never as 'no access'", async () => {
    vi.mocked(apiFetchAs).mockImplementation(fakeApi({ "/provider-workspace/me": failure(500, "INTERNAL") }));
    render(<ProviderWorkspace locale="en" />);
    expect(await screen.findByRole("alert")).toHaveTextContent("We couldn't load your practice.");
    vi.mocked(apiFetchAs).mockImplementation(fakeApi({ "/provider-workspace/me": json({ practices: [consultant], truncated: false }), "/provider-workspace/cases?page=0": emptyCases }));
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByRole("navigation", { name: "My Practice sections" })).toBeVisible();
  });

  it("keeps the existing truthful landing for an account with no provider relationship and no workspace", async () => {
    auth.roles = [];
    vi.mocked(apiFetchAs).mockImplementation(fakeApi({ "/provider-workspace/me": { practices: [], truncated: false } }, []));
    render(<ProviderWorkspace locale="en" />);
    expect(await screen.findByRole("heading", { name: "Nothing is set up for your account yet" })).toBeVisible();
  });
});

describe("Provider Workspace model — composition is capability-derived, never title-derived", () => {
  it("never opens a section from a role label alone", () => {
    const titleOnly = base({ roles: ["CONSULTANT"], clinician: { ...consultant.clinician!, capabilities: caps([], ["credential.view", "price_list.view", "availability.view"]) } });
    expect(sections(titleOnly)).toEqual(["home", "cases"]);
    expect(sections(assistant)).toEqual(["home"]);
    expect(sections(owner)).toEqual(["home"]);
  });
  it("offers Manage organization only to owners and practice managers holding an administration decision", () => {
    expect(canManageOrganization(consultant)).toBe(false);
    expect(canManageOrganization(owner)).toBe(true);
    expect(canManageOrganization({ ...owner, organizationCapabilities: caps(["provider.view"], ORG_KEYS) })).toBe(false);
  });
  it("raises attention only for real tasks", () => {
    expect(attention(assistant, null, "en")).toEqual([]);
    expect(attention({ ...consultant, clinician: { ...consultant.clinician!, setupStatus: "MORE_INFORMATION_REQUIRED" } }, null, "en").map((a) => a.key)).toEqual(["own-credential-info"]);
    expect(attention(consultant, { items: assignedCases.items, page: 0, hasMore: true }, "en")[0].title).toBe("2+ cases are assigned to you");
  });
});
