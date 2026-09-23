import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { ControlCenterShell, ccCrumbs } from "./ControlCenterShell";
import { apiFetchAs } from "@/lib/api";
import { fakeApi } from "./test-support";

const auth = vi.hoisted(() => ({ user: { access_token: "test", profile: { sub: "owner" } }, roles: [] as string[], loading: false, signIn: vi.fn() }));
vi.mock("@/components/AuthProvider", () => ({ useAuth: () => auth }));
vi.mock("@/lib/api", () => ({ apiFetchAs: vi.fn() }));
afterEach(() => { cleanup(); vi.clearAllMocks(); auth.roles = []; });

const renderShell = (locale: "en" | "ar" = "en") => render(
  <ControlCenterShell locale={locale} active="consultants" crumbs={ccCrumbs(locale, { label: "Consultants" })} title="Consultants" intro="Every consultant in one place." actions={<button>Add consultant</button>}>
    <p>content</p>
  </ControlCenterShell>);

describe("Control Center shell", () => {
  it("shows only the sections the caller's exact capabilities allow, grouped by business task", async () => {
    vi.mocked(apiFetchAs).mockImplementation(fakeApi({}, ["provider.view", "credential.review", "access.role.view", "access.effective_access.view"]));
    renderShell();
    const nav = screen.getByRole("navigation", { name: "Control Center" });
    expect(await within(nav).findByRole("link", { name: "Organizations" })).toHaveAttribute("href", "/en/portal/control-center/providers");
    expect(within(nav).getByRole("link", { name: "Consultants" })).toHaveAttribute("aria-current", "page");
    expect(within(nav).getByRole("link", { name: "Credential reviews" })).toBeVisible();
    expect(within(nav).getByRole("link", { name: "User access" })).toHaveAttribute("href", "/en/portal/control-center/access/users");
    expect(within(nav).queryByRole("link", { name: "Audit" })).not.toBeInTheDocument();
    expect(within(nav).queryByRole("link", { name: "Journey library" })).not.toBeInTheDocument();
    expect(within(nav).queryByRole("link", { name: "Staff & teams" })).not.toBeInTheDocument();
    expect(within(nav).getByText("Providers")).toBeVisible();
    expect(within(nav).getByText("Access & governance")).toBeVisible();
  });

  it("uses the existing legacy role check for the current-workflow administration areas", async () => {
    auth.roles = ["SYSTEM_ADMIN", "PATIENT_IDENTITY_REVIEWER"];
    vi.mocked(apiFetchAs).mockImplementation(fakeApi({}, []));
    renderShell();
    const nav = screen.getByRole("navigation", { name: "Control Center" });
    expect(await within(nav).findByRole("link", { name: "Staff & teams" })).toHaveAttribute("href", "/en/portal/control-center/team");
    expect(within(nav).getByRole("link", { name: "Identity checks" })).toBeVisible();
    expect(within(nav).getByRole("link", { name: "Pricing" })).toBeVisible();
    expect(within(nav).queryByRole("link", { name: "Organizations" })).not.toBeInTheDocument();
  });

  it("renders the standard header: breadcrumb, one title, a one-sentence description and actions", async () => {
    vi.mocked(apiFetchAs).mockImplementation(fakeApi({}, []));
    renderShell();
    const crumbs = screen.getByRole("navigation", { name: "Breadcrumb" });
    expect(within(crumbs).getByRole("link", { name: "Control Center" })).toHaveAttribute("href", "/en/portal/control-center");
    expect(within(crumbs).getByText("Consultants")).toHaveAttribute("aria-current", "page");
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(screen.getByText("Every consultant in one place.")).toBeVisible();
    expect(screen.getByRole("link", { name: "Skip to content" })).toHaveAttribute("href", "#cc-main");
    await waitFor(() => expect(screen.queryByText("Loading sections…")).not.toBeInTheDocument());
  });

  it("collapses into a labelled menu on small screens and mirrors for Arabic", async () => {
    vi.mocked(apiFetchAs).mockImplementation(fakeApi({}, ["provider.view"]));
    const { container } = renderShell("ar");
    expect(container.querySelector(".cc")).toHaveAttribute("dir", "rtl");
    const toggle = screen.getByRole("button", { name: /القائمة/ });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(await screen.findByRole("link", { name: "المؤسسات" })).toBeVisible();
  });
});
