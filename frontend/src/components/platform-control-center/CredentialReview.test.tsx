import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, fireEvent, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { CredentialReview } from "./CredentialReview";
import { apiFetchAs } from "@/lib/api";
import { failure, fakeApi, onboarding, providerDetail } from "./test-support";

const capabilities = ["provider.view", "credential.view", "credential.review", "credential.verify", "credential.reject", "credential.request_information"];
const auth = vi.hoisted(() => ({ user: { access_token: "test", profile: { sub: "reviewer-1" } }, roles: [] as string[], loading: false, signIn: vi.fn() }));
vi.mock("@/components/AuthProvider", () => ({ useAuth: () => auth }));
vi.mock("@/lib/api", () => ({ apiFetchAs: vi.fn() }));

const revision = {
  id: "rev-1", dossierId: "dossier-1", organizationId: "org-a", practitionerId: "prac-1", ownerSubject: "kc-consultant",
  credentialType: "MEDICAL_LICENSE", revisionNumber: 1, policyVersionId: "policy-1", status: "SUBMITTED", dossierStatus: "OPEN",
  expiresAt: null, submittedBy: "kc-consultant", submittedAt: "2026-09-01T00:00:00Z", version: 0, evidenceIds: ["ev-1"],
};
const routes = (status = "SUBMITTED") => ({
  "/admin/providers/org-a/credential-reviews/rev-1": { ...revision, status },
  "/admin/providers/org-a/clinicians/prac-1/onboarding": onboarding,
  "/admin/providers/org-a": providerDetail,
});
beforeEach(() => { auth.user.profile.sub = "reviewer-1"; vi.mocked(apiFetchAs).mockImplementation(fakeApi(routes(), capabilities)); });
afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe("Credential review", () => {
  it("names the credential and the clinician, shows the evidence and offers one primary action", async () => {
    render(<CredentialReview locale="en" organizationId="org-a" revisionId="rev-1" />);
    expect(await screen.findByRole("heading", { level: 1, name: "Medical licence — Dr Salma Farouk" })).toBeVisible();
    expect(screen.getByText("Submitted", { selector: ".cc-status" })).toBeVisible();
    expect(screen.getByRole("button", { name: /View document/ })).toBeVisible();
    expect(screen.getByRole("button", { name: "Start review" })).toBeVisible();
    expect(screen.queryByText("ev-1")).not.toBeInTheDocument();
  });

  it("blocks self-review with a clear message", async () => {
    auth.user.profile.sub = "kc-consultant";
    render(<CredentialReview locale="en" organizationId="org-a" revisionId="rev-1" />);
    expect(await screen.findByText(/cannot review your own submission/)).toBeVisible();
    expect(screen.queryByRole("button", { name: "Start review" })).not.toBeInTheDocument();
  });

  it("shows a not-found state for a revision the caller cannot access", async () => {
    vi.mocked(apiFetchAs).mockImplementation(fakeApi({ "/admin/providers/org-a/credential-reviews/missing": failure(404, "NOT_FOUND") }, capabilities));
    render(<CredentialReview locale="en" organizationId="org-a" revisionId="missing" />);
    expect(await screen.findByText(/could not be found/)).toBeVisible();
  });

  it("requires a reason, keeps Reject visually separate, and records the decision with an idempotency key", async () => {
    let state = "UNDER_REVIEW";
    vi.mocked(apiFetchAs).mockImplementation(fakeApi({ ...routes(), "/admin/providers/org-a/credential-reviews/rev-1": () => ({ ...revision, status: state }), "POST /admin/providers/org-a/credential-reviews/rev-1/decision": () => { state = "VERIFIED"; return { ...revision, status: state }; } }, capabilities));
    render(<CredentialReview locale="en" organizationId="org-a" revisionId="rev-1" />);
    const verify = await screen.findByRole("button", { name: "Verify credential" });
    expect(screen.getByRole("button", { name: "Reject…" })).toHaveClass("cc-danger-button");
    fireEvent.click(verify);
    expect(await screen.findByText("A reason is required for this decision.")).toBeVisible();
    fireEvent.change(screen.getByLabelText(/Reason for your decision/), { target: { value: "Licence checked with the issuing authority" } });
    fireEvent.click(verify);
    await waitFor(() => expect(apiFetchAs).toHaveBeenCalledWith("test", "/admin/providers/org-a/credential-reviews/rev-1/decision", expect.objectContaining({ method: "POST", headers: expect.objectContaining({ "Idempotency-Key": expect.any(String) }) })));
    expect(await screen.findByText("Decision recorded.")).toBeVisible();
    expect(await screen.findByText("Verified")).toBeVisible();
  });

  it("separates the submitted facts from the evidence and the independent decision, and never calls them verified", async () => {
    const facts = { issuer: "Egyptian Medical Syndicate", referenceNumber: "EMS-12345", issuedAt: "2024-01-10T00:00:00Z", expiresAt: "2030-01-10T00:00:00Z", jurisdiction: "EG" };
    vi.mocked(apiFetchAs).mockImplementation(fakeApi({ ...routes(), "/admin/providers/org-a/credential-reviews/rev-1": { ...revision, expiresAt: facts.expiresAt, submittedFacts: facts, reviewedBy: null, reviewedAt: null } }, capabilities));
    render(<CredentialReview locale="en" organizationId="org-a" revisionId="rev-1" />);
    expect(await screen.findByRole("heading", { name: "Submitted facts" })).toBeVisible();
    expect(screen.getByText("EMS-12345")).toBeVisible();
    expect(screen.getByText("Egyptian Medical Syndicate")).toBeVisible();
    expect(screen.getByText(/doesn't mean they have been verified/)).toBeVisible();
    expect(screen.getByRole("heading", { name: "Evidence documents" })).toBeVisible();
    expect(screen.getByRole("heading", { name: "Independent review decision" })).toBeVisible();
    expect(screen.getByText("No decision yet.")).toBeVisible();
    expect(screen.queryByText("Verified")).not.toBeInTheDocument();
  });

  it("says plainly when a submitted fact is missing or the facts cannot be shown, instead of inventing them", async () => {
    vi.mocked(apiFetchAs).mockImplementation(fakeApi({ ...routes(), "/admin/providers/org-a/credential-reviews/rev-1": { ...revision, submittedFacts: { issuer: "Authority", referenceNumber: null, issuedAt: null, expiresAt: null, jurisdiction: "EG" } } }, capabilities));
    render(<CredentialReview locale="en" organizationId="org-a" revisionId="rev-1" />);
    expect(await screen.findAllByText("Not provided")).toHaveLength(2);
    expect(screen.getByText("No expiry declared")).toBeVisible();
    cleanup();
    vi.mocked(apiFetchAs).mockImplementation(fakeApi(routes(), capabilities));
    render(<CredentialReview locale="en" organizationId="org-a" revisionId="rev-1" />);
    expect(await screen.findByText(/couldn't be shown. Don't verify it/)).toBeVisible();
  });

  it("asks for a consequence-aware confirmation before rejecting, and sends nothing until confirmed", async () => {
    vi.mocked(apiFetchAs).mockImplementation(fakeApi({ ...routes("UNDER_REVIEW"), "POST /admin/providers/org-a/credential-reviews/rev-1/decision": { ...revision, status: "REJECTED" } }, capabilities));
    render(<CredentialReview locale="en" organizationId="org-a" revisionId="rev-1" />);
    fireEvent.change(await screen.findByLabelText(/Reason for your decision/), { target: { value: "Illegible licence" } });
    fireEvent.click(screen.getByRole("button", { name: "Reject…" }));
    expect(screen.getByText(/can't become ready until an acceptable version is verified/)).toBeVisible();
    expect(apiFetchAs).not.toHaveBeenCalledWith("test", "/admin/providers/org-a/credential-reviews/rev-1/decision", expect.anything());
    fireEvent.click(screen.getByRole("button", { name: "Yes, reject" }));
    await waitFor(() => expect(apiFetchAs).toHaveBeenCalledWith("test", "/admin/providers/org-a/credential-reviews/rev-1/decision", expect.objectContaining({ method: "POST", body: expect.stringContaining("\"decision\":\"REJECT\"") })));
  });

  it("shows a verified credential past its expiry date as expired, not verified", async () => {
    vi.mocked(apiFetchAs).mockImplementation(fakeApi({ ...routes(), "/admin/providers/org-a/credential-reviews/rev-1": { ...revision, status: "VERIFIED", expiresAt: "2025-01-01T00:00:00Z", submittedFacts: { issuer: "A", referenceNumber: "R", issuedAt: null, expiresAt: "2025-01-01T00:00:00Z", jurisdiction: "EG" } } }, capabilities));
    render(<CredentialReview locale="en" organizationId="org-a" revisionId="rev-1" />);
    expect((await screen.findAllByText("Expired")).length).toBeGreaterThan(0);
    expect(screen.queryByText("Verified")).not.toBeInTheDocument();
  });
});
