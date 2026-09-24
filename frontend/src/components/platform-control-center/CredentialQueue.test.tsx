import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { CredentialQueue } from "./CredentialQueue";
import { apiFetchAs } from "@/lib/api";
import { failure, fakeApi } from "./test-support";

const auth = vi.hoisted(() => ({ user: { access_token: "test", profile: { sub: "reviewer" } }, roles: [] as string[], loading: false, signIn: vi.fn() }));
vi.mock("@/components/AuthProvider", () => ({ useAuth: () => auth }));
vi.mock("@/lib/api", () => ({ apiFetchAs: vi.fn() }));

const days = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString();
const row = (overrides: Record<string, unknown>) => ({
  id: "rev-1", organizationId: "org-a", organizationName: "Nile Care Clinic", practitionerId: "prac-1", clinicianName: "Dr Salma Farouk", clinicianType: "CONSULTANT",
  credentialType: "MEDICAL_LICENSE", revisionNumber: 1, status: "SUBMITTED", dossierStatus: "OPEN", jurisdiction: "EG", expiresAt: days(400), submittedAt: "2026-09-01T00:00:00Z",
  reviewedBy: null, reviewerName: null, reviewedAt: null, evidenceCount: 1, ...overrides,
});
const open = [
  row({}),
  row({ id: "rev-2", organizationId: "org-b", organizationName: "Delta Health Group", practitionerId: "prac-2", clinicianName: "Dr Omar Nabil", clinicianType: "ASSOCIATE_DOCTOR", credentialType: "QUALIFICATION", expiresAt: days(20) }),
  row({ id: "rev-3", status: "UNDER_REVIEW", clinicianName: "Dr Mai Hassan", reviewedBy: "reviewer", reviewedAt: "2026-09-05T00:00:00Z" }),
  row({ id: "rev-4", status: "UNDER_REVIEW", clinicianName: "Dr Ali Kamal", reviewedBy: "reviewer-2", reviewerName: "Rana Aziz", reviewedAt: "2026-09-05T00:00:00Z" }),
  row({ id: "rev-5", status: "MORE_INFORMATION_REQUIRED", clinicianName: "Dr Nour Saad", credentialType: "IDENTITY_EVIDENCE", expiresAt: null, reviewedBy: "reviewer-2", reviewerName: "Rana Aziz" }),
];
const completed = [row({ id: "rev-9", status: "VERIFIED", dossierStatus: "VERIFIED", clinicianName: "Dr Hoda Samir", reviewedBy: "reviewer", reviewedAt: "2026-09-02T00:00:00Z" })];
const routes = { "/admin/providers/credential-reviews": open, "/admin/providers/credential-reviews?view=completed": completed };
beforeEach(() => { auth.roles = []; vi.mocked(apiFetchAs).mockImplementation(fakeApi(routes, ["provider.view", "credential.review"])); });
afterEach(() => { cleanup(); vi.clearAllMocks(); });
const queue = () => screen.getByRole("list", { name: /Needs review|In review|More information required|Completed/ });

describe("Credential review queue", () => {
  it("answers what requires review: groups with counts from one cross-organization read, named people, no identifiers", async () => {
    render(<CredentialQueue locale="en" />);
    expect(await screen.findByRole("button", { name: "Needs review 2" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "In review 2" })).toBeVisible();
    expect(screen.getByRole("button", { name: "More information required 1" })).toBeVisible();
    const list = queue();
    expect(within(list).getByText("Dr Salma Farouk")).toBeVisible();
    expect(within(list).getByText("Delta Health Group")).toBeVisible();
    expect(within(list).getByText("Professional qualification")).toBeVisible();
    expect(within(list).getAllByText("Egypt").length).toBeGreaterThan(0);
    expect(within(list).getByRole("link", { name: "Open review: Medical licence — Dr Salma Farouk" })).toHaveAttribute("href", "/en/portal/control-center/credentials/org-a/rev-1");
    expect(screen.queryByText("rev-1")).not.toBeInTheDocument();
    expect(vi.mocked(apiFetchAs).mock.calls.filter(([, p]) => String(p).includes("credential-reviews")).map(([, p]) => p)).toEqual(["/admin/providers/credential-reviews"]);
  });

  it("shows expiry before it becomes a surprise", async () => {
    render(<CredentialQueue locale="en" />);
    const list = await screen.findByRole("list", { name: "Needs review" });
    expect(within(list).getByText("Expiring soon")).toBeVisible();
    expect(within(list).getByText(/Expires in (19|20|21) days/)).toBeVisible();
    fireEvent.change(screen.getByLabelText("Expiry"), { target: { value: "expiring" } });
    expect(within(queue()).queryByText("Dr Salma Farouk")).not.toBeInTheDocument();
    expect(within(queue()).getByText("Dr Omar Nabil")).toBeVisible();
  });

  it("separates review ownership from the decision and filters to my reviews", async () => {
    render(<CredentialQueue locale="en" />);
    fireEvent.click(await screen.findByRole("button", { name: "In review 2" }));
    const list = queue();
    expect(within(list).getByText("Review started by you")).toBeVisible();
    expect(within(list).getByText("Review started by Rana Aziz")).toBeVisible();
    expect(within(list).getAllByText("Under review", { selector: ".cc-status" })).toHaveLength(2);
    fireEvent.click(screen.getByLabelText("Only reviews assigned to me"));
    expect(within(queue()).queryByText("Dr Ali Kamal")).not.toBeInTheDocument();
    expect(within(queue()).getByText("Dr Mai Hassan")).toBeVisible();
  });

  it("explains that More information required waits for the provider side", async () => {
    render(<CredentialQueue locale="en" />);
    fireEvent.click(await screen.findByRole("button", { name: "More information required 1" }));
    expect(screen.getByText(/Waiting for a new version from Provider Operations or the clinician/)).toBeVisible();
    expect(within(queue()).getByText("Requested by Rana Aziz")).toBeVisible();
    expect(within(queue()).getByText("No expiry date")).toBeVisible();
  });

  it("reads completed reviews only when asked for", async () => {
    render(<CredentialQueue locale="en" />);
    await screen.findByRole("button", { name: "Needs review 2" });
    expect(apiFetchAs).not.toHaveBeenCalledWith("test", "/admin/providers/credential-reviews?view=completed", expect.anything());
    fireEvent.click(screen.getByRole("button", { name: "Completed (recent)" }));
    expect(await screen.findByText("Dr Hoda Samir")).toBeVisible();
    expect(screen.getByText(/Decided by you/)).toBeVisible();
  });

  it("filters by organization, searches by clinician and shows a meaningful empty state", async () => {
    render(<CredentialQueue locale="en" />);
    await screen.findByRole("list", { name: "Needs review" });
    fireEvent.change(screen.getByLabelText("Organization"), { target: { value: "org-b" } });
    expect(within(queue()).getByText("Dr Omar Nabil")).toBeVisible();
    fireEvent.change(screen.getByLabelText("Search clinician"), { target: { value: "salma" } });
    expect(screen.getByText("No credentials need review")).toBeVisible();
    expect(screen.getByText("Change the filters to see more.")).toBeVisible();
  });

  it("preselects the organization filter from the initialOrg prop", async () => {
    render(<CredentialQueue locale="en" initialOrg="org-b" />);
    const list = await screen.findByRole("list", { name: "Needs review" });
    expect(within(list).queryByText("Dr Salma Farouk")).not.toBeInTheDocument();
    expect(within(list).getByText("Dr Omar Nabil")).toBeVisible();
  });

  it("reports a failed read instead of an empty queue", async () => {
    vi.mocked(apiFetchAs).mockImplementation(fakeApi({ "/admin/providers/credential-reviews": failure(500, "INTERNAL") }, ["provider.view", "credential.review"]));
    render(<CredentialQueue locale="en" />);
    expect(await screen.findByRole("button", { name: /Try again|Retry/ })).toBeVisible();
    expect(screen.queryByText("No credentials need review")).not.toBeInTheDocument();
  });

  it("offers direct consultant approvals, which keep their own approval model", async () => {
    auth.roles = ["CREDENTIALING_ADMIN"];
    vi.mocked(apiFetchAs).mockImplementation(fakeApi({ ...routes, "/admin/practitioners": [{ id: "p-9", displayName: "Dr Omar Said", specialty: "Cardiology", careCategory: "cardiology", credentialingStatus: "UNDER_REVIEW", accountStatus: "ACTIVE" }] }, ["provider.view", "credential.review"]));
    render(<CredentialQueue locale="en" initialView="direct" />);
    expect(await screen.findByText("Dr Omar Said")).toBeVisible();
    expect(screen.getByText("Awaiting approval")).toBeVisible();
    expect(screen.getByText(/one decision covers the credential check and the approval for cases/)).toBeVisible();
    expect(screen.getByRole("link", { name: "Review: Dr Omar Said" })).toHaveAttribute("href", "/en/portal/control-center/providers/clinicians/direct/p-9?tab=approval");
    expect(screen.getByRole("button", { name: "Provider credentials" })).toHaveAttribute("aria-pressed", "false");
  });

  it("renders in Arabic with isolated names", async () => {
    render(<CredentialQueue locale="ar" />);
    expect(await screen.findByRole("button", { name: "تحتاج إلى مراجعة 2" })).toBeVisible();
    expect(screen.getByText("Dr Salma Farouk").tagName).toBe("BDI");
  });
});
