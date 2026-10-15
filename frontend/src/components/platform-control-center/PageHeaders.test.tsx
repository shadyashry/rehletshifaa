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
  "/finance/deposit-policies": [{ id: "d1", depositRate: 0.15, minimumUsd: 200, maximumUsd: 1500, active: true, version: 1 }],
  "/finance/care-areas": [{ slug: "cardiology", nameEn: "Cardiology", nameAr: "أمراض القلب" }, { slug: "womens-health", nameEn: "Women's Health", nameAr: "صحة المرأة" },
    { slug: "general-surgery", nameEn: "General & Metabolic Surgery", nameAr: "الجراحة العامة وجراحات السمنة" }],
};

describe("Commercial › Margin & Deposit", () => {
  it("Finance sees the active policies and saves a new version only after confirming its consequence", async () => {
    auth.me = meWith(["COMMERCIAL_POLICY_READ", "COMMERCIAL_POLICY_MANAGE", "REFERENCE_DATA_READ"]);
    vi.mocked(apiFetchAs).mockImplementation(fakeApi(policies));
    render(<MarginDeposit locale="en" />);
    expect(await screen.findByText("12.00%")).toBeVisible();
    // QA #22: every care area the platform manages can carry a policy, not only the first three.
    expect(screen.getAllByRole("option", { name: "Women's Health" }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("option", { name: "General & Metabolic Surgery" }).length).toBeGreaterThan(0);
    expect(screen.getByText("Default (all care areas)", { selector: "strong" })).toBeVisible();
    expect(h1()).toEqual(["Margin & Deposit"]);
    expect(trail()).toEqual(["Control Center", "Commercial", "Margin & Deposit"]);
    fireEvent.change(screen.getByLabelText("Margin %"), { target: { value: "15" } });
    // P1-16 (D-E): the change-order band is prefilled at 10% of the package and EGP 15,000, and stated with the revision.
    fireEvent.change(screen.getByLabelText("Change-order band cap (EGP)"), { target: { value: "12000" } });
    expect(screen.getByRole("note")).toHaveTextContent(/Internal only/);
    fireEvent.click(screen.getAllByRole("button", { name: "Review new version" })[0]);
    const dialog = screen.getByRole("dialog", { name: "Confirm new version" });
    expect(within(dialog).getByText(/used for preliminary estimates created from now on/)).toBeVisible();
    expect(apiFetchAs).not.toHaveBeenCalledWith("test", "/finance/commercial-policies", expect.objectContaining({ method: "PUT" }));
    fireEvent.click(within(dialog).getByRole("button", { name: "Save new version" }));
    await waitFor(() => expect(apiFetchAs).toHaveBeenCalledWith("test", "/finance/commercial-policies", expect.objectContaining({ method: "PUT", body: JSON.stringify({ marginRate: 0.15, manualBandEgp: null, finalQuoteValidityDays: 14, fxToleranceRate: 0.03, changeOrderBandRate: 0.1, changeOrderBandEgp: 12000 }) })));
  });

  it("states the pre-approved manual band with every margin revision (P0-5)", async () => {
    auth.me = meWith(["COMMERCIAL_POLICY_READ", "COMMERCIAL_POLICY_MANAGE", "REFERENCE_DATA_READ"]);
    vi.mocked(apiFetchAs).mockImplementation(fakeApi({ ...policies, "/finance/commercial-policies": [{ id: "m0", marginRate: 0.15, manualBandEgp: 20000, active: true, version: 1 }] }));
    render(<MarginDeposit locale="en" />);
    expect(await screen.findByText("Manual lines up to EGP 20000 release without Finance")).toBeVisible();
    fireEvent.change(screen.getByLabelText("Margin %"), { target: { value: "15" } });
    fireEvent.change(screen.getByLabelText(/Pre-approved manual band/), { target: { value: "25000" } });
    fireEvent.click(screen.getAllByRole("button", { name: "Review new version" })[0]);
    const dialog = screen.getByRole("dialog", { name: "Confirm new version" });
    expect(dialog).toHaveTextContent("Manual lines up to EGP 25000 release without Finance");
    fireEvent.click(within(dialog).getByRole("button", { name: "Save new version" }));
    await waitFor(() => expect(apiFetchAs).toHaveBeenCalledWith("test", "/finance/commercial-policies", expect.objectContaining({ body: JSON.stringify({ marginRate: 0.15, manualBandEgp: 25000, finalQuoteValidityDays: 14, fxToleranceRate: 0.03, changeOrderBandRate: 0.1, changeOrderBandEgp: 15000 }) })));
  });

  it("shows and sends the final-quote validity and the exchange-rate tolerance with every margin revision (P1-10)", async () => {
    auth.me = meWith(["COMMERCIAL_POLICY_READ", "COMMERCIAL_POLICY_MANAGE", "REFERENCE_DATA_READ"]);
    vi.mocked(apiFetchAs).mockImplementation(fakeApi({ ...policies, "/finance/commercial-policies": [{ id: "m0", marginRate: 0.15, manualBandEgp: null, finalQuoteValidityDays: 7, fxToleranceRate: 0.05, active: true, version: 2 }] }));
    render(<MarginDeposit locale="en" />);
    expect(await screen.findByText("Final quote valid 7 days · Finance re-approves a rate move beyond 5.00%")).toBeVisible();
    // Prefilled from the active version, so a revision never resets them silently.
    expect(screen.getByLabelText(/Final quote validity/)).toHaveValue(7);
    expect(screen.getByLabelText(/Exchange-rate tolerance/)).toHaveValue(5);
    fireEvent.change(screen.getByLabelText("Margin %"), { target: { value: "15" } });
    fireEvent.change(screen.getByLabelText(/Final quote validity/), { target: { value: "10" } });
    fireEvent.change(screen.getByLabelText(/Exchange-rate tolerance/), { target: { value: "2.5" } });
    fireEvent.click(screen.getAllByRole("button", { name: "Review new version" })[0]);
    const dialog = screen.getByRole("dialog", { name: "Confirm new version" });
    expect(dialog).toHaveTextContent("final quote valid 10 days");
    expect(dialog).toHaveTextContent("rate tolerance 2.5%");
    fireEvent.click(within(dialog).getByRole("button", { name: "Save new version" }));
    await waitFor(() => expect(apiFetchAs).toHaveBeenCalledWith("test", "/finance/commercial-policies", expect.objectContaining({ method: "PUT", body: JSON.stringify({ marginRate: 0.15, manualBandEgp: null, finalQuoteValidityDays: 10, fxToleranceRate: 0.025, changeOrderBandRate: 0.1, changeOrderBandEgp: 15000 }) })));
  });

  it("shows the change-order band and sends it, prefilled from the active version, with every margin revision (P1-16, D-E)", async () => {
    auth.me = meWith(["COMMERCIAL_POLICY_READ", "COMMERCIAL_POLICY_MANAGE", "REFERENCE_DATA_READ"]);
    vi.mocked(apiFetchAs).mockImplementation(fakeApi({ ...policies, "/finance/commercial-policies": [{ id: "m0", marginRate: 0.15, manualBandEgp: null, finalQuoteValidityDays: 14,
      fxToleranceRate: 0.03, changeOrderBandRate: 0.08, changeOrderBandEgp: 9000, active: true, version: 3 }] }));
    render(<MarginDeposit locale="en" />);
    expect(await screen.findByText("Change orders up to 8.00% of the package or EGP 9000 (the lower) are Finance's to decide")).toBeVisible();
    expect(screen.getByLabelText(/Change-order band \(% of the package\)/)).toHaveValue(8);
    expect(screen.getByLabelText("Change-order band cap (EGP)")).toHaveValue(9000);
    fireEvent.change(screen.getByLabelText("Margin %"), { target: { value: "15" } });
    fireEvent.change(screen.getByLabelText(/Change-order band \(% of the package\)/), { target: { value: "5" } });
    fireEvent.click(screen.getAllByRole("button", { name: "Review new version" })[0]);
    const dialog = screen.getByRole("dialog", { name: "Confirm new version" });
    expect(dialog).toHaveTextContent("Change orders up to 5.00% of the package or EGP 9000 (the lower) are Finance's to decide");
    fireEvent.click(within(dialog).getByRole("button", { name: "Save new version" }));
    await waitFor(() => expect(apiFetchAs).toHaveBeenCalledWith("test", "/finance/commercial-policies", expect.objectContaining({ method: "PUT",
      body: JSON.stringify({ marginRate: 0.15, manualBandEgp: null, finalQuoteValidityDays: 14, fxToleranceRate: 0.03, changeOrderBandRate: 0.05, changeOrderBandEgp: 9000 }) })));
  });

  it("sets the deposit as a share of the estimate (W-1: 15%)", async () => {
    auth.me = meWith(["COMMERCIAL_POLICY_READ", "COMMERCIAL_POLICY_MANAGE", "REFERENCE_DATA_READ"]);
    vi.mocked(apiFetchAs).mockImplementation(fakeApi(policies));
    render(<MarginDeposit locale="en" />);
    expect(await screen.findByText("15.00%")).toBeVisible();
    fireEvent.change(screen.getByLabelText("Coordination deposit (% of the estimate)"), { target: { value: "20" } });
    fireEvent.click(screen.getAllByRole("button", { name: "Review new version" })[1]);
    const dialog = screen.getByRole("dialog", { name: "Confirm new version" });
    expect(dialog).toHaveTextContent("20.00% of the estimate");
    // P0-4: the revision states its dollar bounds too, prefilled from the policy in use, so saving a rate never drops them.
    expect(dialog).toHaveTextContent("Minimum 200 USD · Maximum 1500 USD");
    fireEvent.click(within(dialog).getByRole("button", { name: "Save new version" }));
    await waitFor(() => expect(apiFetchAs).toHaveBeenCalledWith("test", "/finance/deposit-policies", expect.objectContaining({ method: "PUT", body: JSON.stringify({ depositRate: 0.2, minimumUsd: 200, maximumUsd: 1500 }) })));
  });

  it("shows the deposit bounds in use and sends an emptied bound as none (P0-4)", async () => {
    auth.me = meWith(["COMMERCIAL_POLICY_READ", "COMMERCIAL_POLICY_MANAGE", "REFERENCE_DATA_READ"]);
    vi.mocked(apiFetchAs).mockImplementation(fakeApi(policies));
    render(<MarginDeposit locale="en" />);
    expect(await screen.findByText("Minimum 200 USD · Maximum 1500 USD")).toBeVisible();
    fireEvent.change(screen.getByLabelText("Coordination deposit (% of the estimate)"), { target: { value: "15" } });
    fireEvent.change(screen.getByLabelText("Maximum (USD)"), { target: { value: "" } });
    fireEvent.click(screen.getAllByRole("button", { name: "Review new version" })[1]);
    fireEvent.click(within(screen.getByRole("dialog", { name: "Confirm new version" })).getByRole("button", { name: "Save new version" }));
    await waitFor(() => expect(apiFetchAs).toHaveBeenCalledWith("test", "/finance/deposit-policies", expect.objectContaining({ body: JSON.stringify({ depositRate: 0.15, minimumUsd: 200, maximumUsd: null }) })));
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
