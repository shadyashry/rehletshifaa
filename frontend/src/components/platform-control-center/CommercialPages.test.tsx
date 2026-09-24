import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { apiFetchAs } from "@/lib/api";
import { fakeApi, json, organization, providerDetail } from "./test-support";
import { ExchangeRatesPage, PricingHub, directPricingCandidates } from "./CommercialSetup";
import { OrganizationProfile, profileEditability } from "./OrganizationProfile";

const auth = vi.hoisted(() => ({ user: { access_token: "test", profile: { sub: "u1", auth_time: Math.floor(Date.now() / 1000) } }, roles: [] as string[], loading: false, signIn: vi.fn(), signOut: vi.fn() }));
vi.mock("@/components/AuthProvider", () => ({ useAuth: () => auth }));
vi.mock("@/lib/api", () => ({ apiFetchAs: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn(), push: vi.fn() }) }));
afterEach(() => { cleanup(); vi.clearAllMocks(); auth.roles = []; });
const gets = () => vi.mocked(apiFetchAs).mock.calls.filter(([, , init]) => !init?.method || init.method === "GET").map(([, p]) => p);

const directRow = { id: "p-direct", displayName: "Dr Omar Said", specialty: "Cardiology", careCategory: "cardiology", credentialingStatus: "VERIFIED" };
const providerInvited = { id: "p-provider", displayName: "Dr Salma Farouk", specialty: "Cardiology", careCategory: "cardiology", credentialingStatus: "UNDER_REVIEW", providerCredentialing: true };
const clinicianRow = { organizationId: "org-a", organizationName: "Al Noor Hospital", organizationStatus: "ONBOARDING", organizationLegacyMapping: false, practitionerId: "prac-1", displayName: "Dr Salma Farouk", clinicianType: "CONSULTANT", onboardingStatus: "PROFILE_INCOMPLETE", membershipStatus: "ACTIVE", providerCredentialing: true, credentialsRequired: 1, credentialStatuses: {} };

describe("Price Lists — Direct and provider pricing stay separate", () => {
  it("never lists a provider clinician in the Direct price-list picker (UX-3 debt)", async () => {
    auth.roles = ["SYSTEM_ADMIN"];
    vi.mocked(apiFetchAs).mockImplementation(fakeApi({ "/admin/practitioners": [directRow, providerInvited], "/admin/providers/clinicians": [clinicianRow] }, ["price_list.view"]));
    render(<PricingHub locale="en" initialView="direct" />);
    const picker = await screen.findByRole("combobox", { name: /Direct clinician/ }) as HTMLSelectElement;
    expect(Array.from(picker.options).map((o) => o.textContent)).toEqual(["Choose a Direct clinician", "Dr Omar Said — Cardiology"]);
    expect(screen.getByText(/priced under Provider organization prices/)).toBeVisible();
    expect(directPricingCandidates([directRow, providerInvited]).map((d) => d.id)).toEqual(["p-direct"]);
  });

  it("picks provider clinicians from one bounded read and explains the pricing source in plain words", async () => {
    vi.mocked(apiFetchAs).mockImplementation(fakeApi({ "/admin/providers/clinicians": [clinicianRow, { ...clinicianRow, practitionerId: "prac-2", displayName: "Dr Gone", membershipStatus: "REVOKED" }] }, ["price_list.view"]));
    render(<PricingHub locale="en" />);
    const clinician = await screen.findByRole("combobox", { name: "Clinician" }) as HTMLSelectElement;
    await waitFor(() => expect(clinician).not.toBeDisabled());
    expect(Array.from(clinician.options).map((o) => o.textContent)).toEqual(["Choose a clinician", "Dr Salma Farouk — Consultant"]);
    expect(screen.getByRole("heading", { name: "How the price that applies is chosen" })).toBeVisible();
    expect(screen.getByText(/used instead of the organization price/)).toBeVisible();
    expect(screen.queryByText(/Consultant override|Organization default/)).not.toBeInTheDocument();
    // No per-organization detail read.
    expect(gets().filter((p) => /^\/admin\/providers\/[^/]+$/.test(p) && p !== "/admin/providers/clinicians")).toEqual([]);
  });
});

describe("Exchange Rates — stored daily rates, never a live feed", () => {
  const rates = [{ currency: "EGP", rate: 1, rateDate: "2026-09-24", source: "BASE" }, { currency: "USD", rate: 0.02, rateDate: "2026-09-24", source: "API" }, { currency: "EUR", rate: 0.018, rateDate: "2026-09-24", source: "MANUAL" }, { currency: "SAR", rate: 0.075, rateDate: "2026-09-24", source: "FALLBACK" }];
  it("states from/to, rate, date, source and snapshot semantics, and saves for today only", async () => {
    auth.roles = ["SYSTEM_ADMIN"];
    vi.mocked(apiFetchAs).mockImplementation(fakeApi({ "/admin/fx-rates": rates, "PUT /admin/fx-rates/USD": json({}) }));
    render(<ExchangeRatesPage locale="en" />);
    const list = await screen.findByRole("list", { name: "Exchange rates" });
    const [usd, eur, sar] = within(list).getAllByRole("listitem");
    expect(usd).toHaveTextContent("EGP → USD");
    expect(usd).toHaveTextContent("1 USD = 50 EGP");
    expect(usd).toHaveTextContent("Daily market rate");
    expect(eur).toHaveTextContent("Saved manually");
    expect(sar).toHaveTextContent("No rate is stored for this day, so the most recent earlier rate is used.");
    expect(screen.getByText(/not live market prices/)).toBeVisible();
    expect(screen.getByText(/changing a rate never changes a proposal already sent/)).toBeVisible();
    expect(screen.getByText(/Rates used for new calculations today/)).toHaveTextContent("2026-09-24");
    expect(within(usd).getByText(/Today only; tomorrow the daily market rate is used again/)).toBeVisible();
    fireEvent.click(within(usd).getByRole("button", { name: "Save rate for today" }));
    await waitFor(() => expect(apiFetchAs).toHaveBeenCalledWith("test", "/admin/fx-rates/USD", expect.objectContaining({ method: "PUT" })));
  });

  it("shows an earlier day as historical and offers no editing there", async () => {
    auth.roles = ["SYSTEM_ADMIN"];
    vi.mocked(apiFetchAs).mockImplementation(fakeApi({ "/admin/fx-rates": rates, "/admin/fx-rates?date=2026-09-01": rates.map((r) => ({ ...r, rateDate: "2026-09-01" })) }));
    render(<ExchangeRatesPage locale="en" />);
    fireEvent.change(await screen.findByLabelText(/Show rates for/), { target: { value: "2026-09-01" } });
    expect(await screen.findByText(/Historical rates — used for calculations on/)).toHaveTextContent("2026-09-01");
    expect(screen.queryByRole("button", { name: "Save rate for today" })).not.toBeInTheDocument();
  });
});

describe("Organization profile", () => {
  const access = (caps: string[]) => ({ can: (k: string) => caps.includes(k) });
  it("shows only the modelled fields and saves them with the unchanged status, version and a required reason", async () => {
    const onSaved = vi.fn();
    vi.mocked(apiFetchAs).mockImplementation(fakeApi({ "PUT /admin/providers/org-a": json(providerDetail.organization) }));
    const { rerender } = render(<OrganizationProfile locale="en" api={(async (p: string, i?: { method?: string; body?: unknown }) => { const r = await apiFetchAs("test", p, { method: i?.method, body: JSON.stringify(i?.body) }); return r.json(); }) as never} organization={organization} access={access(["provider.update"])} editing={false} onEditing={() => undefined} onSaved={onSaved} />);
    expect(screen.getByText("Nile Care LLC")).toBeVisible();
    expect(screen.getByRole("button", { name: "Edit profile" })).toBeVisible();
    rerender(<OrganizationProfile locale="en" api={(async (p: string, i?: { method?: string; body?: unknown }) => { const r = await apiFetchAs("test", p, { method: i?.method, body: JSON.stringify(i?.body) }); return r.json(); }) as never} organization={organization} access={access(["provider.update"])} editing onEditing={() => undefined} onSaved={onSaved} />);
    fireEvent.change(screen.getByLabelText(/Display name/), { target: { value: "Nile Care Heliopolis" } });
    fireEvent.click(screen.getByRole("button", { name: "Save profile" }));
    expect(document.getElementById("org-profile-errors")).toHaveTextContent("Say why you are making this change.");
    expect(apiFetchAs).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText(/Why are you making this change/), { target: { value: "Branch rename" } });
    fireEvent.click(screen.getByRole("button", { name: "Save profile" }));
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(JSON.parse(String(vi.mocked(apiFetchAs).mock.calls[0][2]?.body))).toEqual({ legalName: "Nile Care LLC", businessName: "Nile Care", displayName: "Nile Care Heliopolis", status: "ONBOARDING", countryCode: "EG", timeZone: "Africa/Cairo", defaultCurrency: "EGP", version: 3, reason: "Branch rename" });
  });

  it("follows the backend's edit rule: active organizations and missing grants get no edit action", () => {
    expect(profileEditability({ ...organization, status: "ACTIVE" }, access(["provider.update"]))).toEqual({ editable: false, reason: "active" });
    expect(profileEditability(organization, access([]))).toEqual({ editable: false, reason: "access" });
    expect(profileEditability({ ...organization, status: "SUSPENDED" }, access(["provider.update"]))).toEqual({ editable: false, reason: "access" });
    expect(profileEditability({ ...organization, status: "SUSPENDED" }, access(["provider.suspend"]))).toEqual({ editable: true });
    render(<OrganizationProfile locale="en" api={vi.fn() as never} organization={{ ...organization, status: "ACTIVE" }} access={access(["provider.update"])} editing={false} onEditing={() => undefined} onSaved={() => undefined} />);
    expect(screen.queryByRole("button", { name: "Edit profile" })).not.toBeInTheDocument();
    expect(screen.getByText(/can't be changed in this release/)).toBeVisible();
  });
});
