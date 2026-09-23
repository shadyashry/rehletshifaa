import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { StaffAndTeams } from "./CareOperationsPages";
import { DirectClinicianPage } from "./DirectClinicianPage";
import { ClinicianDirectory } from "./ClinicianDirectory";
import { ExchangeRatesPage, PricingHub } from "./CommercialSetup";
import { apiFetchAs } from "@/lib/api";
import { fakeApi, organization, providerDetail } from "./test-support";

const auth = vi.hoisted(() => ({ user: { access_token: "test", profile: { sub: "admin" } }, roles: ["SYSTEM_ADMIN"] as string[], loading: false, signIn: vi.fn() }));
vi.mock("@/components/AuthProvider", () => ({ useAuth: () => auth }));
vi.mock("@/lib/api", () => ({ apiFetchAs: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn(), push: vi.fn() }) }));

const staff = [
  { subject: "ops-lead", name: "Rania Lead", role: "OPERATIONS_LEAD", staffFunction: "OPERATIONS", email: "rania@example.test", accountStatus: "ACTIVE" },
  { subject: "ops-staff", name: "Karim Staff", role: "OPERATIONS", staffFunction: "OPERATIONS", email: "karim@example.test", accountStatus: "INVITED" },
];
const direct = [{ id: "p-9", displayName: "Dr Omar Said", specialty: "Cardiology", careCategory: "cardiology", credentialingStatus: "UNDER_REVIEW", accountStatus: "INVITED", email: "omar@example.test" }];
const routes = {
  "/admin/staff-teams": staff, "/admin/practitioners": direct, "/admin/practitioners/p-9/catalog": [], "/admin/fx-rates": [{ currency: "USD", rate: 0.02, rateDate: "2026-09-23", source: "MARKET" }],
  "/admin/providers": [organization], "/admin/providers/org-a": providerDetail,
};
beforeEach(() => { auth.roles = ["SYSTEM_ADMIN"]; vi.mocked(apiFetchAs).mockImplementation(fakeApi(routes, [])); });
afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe("Staff & teams (moved from the Administration console)", () => {
  it("assigns every staff function to its lead inline with the unchanged API", async () => {
    render(<StaffAndTeams locale="en" />);
    fireEvent.click(await screen.findByRole("tab", { name: /Operations/ }));
    fireEvent.change(screen.getByLabelText("Reports to: Karim Staff"), { target: { value: "ops-lead" } });
    await waitFor(() => expect(apiFetchAs).toHaveBeenCalledWith("test", "/admin/staff-teams/ops-staff", expect.objectContaining({ method: "PUT", body: JSON.stringify({ leadSubject: "ops-lead" }) })));
    expect(await screen.findByText("Karim Staff's team updated.")).toBeVisible();
  });

  it("invites staff with the same composite lead role the console submitted", async () => {
    render(<StaffAndTeams locale="en" />);
    fireEvent.click(await screen.findByRole("button", { name: /Invite staff member/ }));
    const form = screen.getByRole("form", { name: "Invite staff member" });
    fireEvent.change(within(form).getByLabelText(/Full name/), { target: { value: "Nour Finance" } });
    fireEvent.change(within(form).getByLabelText(/Work email/), { target: { value: "nour@example.test" } });
    fireEvent.change(within(form).getByRole("combobox", { name: /^Team/ }), { target: { value: "FINANCE" } });
    fireEvent.click(within(form).getByRole("checkbox"));
    fireEvent.click(within(form).getByRole("button", { name: "Send secure invitation" }));
    await waitFor(() => expect(apiFetchAs).toHaveBeenCalledWith("test", "/admin/staff", expect.objectContaining({ method: "POST", body: expect.stringContaining("\"role\":\"FINANCE_LEAD\"") })));
  });

  it("is read-only for an auditor", async () => {
    auth.roles = ["AUDITOR"];
    render(<StaffAndTeams locale="en" />);
    fireEvent.click(await screen.findByRole("tab", { name: /Operations/ }));
    expect(screen.getByLabelText("Reports to: Karim Staff")).toBeDisabled();
    expect(screen.queryByRole("button", { name: /Invite staff member/ })).not.toBeInTheDocument();
  });
});

describe("Direct clinicians (Direct with RehletShifaa)", () => {
  it("lists Direct clinicians in the one Clinicians directory with their own model facts and no row menu", async () => {
    render(<ClinicianDirectory locale="en" />);
    expect(await screen.findByRole("link", { name: "Dr Omar Said" })).toHaveAttribute("href", "/en/portal/control-center/providers/clinicians/direct/p-9");
    const row = screen.getByRole("link", { name: "Dr Omar Said" }).closest("li")!;
    expect(within(row).getByText("Direct with RehletShifaa")).toBeVisible();
    expect(within(row).getByText("Awaiting review", { selector: ".cc-status" })).toBeVisible();
    expect(within(row).getByText("Waiting for case approval", { selector: ".cc-row-sub" })).toBeInTheDocument();
    expect(within(row).queryByRole("button", { name: /Actions/ })).not.toBeInTheDocument();
    expect(within(row).getByRole("link", { name: "Continue setup: Dr Omar Said" })).toHaveAttribute("href", "/en/portal/control-center/providers/clinicians/direct/p-9");
  });

  it("keeps account actions on the Direct clinician's page", async () => {
    render(<DirectClinicianPage locale="en" practitionerId="p-9" initialTab="access" />);
    expect(await screen.findByRole("button", { name: "Resend invitation" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Disable access" })).toHaveClass("cc-danger-button");
  });

  it("approves for cases only after a consequence-aware confirmation, and requires a reason to reject", async () => {
    render(<DirectClinicianPage locale="en" practitionerId="p-9" initialTab="approval" />);
    fireEvent.click(await screen.findByRole("button", { name: "Approve for cases…" }));
    expect(screen.getByText(/may become eligible for live case assignment/)).toBeVisible();
    expect(apiFetchAs).not.toHaveBeenCalledWith("test", "/admin/practitioners/p-9/decision?approved=true", expect.anything());
    fireEvent.click(screen.getByRole("button", { name: "Yes, approve for cases" }));
    await waitFor(() => expect(apiFetchAs).toHaveBeenCalledWith("test", "/admin/practitioners/p-9/decision?approved=true", expect.objectContaining({ method: "POST" })));
    fireEvent.click(screen.getByRole("button", { name: "Reject…" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm rejection" }));
    expect(screen.getByText("A reason is required.")).toBeVisible();
    fireEvent.change(screen.getByLabelText(/Reason for rejection/), { target: { value: "Licence not verifiable" } });
    fireEvent.click(screen.getByRole("button", { name: "Confirm rejection" }));
    await waitFor(() => expect(apiFetchAs).toHaveBeenCalledWith("test", "/admin/practitioners/p-9/decision?approved=false&reason=Licence%20not%20verifiable", expect.objectContaining({ method: "POST" })));
  });

  it("keeps the price list out of onboarding: it has its own tab, with an actionable empty state", async () => {
    render(<DirectClinicianPage locale="en" practitionerId="p-9" initialTab="prices" />);
    expect(await screen.findByText("No price list yet")).toBeVisible();
    fireEvent.click(screen.getAllByRole("button", { name: "Derive from template" })[0]);
    await waitFor(() => expect(apiFetchAs).toHaveBeenCalledWith("test", "/admin/practitioners/p-9/catalog/derive", expect.objectContaining({ method: "POST" })));
  });
});

describe("Commercial › Price Lists and Exchange Rates", () => {
  it("explains the price order visually, and Exchange Rates is its own page where a rate can be pinned", async () => {
    vi.mocked(apiFetchAs).mockImplementation(fakeApi(routes, ["price_list.view", "provider.view"]));
    render(<PricingHub locale="en" />);
    expect(await screen.findByText("1. Organization default")).toBeVisible();
    expect(screen.getByText("2. Consultant override")).toBeVisible();
    expect(screen.getByText("3. Associate doctor override")).toBeVisible();
    expect(screen.getByRole("heading", { level: 1, name: "Price Lists" })).toBeVisible();
    expect(screen.queryByRole("button", { name: "Exchange rates" })).not.toBeInTheDocument();
    cleanup();
    render(<ExchangeRatesPage locale="en" />);
    expect(screen.getByRole("heading", { level: 1, name: "Exchange Rates" })).toBeVisible();
    const input = await screen.findByLabelText(/USD — EGP per unit/);
    fireEvent.change(input, { target: { value: "50" } });
    fireEvent.click(screen.getByRole("button", { name: "Save rate" }));
    await waitFor(() => expect(apiFetchAs).toHaveBeenCalledWith("test", "/admin/fx-rates/USD", expect.objectContaining({ method: "PUT", body: JSON.stringify({ rate: 0.02 }) })));
  });
});
