import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { ControlCenterShell } from "./ControlCenterShell";
import type { NavKey } from "./control-center-nav";
import { apiFetchAs } from "@/lib/api";
import { fakeApi, json } from "./test-support";

const auth = vi.hoisted(() => ({ user: { access_token: "test", profile: { sub: "owner", name: "Nour Hassan", email: "nour@example.org" } }, roles: [] as string[], loading: false, signIn: vi.fn(), signOut: vi.fn() }));
vi.mock("@/components/AuthProvider", () => ({ useAuth: () => auth }));
vi.mock("@/lib/api", () => ({ apiFetchAs: vi.fn(), OIDC_AUTHORITY: "https://auth.example/realms/r" }));
afterEach(() => { cleanup(); vi.clearAllMocks(); auth.roles = []; window.history.replaceState({}, "", "/"); });

const renderShell = ({ locale = "en", active = "consultants", crumbs = [{ label: "Dr Salma Farouk" }], title = "Dr Salma Farouk" }: { locale?: "en" | "ar"; active?: NavKey; crumbs?: { label: string; href?: string }[]; title?: string } = {}) => render(
  <ControlCenterShell locale={locale} active={active} crumbs={crumbs} title={title} intro="One sentence about this page." actions={<button>Add consultant</button>}>
    <p>content</p>
  </ControlCenterShell>);

const nav = () => screen.getByRole("navigation", { name: /Control Center|مركز التحكم/ });
/** Sidebar lines in order: group headings (buttons) and links, as a reader scanning it would meet them. */
const lines = () => Array.from(nav().querySelectorAll(".cc-nav-heading, a")).map((e) => e.textContent);
const as = (caps: string[], roles: string[] = []) => { auth.roles = roles; vi.mocked(apiFetchAs).mockImplementation(fakeApi({}, caps)); };
const settled = () => waitFor(() => expect(screen.queryByRole("status", { name: "Loading sections…" })).not.toBeInTheDocument());

describe("Control Center navigation follows the approved IA and the caller's own capabilities", () => {
  it("A · provider-only administrator: Providers only, current group expanded", async () => {
    as(["provider.view", "provider.clinician.invite", "provider.practice_staff.manage"]);
    renderShell();
    await settled();
    expect(lines()).toEqual(["Home", "Providers", "Organizations", "Clinicians", "Practice Staff"]);
    expect(within(nav()).getByRole("link", { name: "Clinicians" })).toHaveAttribute("aria-current", "page");
    expect(within(nav()).getByRole("button", { name: "Providers" })).toHaveAttribute("aria-expanded", "true");
  });

  it("B · credential reviewer: one Reviews & Safety line, no provider or pricing actions", async () => {
    as(["credential.review", "credential.view"]);
    renderShell({ active: "credentials", crumbs: [], title: "Credential Reviews" });
    await settled();
    expect(lines()).toEqual(["Home", "Reviews & Safety"]);
    expect(within(nav()).getByRole("link", { name: "Reviews & Safety" })).toHaveAttribute("href", "/en/portal/control-center/credentials");
    expect(within(nav()).getByRole("link", { name: "Reviews & Safety" })).toHaveAttribute("aria-current", "page");
  });

  it("C · coordination manager: Operations › Coordination Setup only", async () => {
    as(["assignment.team.view", "assignment.queue.manage"]);
    renderShell({ active: "coordination", crumbs: [], title: "Coordination Setup" });
    await settled();
    expect(lines()).toEqual(["Home", "Operations"]);
    expect(within(nav()).getByRole("link", { name: "Operations" })).toHaveAttribute("href", "/en/portal/control-center/coordination");
  });

  it("D · journey manager: Care Journeys only — no provider onboarding", async () => {
    as(["journey.view", "journey.create"]);
    renderShell({ active: "journeys", crumbs: [], title: "Journeys" });
    await settled();
    expect(lines()).toEqual(["Home", "Care Journeys"]);
  });

  it("E · access administrator: People, Roles, Audit — the permission reference and access summary are not sidebar lines", async () => {
    as(["access.role.view", "access.effective_access.view", "access.audit.view"]);
    renderShell({ active: "accessEffective", crumbs: [], title: "Access summary" });
    await settled();
    expect(lines()).toEqual(["Home", "Access & Governance", "People", "Roles", "Audit"]);
    // A page without its own line highlights its parent, and its breadcrumb passes through it.
    expect(within(nav()).getByRole("link", { name: "People" })).toHaveAttribute("aria-current", "page");
    const trail = screen.getByRole("navigation", { name: "Breadcrumb" });
    expect(within(trail).getByRole("link", { name: "People" })).toHaveAttribute("href", "/en/portal/control-center/access/users");
    expect(within(trail).getByText("Access summary")).toHaveAttribute("aria-current", "page");
  });

  it("F · broad platform administrator: every group, other groups collapsed, no duplicate destination", async () => {
    as(["provider.view", "credential.review", "price_list.view", "availability.view", "assignment.team.view", "journey.view", "access.role.view", "access.effective_access.view", "access.audit.view"],
      ["SYSTEM_ADMIN", "PATIENT_IDENTITY_REVIEWER", "FINANCE", "FINANCE_LEAD"]);
    renderShell();
    await settled();
    expect(Array.from(nav().querySelectorAll(".cc-nav-heading")).map((b) => b.textContent)).toEqual(["Providers", "Reviews & Safety", "Commercial", "Operations", "Access & Governance"]);
    expect(within(nav()).getByRole("link", { name: "Care Journeys" })).toBeVisible();
    expect(within(nav()).getByRole("button", { name: "Commercial" })).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(within(nav()).getByRole("button", { name: "Commercial" }));
    expect(within(nav()).getByRole("button", { name: "Commercial" })).toHaveAttribute("aria-expanded", "true");
    expect(within(nav()).getByRole("link", { name: "Price Lists" })).toHaveAttribute("href", "/en/portal/control-center/commercial/prices");
    expect(within(nav()).getByRole("link", { name: "Exchange Rates" })).toHaveAttribute("href", "/en/portal/control-center/commercial/exchange-rates");
    expect(within(nav()).getByRole("link", { name: "Margin & Deposit" })).toHaveAttribute("href", "/en/portal/control-center/commercial/margin-deposit");
    fireEvent.click(within(nav()).getByRole("button", { name: "Operations" }));
    expect(within(nav()).getByRole("link", { name: "RehletShifaa Staff" })).toHaveAttribute("href", "/en/portal/control-center/team");
    fireEvent.click(within(nav()).getByRole("button", { name: "Reviews & Safety" }));
    expect(within(nav()).getByRole("link", { name: "Identity Checks" })).toBeVisible();
    // Schedules has no line of its own for someone who can open Clinicians.
    expect(within(nav()).queryByRole("link", { name: "Schedules" })).not.toBeInTheDocument();
    const hrefs = within(nav()).getAllByRole("link").map((a) => a.getAttribute("href"));
    expect(new Set(hrefs).size).toBe(hrefs.length);
  });

  it("G · mixed-role user: only their Control Center areas, plus the way back to their workspace", async () => {
    as(["credential.review", "journey.view"], ["COORDINATOR"]);
    renderShell({ active: "journeys", crumbs: [], title: "Journeys" });
    await settled();
    expect(lines()).toEqual(["Home", "Reviews & Safety", "Care Journeys"]);
    fireEvent.click(screen.getByRole("button", { name: "Account: Nour Hassan" }));
    expect(screen.getByRole("link", { name: "My workspace" })).toHaveAttribute("href", "/en/portal");
  });

  it("never leaves a schedule-only person without a way in", async () => {
    as(["availability.view"]);
    renderShell({ active: "availability", crumbs: [], title: "Schedules" });
    await settled();
    expect(lines()).toEqual(["Home", "Providers"]);
    expect(within(nav()).getByRole("link", { name: "Providers" })).toHaveAttribute("href", "/en/portal/control-center/commercial/availability");
  });

  it("says a failed capability read failed — never 'no access'", async () => {
    vi.mocked(apiFetchAs).mockImplementation(async (_t, path) => (String(path).endsWith("/admin/access/me") ? json({}, 503) : json({})));
    renderShell();
    expect(await screen.findByRole("alert")).toHaveTextContent("Some sections couldn't be loaded.");
    expect(screen.queryByText(/do not have access|don't have access/i)).not.toBeInTheDocument();
    vi.mocked(apiFetchAs).mockImplementation(fakeApi({}, ["provider.view"]));
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await within(nav()).findByRole("link", { name: "Clinicians" })).toBeVisible();
  });
});

describe("Control Center app shell", () => {
  it("renders the standard header: breadcrumb from the IA, one stable title, a description and actions", async () => {
    as(["provider.view"]);
    renderShell();
    const trail = screen.getByRole("navigation", { name: "Breadcrumb" });
    expect(within(trail).getAllByRole("listitem").map((li) => li.textContent)).toEqual(["Control Center", "Providers", "Clinicians", "Dr Salma Farouk"]);
    expect(within(trail).getByRole("link", { name: "Control Center" })).toHaveAttribute("href", "/en/portal/control-center");
    expect(within(trail).getByRole("link", { name: "Clinicians" })).toHaveAttribute("href", "/en/portal/control-center/providers/consultants");
    expect(screen.getAllByRole("heading", { level: 1 }).map((h) => h.textContent)).toEqual(["Dr Salma Farouk"]);
    expect(screen.getByText("One sentence about this page.")).toBeVisible();
    expect(screen.getByRole("link", { name: "Skip to content" })).toHaveAttribute("href", "#cc-main");
    expect(screen.getAllByRole("main")).toHaveLength(1);
    await settled();
  });

  it("Home has no breadcrumb", async () => {
    as([]);
    renderShell({ active: "overview", crumbs: [], title: "Control Center" });
    expect(screen.queryByRole("navigation", { name: "Breadcrumb" })).not.toBeInTheDocument();
    await settled();
  });

  it("keeps the brand, language switch and account menu in a compact top bar", async () => {
    as(["provider.view"]);
    window.history.replaceState({}, "", "/en/portal/control-center/providers/consultants?view=direct");
    renderShell();
    expect(screen.getByRole("link", { name: /RehletShifaa/ })).toHaveAttribute("href", "/en/portal/control-center");
    expect(screen.getByRole("link", { name: "العربية" })).toHaveAttribute("href", "/ar/portal/control-center/providers/consultants?view=direct");
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
    await settled();
  });

  it("opens navigation as a drawer with managed focus, and closes it with Escape", async () => {
    as(["provider.view"]);
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
    await settled();
  });

  it("mirrors for Arabic with the draft glossary labels", async () => {
    as(["provider.view"]);
    const { container } = renderShell({ locale: "ar", title: "د. سلمى فاروق", crumbs: [{ label: "د. سلمى فاروق" }] });
    expect(container.querySelector(".cc")).toHaveAttribute("dir", "rtl");
    expect(await within(nav()).findByRole("link", { name: "الأطباء" })).toHaveAttribute("aria-current", "page");
    expect(within(screen.getByRole("navigation", { name: "مسار التنقل" })).getAllByRole("listitem").map((li) => li.textContent)).toEqual(["مركز التحكم", "مقدمو الرعاية", "الأطباء", "د. سلمى فاروق"]);
    expect(screen.getByRole("link", { name: "English" })).toHaveAttribute("hreflang", "en");
  });
});
