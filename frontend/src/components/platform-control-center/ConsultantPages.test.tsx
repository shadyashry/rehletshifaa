import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { apiFetchAs } from "@/lib/api";
import type { Me } from "@/lib/access";
import { fakeApi, meWith } from "./test-support";
import { ConsultantDirectory } from "./ConsultantDirectory";
import { ConsultantPage } from "./ConsultantPage";
import { AddConsultant } from "./AddConsultant";

const auth = vi.hoisted(() => ({ user: { access_token: "test", profile: { sub: "ops", auth_time: Math.floor(Date.now() / 1000) } }, me: null as Me | null, roles: [] as string[], loading: false, meFailed: false, refreshMe: vi.fn(), signIn: vi.fn(), signOut: vi.fn() }));
vi.mock("@/components/AuthProvider", () => ({ useAuth: () => auth }));
vi.mock("@/lib/api", () => ({ apiFetchAs: vi.fn() }));
const push = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn(), push }) }));

const consultant = { id: "p-9", displayName: "Dr Omar Said", specialty: "Cardiology", careCategory: "cardiology", credentialingStatus: "UNDER_REVIEW", accountStatus: "INVITED", email: "omar@example.test" };
const routes = { "/admin/practitioners": [consultant], "/admin/practitioners/p-9/catalog": [], "/admin/fx-rates": [{ currency: "USD", rate: 0.02, rateDate: "2026-09-23", source: "MARKET" }] };
const MANAGER = ["CREDENTIAL_READ", "CONSULTANT_ONBOARD", "CONSULTANT_CATALOG_MANAGE", "TEAM_MANAGE"];
const VERIFIER = ["CREDENTIAL_READ", "CREDENTIAL_DECIDE", "CAPABILITY_DECIDE"];
beforeEach(() => { vi.mocked(apiFetchAs).mockImplementation(fakeApi(routes)); });
afterEach(() => { cleanup(); vi.clearAllMocks(); auth.me = null; });

describe("Consultants directory", () => {
  it("lists consultants with credential, setup and eligibility as separate facts", async () => {
    auth.me = meWith(MANAGER);
    render(<ConsultantDirectory locale="en" />);
    const link = await screen.findByRole("link", { name: "Dr Omar Said" });
    expect(link).toHaveAttribute("href", "/en/portal/control-center/consultants/p-9");
    const row = link.closest("li")!;
    expect(within(row).getByText("Awaiting review", { selector: ".cc-status" })).toBeVisible();
    expect(within(row).getByText("Waiting for case approval", { selector: ".cc-row-sub" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Add consultant" })).toHaveAttribute("href", "/en/portal/control-center/consultants/new");
  });

  it("offers no add action to a credential verifier, and no directory without CREDENTIAL_READ", async () => {
    auth.me = meWith(VERIFIER);
    render(<ConsultantDirectory locale="en" />);
    expect(await screen.findByRole("link", { name: "Dr Omar Said" })).toBeVisible();
    expect(screen.queryByRole("link", { name: "Add consultant" })).not.toBeInTheDocument();
    cleanup();
    auth.me = meWith(["JOURNEY_READ"]);
    render(<ConsultantDirectory locale="en" />);
    expect(screen.getByText("You don't have access to consultants")).toBeVisible();
    expect(apiFetchAs).toHaveBeenCalledTimes(1);
  });
});

describe("Consultant page", () => {
  it("keeps account actions with the Consultant Operations Manager", async () => {
    auth.me = meWith(MANAGER);
    render(<ConsultantPage locale="en" practitionerId="p-9" initialTab="access" />);
    expect(await screen.findByRole("button", { name: "Resend invitation" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Disable access" })).toHaveClass("cc-danger-button");
    cleanup();
    auth.me = meWith(VERIFIER);
    render(<ConsultantPage locale="en" practitionerId="p-9" initialTab="access" />);
    expect(await screen.findByText("The Consultant Operations Manager manages account access.")).toBeVisible();
  });

  it("lets the credential verifier approve for cases after a consequence-aware confirmation, and requires a reason to reject", async () => {
    auth.me = meWith(VERIFIER);
    render(<ConsultantPage locale="en" practitionerId="p-9" initialTab="approval" />);
    fireEvent.click(await screen.findByRole("button", { name: "Approve for cases…" }));
    expect(screen.getByText(/may become eligible for live case assignment/)).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Yes, approve for cases" }));
    await waitFor(() => expect(apiFetchAs).toHaveBeenCalledWith("test", "/admin/practitioners/p-9/decision?approved=true", expect.objectContaining({ method: "POST" })));
    fireEvent.click(screen.getByRole("button", { name: "Reject…" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm rejection" }));
    expect(screen.getByText("A reason is required.")).toBeVisible();
  });

  it("gives the price list its own tab, editable by the Consultant Operations Manager", async () => {
    auth.me = meWith(MANAGER);
    render(<ConsultantPage locale="en" practitionerId="p-9" initialTab="prices" />);
    expect(await screen.findByText("No price list yet")).toBeVisible();
    fireEvent.click(screen.getAllByRole("button", { name: "Derive from template" })[0]);
    await waitFor(() => expect(apiFetchAs).toHaveBeenCalledWith("test", "/admin/practitioners/p-9/catalog/derive", expect.objectContaining({ method: "POST" })));
  });
});

describe("Add consultant", () => {
  it("sends one invitation and opens the consultant's page", async () => {
    auth.me = meWith(MANAGER);
    vi.mocked(apiFetchAs).mockImplementation(fakeApi({ "POST /admin/practitioners": { id: "p-new" } }));
    render(<AddConsultant locale="en" />);
    fireEvent.change(screen.getByLabelText(/Full name/), { target: { value: "Dr Hana Aziz" } });
    fireEvent.change(screen.getByLabelText(/Work email/), { target: { value: "hana@example.test" } });
    fireEvent.change(screen.getByLabelText(/Specialty/), { target: { value: "Cardiology" } });
    fireEvent.change(screen.getByRole("combobox", { name: /Care area/ }), { target: { value: "cardiology" } });
    fireEvent.click(screen.getByRole("button", { name: "Send invitation" }));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/en/portal/control-center/consultants/p-new?invited=1"));
    expect(apiFetchAs).toHaveBeenCalledWith("test", "/admin/practitioners", expect.objectContaining({ method: "POST", body: expect.stringContaining("\"careCategory\":\"cardiology\"") }));
  });

  it("explains who adds consultants to anyone else", () => {
    auth.me = meWith(VERIFIER);
    render(<AddConsultant locale="en" />);
    expect(screen.getByText("The Consultant Operations Manager adds new consultants.")).toBeVisible();
  });
});
