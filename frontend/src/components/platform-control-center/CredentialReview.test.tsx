import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, fireEvent, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { CredentialReview } from "./CredentialReview";
import { apiFetchAs } from "@/lib/api";

const capabilities = ["provider.view", "credential.view", "credential.review", "credential.verify"];
const auth = { user: { access_token: "test", profile: { sub: "coordinator-1" } }, loading: false, signIn: vi.fn() };
vi.mock("@/components/AuthProvider", () => ({ useAuth: () => auth }));
vi.mock("@/lib/api", () => ({ apiFetchAs: vi.fn() }));

const revision = {
  id: "rev-1", dossierId: "dossier-1", organizationId: "org-a", practitionerId: "prac-1", ownerSubject: "dr-owner",
  credentialType: "MEDICAL_LICENSE", revisionNumber: 1, policyVersionId: "policy-1", status: "SUBMITTED", dossierStatus: "OPEN",
  expiresAt: null, submittedBy: "dr-owner", submittedAt: "2026-09-01T00:00:00Z", version: 0, evidenceIds: ["ev-1"],
};
const onboarding = { organizationId: "org-a", practitionerId: "prac-1", clinicianType: "CONSULTANT", status: "DOCUMENTS_SUBMITTED", jurisdiction: "AE", version: 0, ownerSubject: "dr-owner" };

beforeEach(() => {
  auth.user.profile.sub = "coordinator-1";
  vi.mocked(apiFetchAs).mockImplementation(async (_token, path) => {
    if (path.endsWith("/admin/access/me")) return new Response(JSON.stringify(capabilities.map((permission) => ({ permission, allowed: true }))), { status: 200 });
    if (path === "/admin/providers/org-a/credential-reviews/rev-1") return new Response(JSON.stringify(revision), { status: 200 });
    if (path === "/admin/providers/org-a/clinicians/prac-1/onboarding") return new Response(JSON.stringify(onboarding), { status: 200 });
    return new Response(JSON.stringify({}), { status: 200 });
  });
});
afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe("Credential review workspace", () => {
  it("shows the real submitted evidence and lets an independent reviewer start review", async () => {
    render(<CredentialReview locale="en" organizationId="org-a" revisionId="rev-1" />);
    expect(await screen.findByText(/#1/)).toBeVisible();
    expect(screen.getByRole("button", { name: /View document/ })).toBeVisible();
    expect(screen.getByRole("button", { name: "Start review" })).toBeVisible();
  });

  it("disables review actions and shows a clear message when the signed-in user is the credential subject", async () => {
    auth.user.profile.sub = "dr-owner";
    render(<CredentialReview locale="en" organizationId="org-a" revisionId="rev-1" />);
    await screen.findByText(/#1/);
    expect(screen.getByText(/cannot review your own submission/)).toBeVisible();
    expect(screen.queryByRole("button", { name: "Start review" })).not.toBeInTheDocument();
  });

  it("shows a not-found state for a revision the caller cannot access", async () => {
    vi.mocked(apiFetchAs).mockImplementation(async (_token, path) => {
      if (path.endsWith("/admin/access/me")) return new Response(JSON.stringify(capabilities.map((permission) => ({ permission, allowed: true }))), { status: 200 });
      return new Response(null, { status: 404 });
    });
    render(<CredentialReview locale="en" organizationId="org-a" revisionId="missing" />);
    expect(await screen.findByText(/could not be found/)).toBeVisible();
  });

  it("requires a reason before submitting a decision", async () => {
    vi.mocked(apiFetchAs).mockImplementation(async (_token, path) => {
      if (path.endsWith("/admin/access/me")) return new Response(JSON.stringify(capabilities.map((permission) => ({ permission, allowed: true }))), { status: 200 });
      if (path === "/admin/providers/org-a/credential-reviews/rev-1") return new Response(JSON.stringify({ ...revision, status: "UNDER_REVIEW" }), { status: 200 });
      if (path === "/admin/providers/org-a/clinicians/prac-1/onboarding") return new Response(JSON.stringify(onboarding), { status: 200 });
      return new Response(JSON.stringify({}), { status: 200 });
    });
    render(<CredentialReview locale="en" organizationId="org-a" revisionId="rev-1" />);
    const verify = await screen.findByRole("button", { name: "Verify" });
    fireEvent.click(verify);
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent(/reason is required/));
  });
});
