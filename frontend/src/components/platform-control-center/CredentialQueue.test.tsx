import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { CredentialQueue } from "./CredentialQueue";
import { apiFetchAs } from "@/lib/api";
import { failure, fakeApi, organization, providerDetail } from "./test-support";

const auth = vi.hoisted(() => ({ user: { access_token: "test", profile: { sub: "reviewer" } }, roles: [] as string[], loading: false, signIn: vi.fn() }));
vi.mock("@/components/AuthProvider", () => ({ useAuth: () => auth }));
vi.mock("@/lib/api", () => ({ apiFetchAs: vi.fn() }));

const orgB = { ...organization, id: "org-b", displayName: "Delta Health Group" };
const revision = {
  id: "rev-1", dossierId: "dossier-1", organizationId: "org-a", practitionerId: "prac-1", ownerSubject: "kc-consultant",
  credentialType: "MEDICAL_LICENSE", revisionNumber: 1, policyVersionId: "policy-1", status: "SUBMITTED", dossierStatus: "OPEN",
  expiresAt: null, submittedBy: "kc-consultant", submittedAt: "2026-09-01T00:00:00Z", version: 0, evidenceIds: ["ev-1"],
};
const routes = {
  "/admin/providers": [organization, orgB],
  "/admin/providers/org-a": providerDetail,
  "/admin/providers/org-b": { organization: orgB, members: [], relationships: [] },
  "/admin/providers/org-a/credential-reviews": [revision],
  "/admin/providers/org-b/credential-reviews": failure(403, "ACCESS_DENIED"),
};
beforeEach(() => { auth.roles = []; vi.mocked(apiFetchAs).mockImplementation(fakeApi(routes, ["provider.view", "credential.review"])); });
afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe("Credential review queue", () => {
  it("aggregates the per-organization queues, names the clinician and silently excludes organizations the caller cannot review", async () => {
    render(<CredentialQueue locale="en" />);
    expect(await screen.findByText("Medical licence", { selector: "strong" })).toBeVisible();
    expect(screen.getByText(/Dr Salma Farouk/)).toBeVisible();
    expect(screen.getByText("Awaiting review", { selector: ".cc-status" })).toBeVisible();
    expect(screen.getByRole("link", { name: /Review: Medical licence/ })).toHaveAttribute("href", "/en/portal/control-center/credentials/org-a/rev-1");
    expect(screen.queryByText("kc-consultant")).not.toBeInTheDocument();
  });

  it("filters by organization and shows a meaningful empty state", async () => {
    render(<CredentialQueue locale="en" />);
    await screen.findByText("Medical licence", { selector: "strong" });
    fireEvent.change(screen.getByLabelText("Organization"), { target: { value: "org-b" } });
    expect(screen.getByText("No credentials are waiting for review")).toBeVisible();
    expect(screen.getByText("Change the filters to see more.")).toBeVisible();
  });

  it("preselects the organization filter from the initialOrg prop", async () => {
    render(<CredentialQueue locale="en" initialOrg="org-b" />);
    expect(await screen.findByText("No credentials are waiting for review")).toBeVisible();
  });

  it("offers direct consultant approvals to the current-workflow administrator", async () => {
    auth.roles = ["CREDENTIALING_ADMIN"];
    vi.mocked(apiFetchAs).mockImplementation(fakeApi({ ...routes, "/admin/practitioners": [{ id: "p-9", displayName: "Dr Omar Said", specialty: "Cardiology", careCategory: "cardiology", credentialingStatus: "UNDER_REVIEW", accountStatus: "ACTIVE" }] }, ["provider.view", "credential.review"]));
    render(<CredentialQueue locale="en" initialView="direct" />);
    expect(await screen.findByText("Dr Omar Said")).toBeVisible();
    expect(screen.getByText("Awaiting approval")).toBeVisible();
    expect(screen.getByRole("link", { name: "Review" })).toHaveAttribute("href", "/en/portal/control-center/providers/consultants/direct/p-9?tab=approval");
    expect(screen.getByRole("button", { name: "Provider credentials" })).toHaveAttribute("aria-pressed", "false");
  });
});
