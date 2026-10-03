import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { apiFetchAs } from "@/lib/api";
import type { Me } from "@/lib/access";
import { fakeApi, json, meWith } from "./test-support";
import { ExchangeRatesPage, PricingHub } from "./CommercialSetup";

const auth = vi.hoisted(() => ({ user: { access_token: "test", profile: { sub: "u1", auth_time: Math.floor(Date.now() / 1000) } }, me: null as Me | null, roles: [] as string[], loading: false, meFailed: false, refreshMe: vi.fn(), signIn: vi.fn(), signOut: vi.fn() }));
vi.mock("@/components/AuthProvider", () => ({ useAuth: () => auth }));
vi.mock("@/lib/api", () => ({ apiFetchAs: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn(), push: vi.fn() }) }));
afterEach(() => { cleanup(); vi.clearAllMocks(); auth.me = null; });

const FINANCE = ["REFERENCE_DATA_READ", "COMMERCIAL_POLICY_READ", "COMMERCIAL_POLICY_MANAGE", "PAYMENT_RECORD"];

describe("Price Lists — each consultant's EGP list and the care-area templates", () => {
  it("picks a consultant and shows their price list; templates are a second view", async () => {
    auth.me = meWith(["CREDENTIAL_READ", "CONSULTANT_CATALOG_MANAGE"]);
    vi.mocked(apiFetchAs).mockImplementation(fakeApi({ "/admin/practitioners": [{ id: "p-1", displayName: "Dr Omar Said", careCategory: "cardiology" }], "/admin/practitioners/p-1/catalog": [], "/admin/fx-rates": [], "/admin/service-templates": [] }));
    render(<PricingHub locale="en" />);
    const picker = await screen.findByRole("combobox", { name: "Consultant" }) as HTMLSelectElement;
    await waitFor(() => expect(Array.from(picker.options).map((o) => o.textContent)).toEqual(["Choose a consultant", "Dr Omar Said"]));
    fireEvent.change(picker, { target: { value: "p-1" } });
    expect(await screen.findByText("No price list yet")).toBeVisible();
    expect(screen.getByRole("link", { name: "Open the consultant's page" })).toHaveAttribute("href", "/en/portal/control-center/consultants/p-1?tab=prices");
    fireEvent.click(screen.getByRole("button", { name: "Care-area templates" }));
    expect(screen.getByRole("button", { name: "Care-area templates" })).toHaveAttribute("aria-pressed", "true");
  });

  it("is not offered without the catalog permission", () => {
    auth.me = meWith(FINANCE);
    render(<PricingHub locale="en" />);
    expect(screen.getByText("You don't have access to price lists")).toBeVisible();
  });
});

describe("Exchange Rates — stored daily rates, never a live feed", () => {
  const rates = [{ currency: "EGP", rate: 1, rateDate: "2026-09-24", source: "BASE" }, { currency: "USD", rate: 0.02, rateDate: "2026-09-24", source: "API" }, { currency: "EUR", rate: 0.018, rateDate: "2026-09-24", source: "MANUAL" }, { currency: "SAR", rate: 0.075, rateDate: "2026-09-24", source: "FALLBACK" }];
  it("states from/to, rate, date, source and snapshot semantics, and saves for today only", async () => {
    auth.me = meWith(FINANCE);
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
    auth.me = meWith(FINANCE);
    vi.mocked(apiFetchAs).mockImplementation(fakeApi({ "/admin/fx-rates": rates, "/admin/fx-rates?date=2026-09-01": rates.map((r) => ({ ...r, rateDate: "2026-09-01" })) }));
    render(<ExchangeRatesPage locale="en" />);
    fireEvent.change(await screen.findByLabelText(/Show rates for/), { target: { value: "2026-09-01" } });
    expect(await screen.findByText(/Historical rates — used for calculations on/)).toHaveTextContent("2026-09-01");
    expect(screen.queryByRole("button", { name: "Save rate for today" })).not.toBeInTheDocument();
  });
});

describe("Exchange Rates — read-only without commercial policy management", () => {
  it("shows the rates but offers no saving to someone who only reads reference data", async () => {
    auth.me = meWith(["REFERENCE_DATA_READ", "COMMERCIAL_POLICY_READ"]);
    vi.mocked(apiFetchAs).mockImplementation(fakeApi({ "/admin/fx-rates": [{ currency: "USD", rate: 0.02, rateDate: "2026-09-24", source: "API" }] }));
    render(<ExchangeRatesPage locale="en" />);
    expect(await screen.findByRole("list", { name: "Exchange rates" })).toBeVisible();
    expect(screen.queryByRole("button", { name: "Save rate for today" })).not.toBeInTheDocument();
  });
});
