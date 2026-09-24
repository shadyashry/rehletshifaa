import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { PricingManagement } from "./PricingManagement";
import { priceStage } from "./pricing-copy";
import { apiFetchAs } from "@/lib/api";

const auth = { user: { access_token: "test", profile: { sub: "dr-consultant" } }, loading: false, signIn: vi.fn() };
vi.mock("@/components/AuthProvider", () => ({ useAuth: () => auth }));
vi.mock("@/lib/api", () => ({ apiFetchAs: vi.fn() }));

const onboarding = { organizationId: "org-a", practitionerId: "prac-1", clinicianType: "CONSULTANT", status: "ACTIVE", jurisdiction: "AE", version: 0, ownerSubject: "dr-consultant" };
const orgPrice = { id: "price-org", organizationId: "org-a", serviceCode: "CONSULT", serviceName: "Initial consultation", category: null, scopeType: "ORGANIZATION", scopeKey: "ORGANIZATION", clinicianId: null, amount: "100.00", currency: "EGP", effectiveFrom: "2026-01-01T00:00:00Z", effectiveTo: null, status: "ACTIVE", versionNumber: 1, consultantApprovalRequired: false, consultantApprovedBy: null, legacyCatalogId: null, revision: 0 };
const consultantDraft = { id: "price-consultant", organizationId: "org-a", serviceCode: "CONSULT", serviceName: "Initial consultation", category: null, scopeType: "CONSULTANT", scopeKey: "prac-1", clinicianId: "prac-1", amount: "150.00", currency: "EGP", effectiveFrom: "2026-02-01T00:00:00Z", effectiveTo: null, status: "DRAFT", versionNumber: 1, consultantApprovalRequired: true, consultantApprovedBy: null, legacyCatalogId: null, revision: 0 };
const consultantLive = { ...consultantDraft, id: "price-live", status: "ACTIVE", consultantApprovalRequired: false, legacyCatalogId: "cat-1", versionNumber: 2 };
const orgEffective = { amount: "100.00", currency: "EGP", sourceLevel: "ORGANIZATION", priceId: "price-org", version: 1, effectiveFrom: "2026-01-01T00:00:00Z", effectiveTo: null };

function mockApi(capabilities: string[], prices: unknown[] = [orgPrice, consultantDraft], effective: unknown = orgEffective) {
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
const calls = () => vi.mocked(apiFetchAs).mock.calls.map(([, p, init]) => `${init?.method ?? "GET"} ${p}`);
afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe("Pricing management — where the price comes from", () => {
  it("names the backend-resolved source in business words, with the organization, and lists each level's versions by stage", async () => {
    mockApi(["price_list.view"]);
    render(<PricingManagement locale="en" organizationId="org-a" practitionerId="prac-1" organizationName="Al Noor Hospital" />);
    const applied = (await screen.findByText("Price that applies now")).closest("p")!;
    expect(applied).toHaveTextContent("Using organization price · Organization: Al Noor Hospital");
    expect(screen.getByRole("heading", { level: 4, name: "Organization price" })).toBeVisible();
    expect(screen.getByRole("heading", { level: 4, name: "Clinician-specific price" })).toBeVisible();
    expect(screen.getByText("Current")).toBeVisible();
    expect(screen.getByText("Draft · awaiting clinician approval")).toBeVisible();
    // Version numbers and engine words are not the primary model.
    expect(screen.queryByText(/· v\d/)).not.toBeInTheDocument();
    expect(screen.queryByText(/override|inheritance|scope/i)).not.toBeInTheDocument();
  });

  it("says a clinician-specific price overrides the organization price only when one is in effect", async () => {
    mockApi(["price_list.view"], [orgPrice, consultantLive], { ...orgEffective, sourceLevel: "CONSULTANT", amount: "150.00", priceId: "price-live" });
    render(<PricingManagement locale="en" organizationId="org-a" practitionerId="prac-1" />);
    expect((await screen.findByText("Price that applies now")).closest("p")).toHaveTextContent("Clinician-specific price · Overrides the organization price for this service");
    cleanup();
    mockApi(["price_list.view"], [consultantLive], { ...orgEffective, sourceLevel: "CONSULTANT", amount: "150.00", priceId: "price-live" });
    render(<PricingManagement locale="en" organizationId="org-a" practitionerId="prac-1" />);
    expect((await screen.findByText("Price that applies now")).closest("p")).toHaveTextContent("no organization price is in effect for this service");
  });

  it("labels a price from the Direct price list as a Direct clinician price, never a raw source code", async () => {
    mockApi(["price_list.view"], [orgPrice], { ...orgEffective, sourceLevel: "LEGACY_CONSULTANT" });
    render(<PricingManagement locale="en" organizationId="org-a" practitionerId="prac-1" />);
    expect((await screen.findByText("Price that applies now")).closest("p")).toHaveTextContent("Direct clinician price · From this clinician's Direct price list");
    expect(screen.queryByText(/LEGACY_CONSULTANT/)).not.toBeInTheDocument();
  });

  it("derives the business stage from stored status and the version's own dates only", () => {
    const now = Date.parse("2026-06-01T00:00:00Z");
    expect(priceStage({ ...orgPrice, effectiveFrom: "2026-07-01T00:00:00Z" }, now)).toBe("scheduled");
    expect(priceStage({ ...orgPrice, effectiveTo: "2026-05-01T00:00:00Z" }, now)).toBe("ended");
    expect(priceStage(orgPrice, now)).toBe("current");
    expect(priceStage({ ...consultantDraft, consultantApprovedBy: "dr" }, now)).toBe("approved");
    expect(priceStage({ ...orgPrice, status: "RETIRED" }, now)).toBe("retired");
  });

  it("shows an empty state when no prices are configured", async () => {
    mockApi(["price_list.view"], []);
    render(<PricingManagement locale="en" organizationId="org-a" practitionerId="prac-1" />);
    expect(await screen.findByText("No prices configured yet.")).toBeVisible();
  });

  it("hides pricing management without price_list.view", async () => {
    mockApi([]);
    render(<PricingManagement locale="en" organizationId="org-a" practitionerId="prac-1" />);
    expect(await screen.findByText(/You do not have access/)).toBeVisible();
  });
});

describe("Pricing management — actions follow real decisions", () => {
  it("offers nothing but viewing to a view-only caller", async () => {
    mockApi(["price_list.view"]);
    render(<PricingManagement locale="en" organizationId="org-a" practitionerId="prac-1" />);
    await screen.findByText("Price that applies now");
    expect(screen.queryByRole("button", { name: /New price|Edit draft|Publish|Retire/ })).not.toBeInTheDocument();
  });

  it("separates edit (manage) from publish and retire (publish)", async () => {
    mockApi(["price_list.view", "price_list.publish"]);
    render(<PricingManagement locale="en" organizationId="org-a" practitionerId="prac-1" />);
    await screen.findByText("Price that applies now");
    expect(screen.queryByRole("button", { name: /New price|Edit draft/ })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Publish" })).toBeDisabled(); // awaiting the clinician's own approval
    expect(screen.getByRole("button", { name: "Retire" })).toBeVisible();
  });

  it("lets the Consultant themselves record approval on their own draft", async () => {
    mockApi(["price_list.view", "price_list.manage"]);
    render(<PricingManagement locale="en" organizationId="org-a" practitionerId="prac-1" />);
    fireEvent.click(await screen.findByRole("button", { name: "Record Consultant approval" }));
    await waitFor(() => expect(apiFetchAs).toHaveBeenCalledWith("test", expect.stringContaining("/prices/price-consultant/approve"), expect.objectContaining({ method: "POST" })));
  });

  it("asks who a new price applies to in plain words, and offers approval only for a clinician-specific price", async () => {
    mockApi(["price_list.view", "price_list.manage"]);
    render(<PricingManagement locale="en" organizationId="org-a" practitionerId="prac-1" organizationName="Al Noor Hospital" />);
    fireEvent.click(await screen.findByRole("button", { name: /New price/ }));
    const appliesTo = screen.getByLabelText("Applies to") as HTMLSelectElement;
    expect(Array.from(appliesTo.options).map((o) => o.textContent)).toEqual(["Every clinician in Al Noor Hospital (organization price)", "Only this clinician (clinician-specific price)"]);
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    fireEvent.change(appliesTo, { target: { value: "CONSULTANT" } });
    expect(screen.getByRole("checkbox", { name: /must approve this price/ })).toBeVisible();
    expect(screen.getByText(/Nothing changes for cases until it is published/)).toBeVisible();
  });
});

describe("Retiring a live price version", () => {
  it("states the real consequences for an organization price and sends nothing until confirmed", async () => {
    mockApi(["price_list.view", "price_list.publish"], [orgPrice]);
    render(<PricingManagement locale="en" organizationId="org-a" practitionerId="prac-1" organizationName="Al Noor Hospital" />);
    fireEvent.click(await screen.findByRole("button", { name: "Retire" }));
    const dialog = screen.getByRole("dialog", { name: "Retire this price version?" });
    expect(within(dialog).getByText(/stops applying immediately/)).toBeVisible();
    expect(within(dialog).getByText(/Clinicians in Al Noor Hospital who don't have their own price .* will then have no price/)).toBeVisible();
    expect(within(dialog).getByText(/Estimates and proposals already prepared keep the prices/)).toBeVisible();
    expect(calls().some((c) => c.includes("/retire"))).toBe(false);
    fireEvent.click(within(dialog).getByRole("button", { name: "Yes, retire price" }));
    await waitFor(() => expect(apiFetchAs).toHaveBeenCalledWith("test", expect.stringContaining("/prices/price-org/retire?revision=0"), expect.objectContaining({ method: "POST" })));
  });

  it("says the organization price takes over, and that the case price list entry goes too, for a clinician-specific price", async () => {
    mockApi(["price_list.view", "price_list.publish"], [orgPrice, consultantLive], { ...orgEffective, sourceLevel: "CONSULTANT" });
    render(<PricingManagement locale="en" organizationId="org-a" practitionerId="prac-1" />);
    await screen.findByText("Price that applies now");
    const clinicianLevel = screen.getByRole("heading", { level: 4, name: "Clinician-specific price" }).parentElement!;
    fireEvent.click(within(clinicianLevel).getByRole("button", { name: "Retire" }));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("After that, the organization price applies to this clinician for this service.")).toBeVisible();
    expect(within(dialog).getByText(/removed from the services this Consultant can choose in a case review/)).toBeVisible();
  });
});
