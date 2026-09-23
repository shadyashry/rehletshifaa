import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { apiFetchAs } from "@/lib/api";
import { fakeApi } from "./test-support";
import { MarginDeposit } from "./MarginDeposit";
import { CareCoordinationOrganizations } from "./CareCoordinationOrganizations";
import { AccessGovernance } from "./AccessGovernance";
import { ClinicianDirectory } from "./ClinicianDirectory";
import { AvailabilityHub } from "./CommercialSetup";

const auth = vi.hoisted(() => ({ user: { access_token: "test", profile: { sub: "u1", auth_time: Math.floor(Date.now() / 1000) } }, roles: [] as string[], loading: false, signIn: vi.fn(), signOut: vi.fn() }));
vi.mock("@/components/AuthProvider", () => ({ useAuth: () => auth }));
vi.mock("@/lib/api", () => ({ apiFetchAs: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn(), push: vi.fn() }) }));
afterEach(() => { cleanup(); vi.clearAllMocks(); auth.roles = []; });

const h1 = () => screen.getAllByRole("heading", { level: 1 }).map((h) => h.textContent);
const trail = () => within(screen.getByRole("navigation", { name: "Breadcrumb" })).getAllByRole("listitem").map((li) => li.textContent);

describe("Commercial › Margin & Deposit (moved from the Finance workspace)", () => {
  it("shows the active policies and saves a new version with the unchanged endpoint and body", async () => {
    auth.roles = ["FINANCE", "FINANCE_LEAD"];
    vi.mocked(apiFetchAs).mockImplementation(fakeApi({
      "/finance/commercial-policies": [{ id: "m1", careCategory: "cardiology", marginRate: 0.12, active: true, version: 3 }],
      "/finance/deposit-policies": [{ id: "d1", coordinationDepositEgp: 3000, active: true, version: 1 }],
    }));
    render(<MarginDeposit locale="en" />);
    expect(await screen.findByText("12.00%")).toBeVisible();
    expect(screen.getByText("Default (all care areas)", { selector: "strong" })).toBeVisible();
    expect(h1()).toEqual(["Margin & Deposit"]);
    expect(trail()).toEqual(["Control Center", "Commercial", "Margin & Deposit"]);
    fireEvent.change(screen.getByLabelText("Margin %"), { target: { value: "15" } });
    fireEvent.click(screen.getAllByRole("button", { name: "Save new version" })[0]);
    await waitFor(() => expect(apiFetchAs).toHaveBeenCalledWith("test", "/finance/commercial-policies", expect.objectContaining({ method: "PUT", body: JSON.stringify({ marginRate: 0.15 }) })));
  });

  it("is not offered to a Finance account that is not a lead", async () => {
    auth.roles = ["FINANCE"];
    vi.mocked(apiFetchAs).mockImplementation(fakeApi({}));
    render(<MarginDeposit locale="en" />);
    expect(await screen.findByText("You don't have access to margin and deposit policies")).toBeVisible();
    expect(apiFetchAs).not.toHaveBeenCalledWith("test", "/finance/commercial-policies", expect.anything());
  });
});

describe("Page header standard", () => {
  it("keeps the h1 stable while a page loads — never 'Loading…'", async () => {
    let release: (r: Response) => void = () => undefined;
    vi.mocked(apiFetchAs).mockImplementation((_t, path) => (String(path).endsWith("/admin/access/me") ? fakeApi({}, ["assignment.team.view"])(_t, path) : new Promise<Response>((r) => { release = r; })));
    render(<CareCoordinationOrganizations locale="en" />);
    expect(h1()).toEqual(["Coordination Setup"]);
    expect(screen.getByText("Choose an organization to set up its coordinator teams, routing rules and assignment queue.")).toBeVisible();
    release(new Response("[]"));
    await waitFor(() => expect(screen.queryByRole("status")).not.toBeInTheDocument());
    expect(h1()).toEqual(["Coordination Setup"]);
  });

  it("names Access pages in business terms and reaches the advanced pages from their parent's header", async () => {
    const caps = ["access.role.view", "access.effective_access.view"];
    vi.mocked(apiFetchAs).mockImplementation(fakeApi({ "/admin/access/roles?offset=0": [], "/admin/access/permissions": [] }, caps));
    render(<AccessGovernance locale="en" view="users" />);
    await waitFor(() => expect(h1()).toEqual(["People"]));
    expect(await screen.findByRole("link", { name: "Access summary" })).toHaveAttribute("href", "/en/portal/control-center/access/effective");
    cleanup();
    render(<AccessGovernance locale="en" view="effective" />);
    await waitFor(() => expect(h1()).toEqual(["Access summary"]));
    expect(screen.getByText(/^Can this person…\?/)).toBeVisible();
    expect(trail()).toEqual(["Control Center", "Access & Governance", "People", "Access summary"]);
    cleanup();
    render(<AccessGovernance locale="en" view="roles" />);
    expect(await screen.findByRole("link", { name: "Permission reference" })).toHaveAttribute("href", "/en/portal/control-center/access/permissions");
  });

  it("calls the directory Clinicians with one primary action; schedules live on each clinician (the hub stays reachable)", async () => {
    vi.mocked(apiFetchAs).mockImplementation(fakeApi({ "/admin/providers": [], "/admin/providers/clinicians": [] }, ["provider.view", "provider.clinician.invite", "availability.view"]));
    render(<ClinicianDirectory locale="en" />);
    await waitFor(() => expect(screen.queryByRole("status")).not.toBeInTheDocument());
    expect(h1()).toEqual(["Clinicians"]);
    const header = screen.getByRole("heading", { level: 1 }).closest("header")!;
    expect(within(header).getAllByRole("link").map((a) => a.textContent)).toEqual(["Add clinician"]);
    cleanup();
    render(<AvailabilityHub locale="en" />);
    await waitFor(() => expect(trail()).toEqual(["Control Center", "Providers", "Clinicians", "Schedules"]));
  });
});
