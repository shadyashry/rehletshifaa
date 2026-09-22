import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { CredentialQueue } from "./CredentialQueue";
import { apiFetchAs } from "@/lib/api";

vi.mock("@/components/AuthProvider", () => {
  const auth = { user: { access_token: "test", profile: { sub: "coordinator-1" } }, loading: false, signIn: vi.fn() };
  return { useAuth: () => auth };
});
vi.mock("@/lib/api", () => ({ apiFetchAs: vi.fn() }));

const orgA = { id: "org-a", displayName: "Nile Care Clinic" };
const orgB = { id: "org-b", displayName: "Delta Health Group" };
const revision = {
  id: "rev-1", dossierId: "dossier-1", organizationId: "org-a", practitionerId: "prac-1", ownerSubject: "dr-owner",
  credentialType: "MEDICAL_LICENSE", revisionNumber: 1, policyVersionId: "policy-1", status: "SUBMITTED", dossierStatus: "OPEN",
  expiresAt: null, submittedBy: "dr-owner", submittedAt: "2026-09-01T00:00:00Z", version: 0, evidenceIds: ["ev-1"],
};
const capabilities = ["provider.view", "credential.review"];

beforeEach(() => {
  vi.mocked(apiFetchAs).mockImplementation(async (_token, path) => {
    if (path.endsWith("/admin/access/me")) return new Response(JSON.stringify(capabilities.map((permission) => ({ permission, allowed: true }))), { status: 200 });
    if (path === "/admin/providers") return new Response(JSON.stringify([orgA, orgB]), { status: 200 });
    if (path === "/admin/providers/org-a/credential-reviews") return new Response(JSON.stringify([revision]), { status: 200 });
    if (path === "/admin/providers/org-b/credential-reviews") return new Response(null, { status: 403 });
    return new Response(JSON.stringify({}), { status: 200 });
  });
});
afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe("Credential verification queue", () => {
  it("aggregates the real per-organization queues, silently excluding organizations the caller cannot review", async () => {
    render(<CredentialQueue locale="en" />);
    expect(await screen.findByText("MEDICAL_LICENSE · #1")).toBeVisible();
    expect(screen.getByRole("link", { name: /Review/ })).toBeVisible();
  });

  it("filters by organization", async () => {
    render(<CredentialQueue locale="en" />);
    await screen.findByText("MEDICAL_LICENSE · #1");
    fireEvent.change(screen.getByLabelText("Organization"), { target: { value: "org-b" } });
    expect(screen.getByText("No credentials are awaiting review.")).toBeVisible();
  });

  it("preselects the organization filter from the initialOrg prop", async () => {
    render(<CredentialQueue locale="en" initialOrg="org-b" />);
    await screen.findByRole("status", {}, { timeout: 10 }).catch(() => {});
    expect(await screen.findByText("No credentials are awaiting review.")).toBeVisible();
  });
});
