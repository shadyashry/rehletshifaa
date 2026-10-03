import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { ControlCenterShell } from "./ControlCenterShell";
import type { NavKey } from "./control-center-nav";
import type { Me } from "@/lib/access";
import { meWith } from "./test-support";

const auth = vi.hoisted(() => ({
  user: { access_token: "test", profile: { sub: "owner", name: "Nour Hassan", email: "nour@example.org" } },
  me: null as Me | null, roles: [] as string[], loading: false, meFailed: false, refreshMe: vi.fn(), signIn: vi.fn(), signOut: vi.fn(),
}));
vi.mock("@/components/AuthProvider", () => ({ useAuth: () => auth }));
vi.mock("@/lib/api", () => ({ apiFetchAs: vi.fn(), OIDC_AUTHORITY: "https://auth.example/realms/r" }));
afterEach(() => { cleanup(); vi.clearAllMocks(); auth.me = null; auth.meFailed = false; window.history.replaceState({}, "", "/"); });

const renderShell = ({ locale = "en", active = "consultants", crumbs = [{ label: "Dr Salma Farouk" }], title = "Dr Salma Farouk" }: { locale?: "en" | "ar"; active?: NavKey; crumbs?: { label: string; href?: string }[]; title?: string } = {}) => render(
  <ControlCenterShell locale={locale} active={active} crumbs={crumbs} title={title} intro="One sentence about this page." actions={<button>Add consultant</button>}>
    <p>content</p>
  </ControlCenterShell>);

const nav = () => screen.getByRole("navigation", { name: /Control Center|مركز التحكم/ });
/** Sidebar lines in order: group headings (buttons) and links, as a reader scanning it would meet them. */
const lines = () => Array.from(nav().querySelectorAll(".cc-nav-heading, a")).map((e) => e.textContent);
const as = (permissions: string[], extra: Partial<Me> = {}) => { auth.me = meWith(permissions, extra); };

describe("Control Center navigation follows the platform permissions /api/v1/me reports", () => {
  it("credential verifier: Consultants only", () => {
    as(["CREDENTIAL_READ", "CREDENTIAL_DECIDE", "CAPABILITY_DECIDE"]);
    renderShell();
    expect(lines()).toEqual(["Home", "Consultants"]);
    expect(within(nav()).getByRole("link", { name: "Consultants" })).toHaveAttribute("aria-current", "page");
  });

  it("patient identity reviewer: one Reviews & Safety line", () => {
    as(["PATIENT_IDENTITY_REVIEW", "PATIENT_IDENTITY_READ"]);
    renderShell({ active: "identity", crumbs: [], title: "Identity Checks" });
    expect(lines()).toEqual(["Home", "Reviews & Safety"]);
    expect(within(nav()).getByRole("link", { name: "Reviews & Safety" })).toHaveAttribute("href", "/en/portal/control-center/identity-checks");
  });

  it("care coordination manager: Coordination Setup, their teams and staffing requests", () => {
    as(["ROUTING_READ", "ROUTING_CONFIGURE", "ROUTING_ASSIGN", "TEAM_MANAGE", "STAFFING_REQUEST", "WORK_QUEUE_VIEW", "COORDINATION_QUEUE", "REFERENCE_DATA_READ"], { managedFunctions: ["CARE_COORDINATION"] });
    renderShell({ active: "coordination", crumbs: [], title: "Coordination Setup" });
    expect(lines()).toEqual(["Home", "Operations", "Workforce", "Teams", "Staffing Requests"]);
    expect(within(nav()).getByRole("link", { name: "Operations" })).toHaveAttribute("href", "/en/portal/control-center/coordination");
    fireEvent.click(within(nav()).getByRole("button", { name: "Workforce" }));
    expect(within(nav()).getByRole("link", { name: "Teams" })).toHaveAttribute("href", "/en/portal/control-center/teams");
    expect(within(nav()).getByRole("link", { name: "Staffing Requests" })).toBeVisible();
    expect(within(nav()).queryByRole("link", { name: "People" })).not.toBeInTheDocument();
  });

  it("journey manager: Care Journeys only", () => {
    as(["JOURNEY_READ", "JOURNEY_EDIT"]);
    renderShell({ active: "journeys", crumbs: [], title: "Journeys" });
    expect(lines()).toEqual(["Home", "Care Journeys"]);
  });

  it("system administrator: workforce and access governance — no case, consultant or commercial areas", () => {
    as(["WORKFORCE_READ", "WORKFORCE_ADMINISTER", "ACCESS_GOVERN", "AUDIT_READ", "IDENTITY_OPERATIONS_READ", "IDENTITY_OPERATIONS_MANAGE", "RECERTIFY"]);
    renderShell({ active: "people", crumbs: [], title: "People" });
    expect(Array.from(nav().querySelectorAll(".cc-nav-heading")).map((b) => b.textContent)).toEqual(["Workforce", "Access & Governance"]);
    expect(within(nav()).getByRole("link", { name: "People" })).toHaveAttribute("aria-current", "page");
    fireEvent.click(within(nav()).getByRole("button", { name: "Access & Governance" }));
    for (const name of ["Administrators", "Access Reviews", "Service Accounts", "Audit"]) expect(within(nav()).getByRole("link", { name })).toBeVisible();
    expect(within(nav()).queryByRole("link", { name: "Consultants" })).not.toBeInTheDocument();
    expect(within(nav()).queryByRole("link", { name: "Account Support" })).not.toBeInTheDocument();
    const hrefs = within(nav()).getAllByRole("link").map((a) => a.getAttribute("href"));
    expect(new Set(hrefs).size).toBe(hrefs.length);
  });

  it("compliance auditor: read-only areas across the platform", () => {
    as(["WORKFORCE_READ", "AUDIT_READ", "IDENTITY_OPERATIONS_READ", "CREDENTIAL_READ", "JOURNEY_READ", "COMMERCIAL_POLICY_READ", "ROUTING_READ"]);
    renderShell({ active: "audit", crumbs: [], title: "Audit" });
    expect(Array.from(nav().querySelectorAll(".cc-nav-heading")).map((b) => b.textContent)).toEqual(["Workforce", "Access & Governance"]);
    expect(within(nav()).getByRole("link", { name: "Commercial" })).toHaveAttribute("href", "/en/portal/control-center/commercial/margin-deposit");
    expect(within(nav()).getByRole("link", { name: "Consultants" })).toBeVisible();
    expect(within(nav()).getByRole("link", { name: "Care Journeys" })).toBeVisible();
    expect(within(nav()).getByRole("link", { name: "Operations" })).toBeVisible();
  });

  it("mixed-role user: only their Control Center areas, plus the way back to their workspace", () => {
    as(["JOURNEY_READ"], { workspaces: ["COORDINATION", "JOURNEY_GOVERNANCE"] });
    renderShell({ active: "journeys", crumbs: [], title: "Journeys" });
    expect(lines()).toEqual(["Home", "Care Journeys"]);
    fireEvent.click(screen.getByRole("button", { name: "Account: Nour Hassan" }));
    expect(screen.getByRole("link", { name: "My workspace" })).toHaveAttribute("href", "/en/portal");
  });

  it("says a failed access read failed — never 'no access' — and retries it", () => {
    auth.meFailed = true;
    renderShell();
    expect(screen.getByRole("alert")).toHaveTextContent("Some sections couldn't be loaded.");
    expect(screen.queryByText(/do not have access|don't have access/i)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(auth.refreshMe).toHaveBeenCalled();
  });
});

describe("Control Center app shell", () => {
  it("renders the standard header: breadcrumb from the IA, one stable title, a description and actions", () => {
    as(["CREDENTIAL_READ"]);
    renderShell();
    const trail = screen.getByRole("navigation", { name: "Breadcrumb" });
    expect(within(trail).getAllByRole("listitem").map((li) => li.textContent)).toEqual(["Control Center", "Consultants", "Consultants", "Dr Salma Farouk"]);
    expect(within(trail).getByRole("link", { name: "Control Center" })).toHaveAttribute("href", "/en/portal/control-center");
    expect(screen.getAllByRole("heading", { level: 1 }).map((h) => h.textContent)).toEqual(["Dr Salma Farouk"]);
    expect(screen.getByText("One sentence about this page.")).toBeVisible();
    expect(screen.getByRole("link", { name: "Skip to content" })).toHaveAttribute("href", "#cc-main");
    expect(screen.getAllByRole("main")).toHaveLength(1);
  });

  it("Home has no breadcrumb", () => {
    as([]);
    renderShell({ active: "overview", crumbs: [], title: "Control Center" });
    expect(screen.queryByRole("navigation", { name: "Breadcrumb" })).not.toBeInTheDocument();
  });

  it("keeps the brand, language switch and account menu in a compact top bar", () => {
    as(["CREDENTIAL_READ"]);
    window.history.replaceState({}, "", "/en/portal/control-center/consultants?tab=overview");
    renderShell();
    expect(screen.getByRole("link", { name: /RehletShifaa/ })).toHaveAttribute("href", "/en/portal/control-center");
    expect(screen.getByRole("link", { name: "العربية" })).toHaveAttribute("href", "/ar/portal/control-center/consultants?tab=overview");
    const account = screen.getByRole("button", { name: "Account: Nour Hassan" });
    fireEvent.click(account);
    expect(account).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("link", { name: "Password & account security" })).toHaveAttribute("href", "https://auth.example/realms/r/account?ui_locales=en");
    expect(screen.queryByRole("link", { name: "My workspace" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
    expect(auth.signOut).toHaveBeenCalled();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(account).toHaveAttribute("aria-expanded", "false");
    expect(account).toHaveFocus();
  });

  it("opens navigation as a drawer with managed focus, and closes it with Escape", () => {
    as(["CREDENTIAL_READ"]);
    renderShell();
    const toggle = screen.getByRole("button", { name: "Navigation menu" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(toggle).toHaveAttribute("aria-controls", "cc-sidebar");
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("button", { name: "Close menu" })).toHaveFocus();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(toggle).toHaveFocus();
  });

  it("mirrors for Arabic with the draft glossary labels", () => {
    as(["CREDENTIAL_READ"]);
    const { container } = renderShell({ locale: "ar", title: "د. سلمى فاروق", crumbs: [{ label: "د. سلمى فاروق" }] });
    expect(container.querySelector(".cc")).toHaveAttribute("dir", "rtl");
    expect(within(nav()).getByRole("link", { name: "الاستشاريون" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "English" })).toHaveAttribute("hreflang", "en");
  });
});
