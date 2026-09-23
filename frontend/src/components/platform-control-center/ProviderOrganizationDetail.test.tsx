import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { ProviderOrganizationDetail } from "./ProviderOrganizationDetail";
import { apiFetchAs } from "@/lib/api";
import { fakeApi, providerDetail, readiness } from "./test-support";

vi.mock("@/components/AuthProvider", () => {
  const auth = { user: { access_token: "test", profile: { sub: "owner" } }, roles: [], loading: false, signIn: vi.fn() };
  return { useAuth: () => auth };
});
vi.mock("@/lib/api", () => ({ apiFetchAs: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn(), push: vi.fn() }) }));

const verifying = readiness({ requiredCredentialsVerified: false, pricingSetupComplete: true, availabilitySetupComplete: true, blockers: [{ code: "CREDENTIAL_AWAITING_VERIFICATION", message: "Medical licence is awaiting verification." }] });
const caps = ["provider.view", "provider.activate", "provider.member.invite", "provider.member.deactivate", "provider.relationship.manage", "provider.clinician.invite", "provider.practice_staff.manage"];
beforeEach(() => {
  vi.mocked(apiFetchAs).mockImplementation(fakeApi({ "/admin/providers/org-a": providerDetail, "/admin/providers/org-a/clinicians/prac-1/readiness": verifying }, caps));
});
afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe("Organization workspace", () => {
  it("shows the real backend readiness and links straight to the filtered credential reviews", async () => {
    render(<ProviderOrganizationDetail locale="en" organizationId="org-a" initialTab="setup" />);
    expect(await screen.findByText("1 clinician(s) still need verified credentials")).toBeVisible();
    expect(screen.getByRole("link", { name: "Open reviews" })).toHaveAttribute("href", "/en/portal/control-center/credentials?org=org-a");
    expect(screen.getByRole("button", { name: "Activate organization" })).toBeInTheDocument();
    expect(screen.queryByText(/Phase 5A/)).not.toBeInTheDocument();
  });

  it("lists people by name and business role, never by account identifier", async () => {
    render(<ProviderOrganizationDetail locale="en" organizationId="org-a" initialTab="people" />);
    expect(await screen.findByRole("link", { name: "Dr Salma Farouk" })).toHaveAttribute("href", "/en/portal/control-center/providers/consultants/org-a/prac-1");
    expect(screen.getByRole("heading", { name: "Practice managers" })).toBeVisible();
    expect(screen.getByText("Mona Adel")).toBeVisible();
    expect(screen.getByText("Invitation pending")).toBeVisible();
    expect(screen.queryByText("kc-manager")).not.toBeInTheDocument();
  });

  it("groups row actions and separates the destructive one", async () => {
    render(<ProviderOrganizationDetail locale="en" organizationId="org-a" initialTab="people" />);
    fireEvent.click(await screen.findByRole("button", { name: "Actions: Dr Salma Farouk" }));
    const menu = screen.getByRole("menu");
    expect(within(menu).getByRole("menuitem", { name: "Remove from organization" })).toHaveClass("cc-menu-danger");
    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("menu")).not.toBeInTheDocument());
  });

  it("links a practice manager to a consultant with the unchanged relationship key", async () => {
    render(<ProviderOrganizationDetail locale="en" organizationId="org-a" initialTab="people" />);
    fireEvent.click(await screen.findByRole("button", { name: "Actions: Mona Adel" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Add a managed consultant" }));
    fireEvent.change(within(screen.getByRole("dialog")).getByRole("combobox"), { target: { value: "kc-consultant" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(apiFetchAs).toHaveBeenCalledWith("test", "/admin/providers/org-a/relationships", expect.objectContaining({ method: "POST", body: expect.stringContaining("\"type\":\"MANAGES\"") })));
  });
});
