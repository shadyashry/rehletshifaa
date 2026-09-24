import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { CredentialReview } from "./CredentialReview";
import { apiFetchAs } from "@/lib/api";
import { failure, fakeApi } from "./test-support";

const capabilities = ["provider.view", "credential.view", "credential.review", "credential.verify", "credential.reject", "credential.request_information", "credential.suspend"];
const auth = vi.hoisted(() => ({ user: { access_token: "test", profile: { sub: "reviewer-1" } }, roles: [] as string[], loading: false, signIn: vi.fn() }));
vi.mock("@/components/AuthProvider", () => ({ useAuth: () => auth }));
vi.mock("@/lib/api", () => ({ apiFetchAs: vi.fn() }));

const facts = { issuer: "Egyptian Medical Syndicate", referenceNumber: "EMS-12345", issuedAt: "2024-01-10T00:00:00Z", expiresAt: "2030-01-10T12:00:00Z", jurisdiction: "EG" };
const revision = {
  id: "rev-1", dossierId: "dossier-1", organizationId: "org-a", practitionerId: "prac-1", ownerSubject: "kc-consultant",
  credentialType: "MEDICAL_LICENSE", revisionNumber: 1, policyVersionId: "policy-1", status: "SUBMITTED", dossierStatus: "OPEN",
  expiresAt: facts.expiresAt, submittedBy: "kc-ops", submittedAt: "2026-09-01T00:00:00Z", version: 0, evidenceIds: ["ev-1"],
  submittedFacts: facts, reviewedBy: null, reviewedAt: null,
  clinicianName: "Dr Salma Farouk", clinicianType: "CONSULTANT", organizationName: "Nile Care Clinic", submittedByName: "Hany Nabil", reviewerName: null, reviewerView: true,
  evidence: [{ id: "ev-1", fileName: "licence-2026.pdf", contentType: "application/pdf", sizeBytes: 204800, securityCheck: "CLEAN", checkedAt: "2026-09-01T00:00:00Z", uploadedByName: "Hany Nabil", uploadedAt: "2026-09-01T00:00:00Z" }],
  history: [{ event: "SUBMITTED", revisionNumber: 1, at: "2026-09-01T00:00:00Z", actorName: "Hany Nabil", byYou: false, reason: null }],
};
const path = "/admin/providers/org-a/credential-reviews/rev-1";
const decisionPath = `${path}/decision`;
const withRow = (overrides: Record<string, unknown>) => fakeApi({ [path]: { ...revision, ...overrides } }, capabilities);
beforeEach(() => { auth.user.profile.sub = "reviewer-1"; vi.mocked(apiFetchAs).mockImplementation(withRow({})); });
afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe("Credential review", () => {
  it("is structured as clinician, submitted information, evidence, independent review, history and decision", async () => {
    render(<CredentialReview locale="en" organizationId="org-a" revisionId="rev-1" />);
    expect(await screen.findByRole("heading", { level: 1, name: "Medical licence — Dr Salma Farouk" })).toBeVisible();
    for (const name of ["Clinician", "Submitted information", "Evidence", "Independent review", "Decision history", "Decision"]) expect(screen.getByRole("heading", { level: 2, name })).toBeVisible();
    expect(screen.getByRole("link", { name: "Dr Salma Farouk" })).toHaveAttribute("href", "/en/portal/control-center/providers/clinicians/org-a/prac-1?tab=credentials");
    expect(screen.getByText("Consultant")).toBeVisible();
    expect(screen.getByText("Nile Care Clinic", { selector: "bdi" })).toBeVisible();
    expect(screen.queryByText("ev-1")).not.toBeInTheDocument();
  });

  it("presents submitted facts as submitted information, never as verified", async () => {
    render(<CredentialReview locale="en" organizationId="org-a" revisionId="rev-1" />);
    await screen.findByRole("heading", { name: "Submitted information" });
    expect(screen.getByText("EMS-12345")).toBeVisible();
    expect(screen.getByText("Egyptian Medical Syndicate")).toBeVisible();
    expect(screen.getByText(/This is submitted information — not verified information — until an independent reviewer verifies/)).toBeVisible();
    expect(screen.getByText(/Submitted 1 Sept 2026 by Hany Nabil|Submitted 1 Sep 2026 by Hany Nabil/)).toBeVisible();
    expect(screen.queryByText("Verified")).not.toBeInTheDocument();
    expect(screen.getAllByText("Submitted", { selector: ".cc-status" }).length).toBeGreaterThan(0);
  });

  it("describes evidence as an attached, scanned document — distinct from verification — with a descriptive view action", async () => {
    render(<CredentialReview locale="en" organizationId="org-a" revisionId="rev-1" />);
    expect(await screen.findByText("licence-2026.pdf")).toBeVisible();
    expect(screen.getByText(/Evidence submitted: the document is attached and passed the security scan. Checking what it shows is part of the independent review./)).toBeVisible();
    expect(screen.getByRole("button", { name: "View document: licence-2026.pdf" })).toBeVisible();
    expect(screen.getByText(/does not record a separate verification source or external reference/)).toBeVisible();
  });

  it("says plainly when a submitted fact is missing or the facts cannot be shown", async () => {
    vi.mocked(apiFetchAs).mockImplementation(withRow({ expiresAt: null, submittedFacts: { issuer: "Authority", referenceNumber: null, issuedAt: null, expiresAt: null, jurisdiction: "EG" } }));
    render(<CredentialReview locale="en" organizationId="org-a" revisionId="rev-1" />);
    expect(await screen.findAllByText("Not provided")).toHaveLength(2);
    expect(screen.getByText("No expiry date declared")).toBeVisible();
    cleanup();
    vi.mocked(apiFetchAs).mockImplementation(withRow({ submittedFacts: null }));
    render(<CredentialReview locale="en" organizationId="org-a" revisionId="rev-1" />);
    expect(await screen.findByText(/couldn't be shown. Don't verify it/)).toBeVisible();
  });

  it("offers Start review as assignment, not verification", async () => {
    let state = "SUBMITTED";
    vi.mocked(apiFetchAs).mockImplementation(fakeApi({ [path]: () => ({ ...revision, status: state, reviewedBy: state === "UNDER_REVIEW" ? "reviewer-1" : null }), [`POST ${decisionPath}`]: () => { state = "UNDER_REVIEW"; return { ...revision, status: state }; } }, capabilities));
    render(<CredentialReview locale="en" organizationId="org-a" revisionId="rev-1" />);
    expect(await screen.findByText("Starting the review assigns it to you. It does not verify the credential.")).toBeVisible();
    expect(screen.queryByRole("button", { name: /Verify/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Start review" }));
    await waitFor(() => expect(apiFetchAs).toHaveBeenCalledWith("test", decisionPath, expect.objectContaining({ body: expect.stringContaining("\"decision\":\"START_REVIEW\"") })));
    expect(await screen.findByText("Decision recorded. Status is now: Under review.")).toBeVisible();
    await waitFor(() => expect(screen.getByText("You")).toBeVisible());
  });

  it("verifies only after a consequence-aware confirmation with a required basis, then moves focus to the resulting status", async () => {
    let state = "UNDER_REVIEW";
    vi.mocked(apiFetchAs).mockImplementation(fakeApi({ [path]: () => ({ ...revision, status: state, dossierStatus: state === "VERIFIED" ? "VERIFIED" : "OPEN" }), [`POST ${decisionPath}`]: () => { state = "VERIFIED"; return { ...revision, status: state }; } }, capabilities));
    render(<CredentialReview locale="en" organizationId="org-a" revisionId="rev-1" />);
    fireEvent.click(await screen.findByRole("button", { name: "Verify…" }));
    const panel = screen.getByRole("group", { name: "Verify this credential?" });
    expect(within(panel).getByText(/This may satisfy one of the clinician's readiness requirements. It does not by itself make the clinician eligible for cases./)).toBeVisible();
    expect(screen.queryByText(/will now receive cases/)).not.toBeInTheDocument();
    fireEvent.click(within(panel).getByRole("button", { name: "Verify credential" }));
    const summary = await screen.findByText("There is a problem");
    expect(summary.closest(".cc-error-summary")).toHaveFocus();
    expect(within(panel).getByRole("link", { name: "Enter the basis for verification." })).toHaveAttribute("href", "#decision-reason");
    expect(apiFetchAs).not.toHaveBeenCalledWith("test", decisionPath, expect.anything());
    fireEvent.change(within(panel).getByLabelText(/Basis for verification/), { target: { value: "Checked against the syndicate register" } });
    fireEvent.click(within(panel).getByRole("button", { name: "Verify credential" }));
    await waitFor(() => expect(apiFetchAs).toHaveBeenCalledWith("test", decisionPath, expect.objectContaining({ method: "POST", headers: expect.objectContaining({ "Idempotency-Key": expect.any(String) }), body: expect.stringContaining("\"decision\":\"VERIFY\"") })));
    expect(await screen.findByText("Decision recorded. Status is now: Verified.")).toBeVisible();
    await waitFor(() => expect(document.querySelector(".cc-review-status")).toHaveFocus());
  });

  it("makes Request more information a first-class outcome whose request text is addressed to the provider team", async () => {
    vi.mocked(apiFetchAs).mockImplementation(fakeApi({ [path]: { ...revision, status: "UNDER_REVIEW" }, [`POST ${decisionPath}`]: { ...revision, status: "MORE_INFORMATION_REQUIRED" } }, capabilities));
    render(<CredentialReview locale="en" organizationId="org-a" revisionId="rev-1" />);
    fireEvent.click(await screen.findByRole("button", { name: "Request more information…" }));
    const panel = screen.getByRole("group", { name: "Request more information" });
    expect(within(panel).getByText(/Shown to the provider team and the clinician as your request/)).toBeVisible();
    fireEvent.change(within(panel).getByLabelText(/What is needed/), { target: { value: "Upload the page with the current expiry date" } });
    fireEvent.click(within(panel).getByRole("button", { name: "Send request" }));
    await waitFor(() => expect(apiFetchAs).toHaveBeenCalledWith("test", decisionPath, expect.objectContaining({ body: expect.stringContaining("\"decision\":\"REQUEST_INFORMATION\"") })));
  });

  it("keeps Reject separate from a missing-information request and confirms before sending", async () => {
    vi.mocked(apiFetchAs).mockImplementation(fakeApi({ [path]: { ...revision, status: "UNDER_REVIEW" }, [`POST ${decisionPath}`]: { ...revision, status: "REJECTED" } }, capabilities));
    render(<CredentialReview locale="en" organizationId="org-a" revisionId="rev-1" />);
    const reject = await screen.findByRole("button", { name: "Reject…" });
    expect(reject).toHaveClass("cc-danger-button");
    fireEvent.click(reject);
    const panel = screen.getByRole("group", { name: "Reject this credential?" });
    expect(within(panel).getByText(/This is not a request for missing information/)).toBeVisible();
    expect(apiFetchAs).not.toHaveBeenCalledWith("test", decisionPath, expect.anything());
    fireEvent.change(within(panel).getByLabelText(/Reason for rejection/), { target: { value: "Not a medical licence" } });
    fireEvent.click(within(panel).getByRole("button", { name: "Reject credential" }));
    await waitFor(() => expect(apiFetchAs).toHaveBeenCalledWith("test", decisionPath, expect.objectContaining({ body: expect.stringContaining("\"decision\":\"REJECT\"") })));
  });

  it("explains More information required: what was requested, who provides it and how the review resumes", async () => {
    vi.mocked(apiFetchAs).mockImplementation(withRow({ status: "MORE_INFORMATION_REQUIRED", reviewedBy: "reviewer-2", reviewerName: "Rana Aziz", history: [
      { event: "MORE_INFORMATION_REQUIRED", revisionNumber: 1, at: "2026-09-10T00:00:00Z", actorName: "Rana Aziz", byYou: false, reason: "Updated licence showing the current expiry date" },
      { event: "REVIEW_STARTED", revisionNumber: 1, at: "2026-09-09T00:00:00Z", actorName: "Rana Aziz", byYou: false, reason: null },
      ...revision.history] }));
    render(<CredentialReview locale="en" organizationId="org-a" revisionId="rev-1" />);
    const note = await screen.findByRole("note", { name: "More information required" });
    expect(within(note).getByText("Updated licence showing the current expiry date")).toBeVisible();
    expect(within(note).getByText("Provider Operations or the clinician")).toBeVisible();
    expect(within(note).getByText(/The review resumes when a new version of this credential is submitted/)).toBeVisible();
    expect(screen.getByText(/No decision now: the review is waiting for a new version/)).toBeVisible();
    expect(screen.queryByText("MORE_INFORMATION_REQUIRED")).not.toBeVisible();
  });

  it("shows decision history under disclosure with reviewer names and reasons for reviewers", async () => {
    vi.mocked(apiFetchAs).mockImplementation(withRow({ status: "REJECTED", reviewedBy: "reviewer-2", reviewerName: "Rana Aziz", reviewedAt: "2026-09-12T00:00:00Z", history: [
      { event: "REJECTED", revisionNumber: 1, at: "2026-09-12T00:00:00Z", actorName: "Rana Aziz", byYou: false, reason: "Document is not a licence" }, ...revision.history] }));
    render(<CredentialReview locale="en" organizationId="org-a" revisionId="rev-1" />);
    const history = (await screen.findByText("History (2)")).closest("details")!;
    expect(history).not.toHaveAttribute("open");
    expect(within(history).getByText("Rejected")).toBeInTheDocument();
    expect(within(history).getByText("Document is not a licence")).toBeInTheDocument();
    expect(screen.getByText(/The provider team can submit a new version/)).toBeVisible();
    expect(screen.getAllByText("Rana Aziz", { selector: "bdi" })[0]).toBeVisible();
  });

  it("shows a suspended credential with its separate-control explanation and a confirmed restore", async () => {
    vi.mocked(apiFetchAs).mockImplementation(fakeApi({ [path]: { ...revision, status: "SUSPENDED", dossierStatus: "SUSPENDED" }, [`POST ${decisionPath}`]: { ...revision, status: "VERIFIED" } }, capabilities));
    render(<CredentialReview locale="en" organizationId="org-a" revisionId="rev-1" />);
    expect(await screen.findByText(/The suspension applies to this credential only/)).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Restore credential…" }));
    expect(screen.getByText(/the clinician is not activated automatically/)).toBeVisible();
  });

  it("blocks self-review and submitter review with a clear message", async () => {
    auth.user.profile.sub = "kc-consultant";
    render(<CredentialReview locale="en" organizationId="org-a" revisionId="rev-1" />);
    expect(await screen.findByText(/cannot review your own submission/)).toBeVisible();
    expect(screen.queryByRole("button", { name: "Start review" })).not.toBeInTheDocument();
    cleanup();
    auth.user.profile.sub = "kc-ops";
    render(<CredentialReview locale="en" organizationId="org-a" revisionId="rev-1" />);
    expect(await screen.findByText(/An independent reviewer must review it/)).toBeVisible();
  });

  it("offers no decision to someone without the review capability (for example Provider Operations)", async () => {
    auth.user.profile.sub = "someone-else";
    vi.mocked(apiFetchAs).mockImplementation(fakeApi({ [path]: { ...revision, status: "UNDER_REVIEW", reviewerView: false } }, ["provider.view", "credential.view", "credential.submit"]));
    render(<CredentialReview locale="en" organizationId="org-a" revisionId="rev-1" />);
    expect(await screen.findByText("There is no decision available to you at this stage.")).toBeVisible();
    expect(screen.queryByRole("button", { name: /Verify|Reject|Request more information/ })).not.toBeInTheDocument();
  });

  it("shows a verified credential past its expiry date as expired, keeping its verification in the history", async () => {
    vi.mocked(apiFetchAs).mockImplementation(withRow({ status: "VERIFIED", dossierStatus: "VERIFIED", expiresAt: "2025-01-01T12:00:00Z", submittedFacts: { ...facts, expiresAt: "2025-01-01T12:00:00Z" }, history: [
      { event: "VERIFIED", revisionNumber: 1, at: "2024-02-01T00:00:00Z", actorName: "Rana Aziz", byYou: false, reason: "Register checked" }, ...revision.history] }));
    render(<CredentialReview locale="en" organizationId="org-a" revisionId="rev-1" />);
    expect((await screen.findAllByText("Expired", { selector: ".cc-status" })).length).toBeGreaterThan(0);
    expect(screen.queryByText("Verified", { selector: ".cc-status" })).not.toBeInTheDocument();
    expect(screen.getByText(/It was independently verified, but its expiry date has passed/)).toBeVisible();
    expect(screen.getAllByText("Verified by an independent reviewer").length).toBeGreaterThan(0);
  });

  it("shows a not-found state for a revision the caller cannot access", async () => {
    vi.mocked(apiFetchAs).mockImplementation(fakeApi({ "/admin/providers/org-a/credential-reviews/missing": failure(404, "NOT_FOUND") }, capabilities));
    render(<CredentialReview locale="en" organizationId="org-a" revisionId="missing" />);
    expect(await screen.findByText(/could not be found/)).toBeVisible();
  });

  it("renders Arabic with isolated licence numbers and names", async () => {
    render(<CredentialReview locale="ar" organizationId="org-a" revisionId="rev-1" />);
    expect(await screen.findByRole("heading", { name: "المعلومات المقدَّمة" })).toBeVisible();
    const reference = screen.getByText("EMS-12345");
    expect(reference.tagName).toBe("BDI");
    expect(reference).toHaveAttribute("dir", "ltr");
    expect(screen.getByText("licence-2026.pdf").tagName).toBe("BDI");
  });
});
