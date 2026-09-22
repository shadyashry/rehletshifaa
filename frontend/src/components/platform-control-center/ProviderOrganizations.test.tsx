import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { ProviderOrganizations } from "./ProviderOrganizations";
import { ControlCenterNavigation } from "./ControlCenterNavigation";
import { apiFetchAs } from "@/lib/api";

vi.mock("@/components/AuthProvider", () => {
  const auth = { user: { access_token: "test", profile: { sub: "owner" } }, loading: false, signIn: vi.fn() };
  return { useAuth: () => auth };
});
vi.mock("@/lib/api", () => ({ apiFetchAs: vi.fn() }));

const org = { id: "org-1", legalName: "Nile Care LLC", businessName: "Nile Care", displayName: "Nile Care Clinic", type: "CLINIC", status: "ACTIVE", countryCode: "EG", timeZone: "Africa/Cairo", defaultCurrency: "EGP", legacyMappingStatus: "REVIEWED", version: 0 };
const capabilities = ["provider.view", "provider.create"];

beforeEach(() => {
  vi.mocked(apiFetchAs).mockImplementation(async (_token, path) => {
    if (path.endsWith("/admin/access/me")) return new Response(JSON.stringify(capabilities.map((permission) => ({ permission, allowed: true }))), { status: 200 });
    if (path === "/admin/providers") return new Response(JSON.stringify([org]), { status: 200 });
    return new Response(JSON.stringify({}), { status: 200 });
  });
});
afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe("Provider organizations list", () => {
  it("renders organizations with readable status and no fake filtering when the API already returned everything", async () => {
    render(<ProviderOrganizations locale="en" />);
    expect(await screen.findByRole("link", { name: /Nile Care Clinic/ })).toBeVisible();
    expect(screen.getByText("Active")).toBeVisible();
    expect(screen.getByRole("button", { name: /New organization/ })).toBeVisible();
  });

  it("filters the loaded list by search text", async () => {
    render(<ProviderOrganizations locale="en" />);
    await screen.findByRole("link", { name: /Nile Care Clinic/ });
    fireEvent.change(screen.getByLabelText("Find an organization"), { target: { value: "does-not-exist" } });
    expect(screen.queryByRole("link", { name: /Nile Care Clinic/ })).not.toBeInTheDocument();
  });

  it("supports Arabic RTL rendering", async () => {
    const { container } = render(<ProviderOrganizations locale="ar" />);
    await screen.findByRole("link", { name: /Nile Care Clinic/ });
    expect(container.querySelector(".cc")).toHaveAttribute("dir", "rtl");
  });

  it("fails closed when the caller lacks provider.view", async () => {
    vi.mocked(apiFetchAs).mockResolvedValue(new Response(JSON.stringify([{ permission: "provider.view", allowed: false }]), { status: 200 }));
    const navigation = render(<ControlCenterNavigation locale="en" />);
    await new Promise((r) => setTimeout(r, 0));
    expect(screen.queryByRole("link", { name: "Provider Control Center" })).not.toBeInTheDocument();
    navigation.unmount();
    render(<ProviderOrganizations locale="en" />);
    expect(await screen.findByText(/You do not have access/)).toBeVisible();
    expect(screen.queryByRole("button", { name: /New organization/ })).not.toBeInTheDocument();
  });

  it("renders a recoverable error without stale data", async () => {
    vi.mocked(apiFetchAs).mockRejectedValue(new Error("boom"));
    render(<ProviderOrganizations locale="en" />);
    expect(await screen.findByRole("alert")).toBeVisible();
    expect(screen.getByRole("button", { name: /Refresh/ })).toBeEnabled();
  });
});
