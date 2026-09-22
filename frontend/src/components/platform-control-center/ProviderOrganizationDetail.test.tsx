import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { ProviderOrganizationDetail } from "./ProviderOrganizationDetail";
import { apiFetchAs } from "@/lib/api";

vi.mock("@/components/AuthProvider", () => {
  const auth = { user: { access_token: "test", profile: { sub: "owner" } }, loading: false, signIn: vi.fn() };
  return { useAuth: () => auth };
});
vi.mock("@/lib/api", () => ({ apiFetchAs: vi.fn() }));

const organization = { id: "org-a", legalName: "Nile Care LLC", businessName: "Nile Care", displayName: "Nile Care Clinic", type: "CLINIC", status: "ONBOARDING", countryCode: "EG", timeZone: "Africa/Cairo", defaultCurrency: "EGP", legacyMappingStatus: "REVIEWED", version: 0 };
const owner = { subject: "dr-owner", kind: "PRACTICE_STAFF" as const, practitionerId: null, status: "ACTIVE", effectiveFrom: "2026-01-01T00:00:00Z", effectiveTo: null, invitationStatus: "ACTIVE", revision: 0, roles: ["ORGANIZATION_OWNER"] };
const consultant = { subject: "dr-consultant", kind: "CLINICIAN" as const, practitionerId: "prac-1", status: "ACTIVE", effectiveFrom: "2026-01-01T00:00:00Z", effectiveTo: null, invitationStatus: "ACTIVE", revision: 0, roles: ["CONSULTANT"] };
const detail = { organization, members: [owner, consultant], relationships: [] };
const readiness = {
  identityProvisioned: true, organizationMembershipActive: true, providerProfileComplete: true, clinicianProfileComplete: true,
  requiredCredentialsSubmitted: true, requiredCredentialsVerified: false, mandatoryCredentialsUnexpired: true, requiredRelationshipsComplete: true,
  pricingSetupRequired: true, pricingSetupComplete: false, availabilitySetupRequired: true, availabilitySetupComplete: false,
  credentialReady: false, blockers: [{ code: "CREDENTIAL_AWAITING_VERIFICATION", message: "Medical license is awaiting verification." }],
  readyForActivation: false, evaluatedAt: "2026-09-22T00:00:00Z",
};
const onboarding = { organizationId: "org-a", practitionerId: "prac-1", clinicianType: "CONSULTANT", status: "DOCUMENTS_SUBMITTED", jurisdiction: "AE", version: 0, ownerSubject: "dr-consultant" };

beforeEach(() => {
  vi.mocked(apiFetchAs).mockImplementation(async (_token, path) => {
    if (path.endsWith("/admin/access/me")) return new Response(JSON.stringify(["provider.view", "provider.activate"].map((permission) => ({ permission, allowed: true }))), { status: 200 });
    if (path === "/admin/providers/org-a") return new Response(JSON.stringify(detail), { status: 200 });
    if (path === "/admin/providers/org-a/clinicians/prac-1/onboarding") return new Response(JSON.stringify(onboarding), { status: 200 });
    if (path === "/admin/providers/org-a/clinicians/prac-1/readiness") return new Response(JSON.stringify(readiness), { status: 200 });
    return new Response(JSON.stringify({}), { status: 200 });
  });
});
afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe("Guided provider onboarding", () => {
  it("shows the real backend readiness blocker count and links straight to the filtered credential queue", async () => {
    render(<ProviderOrganizationDetail locale="en" organizationId="org-a" />);
    fireEvent.click(await screen.findByRole("button", { name: "Onboarding & readiness" }));
    expect(await screen.findByText("1 credential needs review")).toBeVisible();
    const link = screen.getByRole("link", { name: /Review in credential queue/ });
    expect(link).toHaveAttribute("href", "/en/portal/control-center/credentials?org=org-a");
  });

  it("never claims activation readiness itself; it only renders the backend's own decision", async () => {
    render(<ProviderOrganizationDetail locale="en" organizationId="org-a" />);
    fireEvent.click(await screen.findByRole("button", { name: "Onboarding & readiness" }));
    await screen.findByText("1 credential needs review");
    expect(screen.getByRole("button", { name: /Activate provider organization/ })).toBeInTheDocument();
  });
});
