import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { CredentialRequirements } from "./consultant-setup";
import type { AdminApi } from "./admin-api";

vi.mock("@/components/AuthProvider", () => ({ useAuth: () => ({ user: { access_token: "t", profile: { sub: "kc-ops" } }, roles: [], loading: false, signIn: vi.fn() }) }));

const base = "/admin/providers/org-a/clinicians/prac-1";
const days = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString();
const requirements = [
  { type: "MEDICAL_LICENSE", displayName: "Professional medical license", mandatory: true, expiryRequired: true },
  { type: "QUALIFICATION", displayName: "Professional qualification", mandatory: true, expiryRequired: false },
  { type: "IDENTITY_EVIDENCE", displayName: "Identity or professional evidence", mandatory: true, expiryRequired: false },
];
const rev = (id: string, type: string, status: string, extra: Record<string, unknown> = {}) => ({ id, organizationId: "org-a", practitionerId: "prac-1", ownerSubject: "kc-consultant", credentialType: type, revisionNumber: 1, status, dossierStatus: status === "VERIFIED" ? "VERIFIED" : "OPEN", expiresAt: null, submittedBy: "kc-ops", submittedAt: "2026-09-01T00:00:00Z", version: 0, evidenceIds: ["ev"], ...extra });
const detail = (id: string, extra: Record<string, unknown> = {}) => ({
  ...rev(id, "QUALIFICATION", "MORE_INFORMATION_REQUIRED"), submittedFacts: { issuer: "Cairo University", referenceNumber: "MB-778", issuedAt: null, expiresAt: null, jurisdiction: "EG" },
  clinicianName: "Dr Salma Farouk", clinicianType: "CONSULTANT", organizationName: "Nile Care Clinic", submittedByName: "Hany Nabil", reviewerName: null, reviewerView: false,
  evidence: [{ id: "ev", fileName: "degree.pdf", contentType: "application/pdf", sizeBytes: 2048, securityCheck: "CLEAN", checkedAt: null, uploadedByName: "Hany Nabil", uploadedAt: "2026-09-01T00:00:00Z" }],
  history: [
    { event: "MORE_INFORMATION_REQUIRED", revisionNumber: 1, at: "2026-09-10T00:00:00Z", actorName: null, byYou: false, reason: "Upload both pages of the degree certificate" },
    { event: "REVIEW_STARTED", revisionNumber: 1, at: "2026-09-09T00:00:00Z", actorName: null, byYou: false, reason: null },
    { event: "SUBMITTED", revisionNumber: 1, at: "2026-09-01T00:00:00Z", actorName: "Hany Nabil", byYou: true, reason: null },
  ], ...extra,
});
function fakeApi(revisions: unknown[]): AdminApi {
  const routes: Record<string, unknown> = {
    [`${base}/credential-requirements`]: requirements, [`${base}/credentials`]: revisions,
    "/admin/providers/org-a/credential-reviews/q-1": detail("q-1"),
    "/admin/providers/org-a/credential-reviews/l-1": detail("l-1", { credentialType: "MEDICAL_LICENSE", status: "VERIFIED", history: [] }),
  };
  return vi.fn(async (path: string) => routes[path] ?? {}) as unknown as AdminApi;
}
const mixed = [
  rev("l-1", "MEDICAL_LICENSE", "VERIFIED", { expiresAt: days(20) }),
  rev("q-1", "QUALIFICATION", "MORE_INFORMATION_REQUIRED"),
];
afterEach(() => { cleanup(); vi.clearAllMocks(); });
const row = (name: string) => screen.getByRole("heading", { level: 3, name }).closest(".cc-requirement") as HTMLElement;

describe("Clinician credentials section", () => {
  it("summarises progress accurately and never calls the section complete", async () => {
    render(<CredentialRequirements locale="en" api={fakeApi(mixed)} organizationId="org-a" practitionerId="prac-1" canSubmit canReview={false} onChanged={() => {}} />);
    expect(await screen.findByText("1 of 3 verified")).toBeVisible();
    expect(screen.getByText(/1 need more information · 1 not submitted/)).toBeVisible();
    expect(screen.queryByText(/Complete/)).not.toBeInTheDocument();
    expect(within(row("Identity or professional evidence")).getByText("Not submitted", { selector: ".cc-status" })).toBeVisible();
  });

  it("shows validity separately from verification, including expiring soon", async () => {
    render(<CredentialRequirements locale="en" api={fakeApi(mixed)} organizationId="org-a" practitionerId="prac-1" canSubmit={false} canReview={false} onChanged={() => {}} />);
    await screen.findByText("1 of 3 verified");
    const licence = row("Professional medical license");
    expect(within(licence).getByText("Verified", { selector: ".cc-status" })).toBeVisible();
    expect(within(licence).getByText("Expiring soon")).toBeVisible();
    expect(within(licence).getByText(/Expires in (19|20|21) days/)).toBeVisible();
  });

  it("explains More information required with the reviewer's request, who acts and the next action", async () => {
    render(<CredentialRequirements locale="en" api={fakeApi(mixed)} organizationId="org-a" practitionerId="prac-1" canSubmit canReview={false} onChanged={() => {}} />);
    const note = await screen.findByRole("note", { name: "More information required" });
    expect(await within(note).findByText("Upload both pages of the degree certificate")).toBeVisible();
    expect(within(note).getByText("Provider Operations or the clinician")).toBeVisible();
    expect(within(note).getByRole("button", { name: "Submit a new version" })).toBeVisible();
    expect(screen.queryByText("MORE_INFORMATION_REQUIRED")).not.toBeInTheDocument();
  });

  it("shows submitted information, evidence and history under Details, as submitted — not verified", async () => {
    render(<CredentialRequirements locale="en" api={fakeApi(mixed)} organizationId="org-a" practitionerId="prac-1" canSubmit={false} canReview={false} onChanged={() => {}} />);
    await screen.findByText("1 of 3 verified");
    fireEvent.click(within(row("Professional qualification")).getByRole("button", { name: /Show details/ }));
    expect(await screen.findByText("MB-778")).toBeVisible();
    expect(screen.getByText(/This is submitted information — not verified information/)).toBeVisible();
    expect(screen.getByText("degree.pdf")).toBeVisible();
    expect(screen.getByText(/Reviewers' internal notes are not shown here/)).toBeInTheDocument();
  });

  it("shows an expired verified credential as Expired with a new-version action", async () => {
    render(<CredentialRequirements locale="en" api={fakeApi([rev("l-1", "MEDICAL_LICENSE", "VERIFIED", { expiresAt: days(-3) })])} organizationId="org-a" practitionerId="prac-1" canSubmit canReview={false} onChanged={() => {}} />);
    await screen.findByText("0 of 3 verified");
    const licence = row("Professional medical license");
    expect(within(licence).getByText("Expired", { selector: ".cc-status" })).toBeVisible();
    expect(within(licence).queryByText("Verified", { selector: ".cc-status" })).not.toBeInTheDocument();
    expect(within(licence).getByText(/It was independently verified before, but it has expired/)).toBeVisible();
    expect(within(licence).getByRole("button", { name: "Submit a new version" })).toBeVisible();
    expect(screen.queryByRole("button", { name: /renewal/i })).not.toBeInTheDocument();
  });

  it("marks a legacy record as not independently reviewed and never as verified", async () => {
    render(<CredentialRequirements locale="en" api={fakeApi([])} organizationId="org-a" practitionerId="prac-1" canSubmit={false} canReview={false} onChanged={() => {}} legacy />);
    expect(await screen.findByText(/Legacy record — independent review not recorded/)).toBeVisible();
    expect(screen.queryByText("Verified", { selector: ".cc-status" })).not.toBeInTheDocument();
  });

  it("is read-only for the clinician in My credentials, with the practice named as responsible", async () => {
    const api = fakeApi(mixed);
    render(<CredentialRequirements locale="en" api={api} organizationId="org-a" practitionerId="prac-1" canSubmit={false} canReview={false} onChanged={() => {}} audience="self" />);
    const note = await screen.findByRole("note", { name: "More information required" });
    await waitFor(() => expect(within(note).getByText("Upload both pages of the degree certificate")).toBeVisible());
    expect(within(note).getByText(/Your practice's Provider Operations, or you through your practice/)).toBeVisible();
    expect(screen.queryByRole("button", { name: /Submit a new version|Add/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Credential Reviews/ })).not.toBeInTheDocument();
  });
});
