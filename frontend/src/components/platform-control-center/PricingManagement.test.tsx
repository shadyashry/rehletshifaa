import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, fireEvent, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { PricingManagement } from "./PricingManagement";
import { apiFetchAs } from "@/lib/api";

const auth = { user: { access_token: "test", profile: { sub: "dr-consultant" } }, loading: false, signIn: vi.fn() };
vi.mock("@/components/AuthProvider", () => ({ useAuth: () => auth }));
vi.mock("@/lib/api", () => ({ apiFetchAs: vi.fn() }));

const onboarding = { organizationId: "org-a", practitionerId: "prac-1", clinicianType: "CONSULTANT", status: "ACTIVE", jurisdiction: "AE", version: 0, ownerSubject: "dr-consultant" };
const orgPrice = { id: "price-org", organizationId: "org-a", serviceCode: "CONSULT", serviceName: "Initial consultation", category: null, scopeType: "ORGANIZATION", scopeKey: "ORGANIZATION", clinicianId: null, amount: "100.00", currency: "EGP", effectiveFrom: "2026-01-01T00:00:00Z", effectiveTo: null, status: "ACTIVE", versionNumber: 1, consultantApprovalRequired: false, consultantApprovedBy: null, legacyCatalogId: null, revision: 0 };
const consultantDraft = { id: "price-consultant", organizationId: "org-a", serviceCode: "CONSULT", serviceName: "Initial consultation", category: null, scopeType: "CONSULTANT", scopeKey: "prac-1", clinicianId: "prac-1", amount: "150.00", currency: "EGP", effectiveFrom: "2026-02-01T00:00:00Z", effectiveTo: null, status: "DRAFT", versionNumber: 1, consultantApprovalRequired: true, consultantApprovedBy: null, legacyCatalogId: null, revision: 0 };
const effective = { amount: "100.00", currency: "EGP", sourceLevel: "ORGANIZATION", priceId: "price-org", version: 1, effectiveFrom: "2026-01-01T00:00:00Z", effectiveTo: null };

function mockApi(capabilities: string[], prices = [orgPrice, consultantDraft]) {
  vi.mocked(apiFetchAs).mockImplementation(async (_token, path, init) => {
    if (path.endsWith("/admin/access/me")) return new Response(JSON.stringify(capabilities.map((permission) => ({ permission, allowed: true }))), { status: 200 });
    if (path.endsWith("/onboarding")) return new Response(JSON.stringify(onboarding), { status: 200 });
    if (path.endsWith("/prices") && (!init?.method || init.method === "GET")) return new Response(JSON.stringify(prices), { status: 200 });
    if (path.includes("/prices/effective")) return new Response(JSON.stringify(effective), { status: 200 });
    if (path.endsWith("/prices") && init?.method === "POST") return new Response(JSON.stringify(consultantDraft), { status: 200 });
    if (path.includes("/approve")) return new Response(JSON.stringify({ ...consultantDraft, consultantApprovedBy: "dr-consultant" }), { status: 200 });
    return new Response(JSON.stringify({}), { status: 200 });
  });
}
afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe("Pricing management", () => {
  it("shows the organization default as the real backend-resolved effective price, with the Consultant override listed underneath", async () => {
    mockApi(["price_list.view"]);
    render(<PricingManagement locale="en" organizationId="org-a" practitionerId="prac-1" />);
    expect(await screen.findByText(/Effective price/)).toBeVisible();
    expect(screen.getByText("Organization default · v1")).toBeVisible();
    expect(screen.getByText("Consultant override · v1")).toBeVisible();
  });

  it("shows an empty state when no prices are configured", async () => {
    mockApi(["price_list.view"], []);
    render(<PricingManagement locale="en" organizationId="org-a" practitionerId="prac-1" />);
    expect(await screen.findByText("No prices configured yet.")).toBeVisible();
  });

  it("lets the Consultant themselves record approval on their own draft override", async () => {
    mockApi(["price_list.view", "price_list.manage"]);
    render(<PricingManagement locale="en" organizationId="org-a" practitionerId="prac-1" />);
    await screen.findByText("Consultant override · v1");
    const approveButton = screen.getByRole("button", { name: "Record Consultant approval" });
    fireEvent.click(approveButton);
    await waitFor(() => expect(apiFetchAs).toHaveBeenCalledWith("test", expect.stringContaining("/prices/price-consultant/approve"), expect.objectContaining({ method: "POST" })));
  });

  it("hides pricing management without price_list.view", async () => {
    mockApi([]);
    render(<PricingManagement locale="en" organizationId="org-a" practitionerId="prac-1" />);
    expect(await screen.findByText(/You do not have access/)).toBeVisible();
  });
});

describe("Retiring a live price", () => {
  it("states the consequence and sends nothing until confirmed", async () => {
    mockApi(["price_list.view", "price_list.publish"], [orgPrice]);
    render(<PricingManagement locale="en" organizationId="org-a" practitionerId="prac-1" />);
    fireEvent.click(await screen.findByRole("button", { name: "Retire" }));
    expect(screen.getByText(/won't be used for new estimates or quotes/)).toBeVisible();
    expect(screen.getByText(/Proposals already sent to patients keep the price/)).toBeVisible();
    expect(apiFetchAs).not.toHaveBeenCalledWith("test", expect.stringContaining("/retire"), expect.anything());
    fireEvent.click(screen.getByRole("button", { name: "Yes, retire price" }));
    await waitFor(() => expect(apiFetchAs).toHaveBeenCalledWith("test", expect.stringContaining("/prices/price-org/retire?revision=0"), expect.objectContaining({ method: "POST" })));
  });
});
