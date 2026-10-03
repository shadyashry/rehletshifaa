import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { apiFetchAs } from "@/lib/api";
import type { Me } from "@/lib/access";
import { fakeApi, meWith } from "./test-support";
import { MarginDeposit } from "./MarginDeposit";
import { CareCoordinationWorkspace } from "./CareCoordinationWorkspace";
import { ConsultantDirectory } from "./ConsultantDirectory";
import { PeoplePage } from "./WorkforcePages";

const auth = vi.hoisted(() => ({ user: { access_token: "test", profile: { sub: "u1", auth_time: Math.floor(Date.now() / 1000) } }, me: null as Me | null, roles: [] as string[], loading: false, meFailed: false, refreshMe: vi.fn(), signIn: vi.fn(), signOut: vi.fn() }));
vi.mock("@/components/AuthProvider", () => ({ useAuth: () => auth }));
vi.mock("@/lib/api", () => ({ apiFetchAs: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn(), push: vi.fn() }) }));
afterEach(() => { cleanup(); vi.clearAllMocks(); auth.me = null; });

const h1 = () => screen.getAllByRole("heading", { level: 1 }).map((h) => h.textContent);
const trail = () => within(screen.getByRole("navigation", { name: "Breadcrumb" })).getAllByRole("listitem").map((li) => li.textContent);
const policies = {
  "/finance/commercial-policies": [{ id: "m1", careCategory: "cardiology", marginRate: 0.12, active: true, version: 3 }],
  "/finance/deposit-policies": [{ id: "d1", coordinationDepositEgp: 3000, active: true, version: 1 }],
};

describe("Commercial › Margin & Deposit", () => {
  it("Finance sees the active policies and saves a new version only after confirming its consequence", async () => {
    auth.me = meWith(["COMMERCIAL_POLICY_READ", "COMMERCIAL_POLICY_MANAGE", "REFERENCE_DATA_READ"]);
    vi.mocked(apiFetchAs).mockImplementation(fakeApi(policies));
    render(<MarginDeposit locale="en" />);
    expect(await screen.findByText("12.00%")).toBeVisible();
    expect(screen.getByText("Default (all care areas)", { selector: "strong" })).toBeVisible();
    expect(h1()).toEqual(["Margin & Deposit"]);
    expect(trail()).toEqual(["Control Center", "Commercial", "Margin & Deposit"]);
    fireEvent.change(screen.getByLabelText("Margin %"), { target: { value: "15" } });
    expect(screen.getByRole("note")).toHaveTextContent(/Internal only/);
    fireEvent.click(screen.getAllByRole("button", { name: "Review new version" })[0]);
    const dialog = screen.getByRole("dialog", { name: "Confirm new version" });
    expect(within(dialog).getByText(/used for preliminary estimates created from now on/)).toBeVisible();
    expect(apiFetchAs).not.toHaveBeenCalledWith("test", "/finance/commercial-policies", expect.objectContaining({ method: "PUT" }));
    fireEvent.click(within(dialog).getByRole("button", { name: "Save new version" }));
    await waitFor(() => expect(apiFetchAs).toHaveBeenCalledWith("test", "/finance/commercial-policies", expect.objectContaining({ method: "PUT", body: JSON.stringify({ marginRate: 0.15 }) })));
  });

  it("is read-only for someone who may read but not manage commercial policy", async () => {
    auth.me = meWith(["COMMERCIAL_POLICY_READ", "CREDENTIAL_READ"]);
    vi.mocked(apiFetchAs).mockImplementation(fakeApi(policies));
    render(<MarginDeposit locale="en" />);
    expect(await screen.findByText("12.00%")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Review new version" })).not.toBeInTheDocument();
  });

  it("is not offered without commercial policy access", async () => {
    auth.me = meWith(["JOURNEY_READ"]);
    render(<MarginDeposit locale="en" />);
    expect(await screen.findByText("You don't have access to margin and deposit policies")).toBeVisible();
    expect(apiFetchAs).not.toHaveBeenCalled();
  });
});

describe("Page header standard", () => {
  it("keeps the h1 stable while a page loads — never 'Loading…'", async () => {
    auth.me = meWith(["ROUTING_READ"]);
    let release: (r: Response) => void = () => undefined;
    vi.mocked(apiFetchAs).mockImplementation(() => new Promise<Response>((r) => { release = r; }));
    render(<CareCoordinationWorkspace locale="en" />);
    expect(h1()).toEqual(["Coordination Setup"]);
    release(new Response("{}"));
    expect(h1()).toEqual(["Coordination Setup"]);
  });

  it("calls the directory Consultants with one primary action", async () => {
    auth.me = meWith(["CREDENTIAL_READ", "CONSULTANT_ONBOARD"]);
    vi.mocked(apiFetchAs).mockImplementation(fakeApi({ "/admin/practitioners": [] }));
    render(<ConsultantDirectory locale="en" />);
    await waitFor(() => expect(screen.queryByRole("status")).not.toBeInTheDocument());
    expect(h1()).toEqual(["Consultants"]);
    const header = screen.getByRole("heading", { level: 1 }).closest("header")!;
    expect(within(header).getAllByRole("link").map((a) => a.textContent)).toEqual(["Add consultant"]);
  });

  it("names Workforce pages in business terms, with the invite action only for administrators", async () => {
    auth.me = meWith(["WORKFORCE_READ", "WORKFORCE_ADMINISTER"]);
    vi.mocked(apiFetchAs).mockImplementation(fakeApi({ "/admin/platform-access/staff": { people: [], invitations: [] } }));
    render(<PeoplePage locale="en" />);
    expect(h1()).toEqual(["People"]);
    expect(trail()).toEqual(["Control Center", "Workforce", "People"]);
    expect(screen.getByRole("button", { name: "Invite person" })).toBeVisible();
    cleanup();
    auth.me = meWith(["WORKFORCE_READ", "AUDIT_READ"]);
    render(<PeoplePage locale="en" />);
    expect(await screen.findByText("No staff yet")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Invite person" })).not.toBeInTheDocument();
  });
});
