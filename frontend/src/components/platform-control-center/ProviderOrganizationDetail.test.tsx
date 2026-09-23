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
    expect(await screen.findByRole("link", { name: "Dr Salma Farouk" })).toHaveAttribute("href", "/en/portal/control-center/providers/clinicians/org-a/prac-1");
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

describe("Organization activation is truthful (UX-0 Decision D)", () => {
  const commercialOnly = readiness({ clinicianProfileComplete: true, requiredCredentialsSubmitted: true, requiredCredentialsVerified: true, mandatoryCredentialsUnexpired: true, pricingSetupComplete: true, availabilitySetupComplete: true, credentialReady: true, blockers: [{ code: "COMMERCIAL_ACCEPTANCE_MISSING", message: "Required commercial or legal acceptance is missing." }] });
  const ready = readiness({ clinicianProfileComplete: true, requiredCredentialsSubmitted: true, requiredCredentialsVerified: true, mandatoryCredentialsUnexpired: true, pricingSetupComplete: true, availabilitySetupComplete: true, credentialReady: true, blockers: [], readyForActivation: true });

  it("shows 'Activation isn't available yet' with the approved copy and no activate button when acceptance is not in this release", async () => {
    vi.mocked(apiFetchAs).mockImplementation(fakeApi({ "/admin/providers/org-a": providerDetail, "/admin/providers/org-a/clinicians/prac-1/readiness": commercialOnly }, caps));
    render(<ProviderOrganizationDetail locale="en" organizationId="org-a" initialTab="setup" />);
    expect(await screen.findByText("Activation isn't available yet")).toBeVisible();
    expect(screen.getByText("Commercial & Legal Acceptance must be completed before this organization can receive cases. That step isn't available in the current release. You can complete the remaining setup now. No cases will be routed to this organization until activation becomes available.")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Activate organization" })).not.toBeInTheDocument();
    expect(screen.getByText("Not available yet")).toBeVisible();
  });

  it("shows a disabled Activate with exactly what it is waiting for while achievable prerequisites remain", async () => {
    render(<ProviderOrganizationDetail locale="en" organizationId="org-a" initialTab="setup" />);
    expect(await screen.findByRole("button", { name: "Activate organization" })).toBeDisabled();
    expect(screen.getByText("Not ready to activate")).toBeVisible();
    expect(screen.getByText("At least one clinician who is ready to activate")).toBeVisible();
  });

  it("offers real activation, with a consequence-aware confirmation, only when the backend reports a ready clinician", async () => {
    vi.mocked(apiFetchAs).mockImplementation(fakeApi({ "/admin/providers/org-a": providerDetail, "/admin/providers/org-a/clinicians/prac-1/readiness": ready, "POST /admin/providers/org-a/activate?version=3": { organizationId: "org-a", status: "ACTIVE" } }, caps));
    render(<ProviderOrganizationDetail locale="en" organizationId="org-a" initialTab="setup" />);
    fireEvent.click(await screen.findByRole("button", { name: "Activate organization" }));
    expect(screen.getByText(/Once active, the organization can receive cases/)).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Yes, activate" }));
    await waitFor(() => expect(apiFetchAs).toHaveBeenCalledWith("test", "/admin/providers/org-a/activate?version=3", expect.objectContaining({ method: "POST" })));
  });

  it("hides the activate control from someone who can't activate", async () => {
    vi.mocked(apiFetchAs).mockImplementation(fakeApi({ "/admin/providers/org-a": providerDetail, "/admin/providers/org-a/clinicians/prac-1/readiness": ready }, caps.filter((c) => c !== "provider.activate")));
    render(<ProviderOrganizationDetail locale="en" organizationId="org-a" initialTab="setup" />);
    expect(await screen.findByText(/A provider operations manager activates the organization/)).toBeVisible();
    expect(screen.queryByRole("button", { name: "Activate organization" })).not.toBeInTheDocument();
  });
});
