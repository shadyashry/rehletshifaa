import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import type { Me } from "@/lib/access";
import { apiFetchAs } from "@/lib/api";
import { fakeApi, failure, meWith } from "./test-support";
import { WorkforceIdentityReviewsPage, type WorkforceIdentityReview } from "./WorkforceIdentityReviews";

const auth = vi.hoisted(() => ({ user: { access_token: "test", profile: { sub: "admin" } }, me: null as Me | null, roles: [], loading: false, meFailed: false, refreshMe: vi.fn(), signIn: vi.fn(), signOut: vi.fn() }));
vi.mock("@/components/AuthProvider", () => ({ useAuth: () => auth }));
vi.mock("@/lib/api", () => ({ apiFetchAs: vi.fn() }));
const PATH = "/admin/platform-access/staff/identity-reviews";
const review = (status: WorkforceIdentityReview["status"], id = "r1"): WorkforceIdentityReview => ({
  id, invitationId: "i1", name: `Person ${id}`, email: `${id}@example.test`, status, subject: status === "AWAITING_ACCEPTANCE" ? "holder" : null,
  reviewer: "reviewer-1", reason: "Directory email ambiguity", revision: 3,
  history: [{ status: "PENDING_REVIEW", actor: "system", reason: "Existing identity found", at: "2026-10-05T09:00:00Z", revision: 0 }],
});
beforeEach(() => { auth.me = meWith(["WORKFORCE_ADMINISTER"]); vi.mocked(apiFetchAs).mockImplementation(fakeApi({ [PATH]: [review("PENDING_REVIEW")] })); });
afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe("Workforce identity review queue", () => {
  it("does not expose workforce reviews to a patient identity reviewer or ordinary workforce reader", () => {
    auth.me = meWith(["PATIENT_IDENTITY_READ", "PATIENT_IDENTITY_REVIEW", "WORKFORCE_READ"]);
    render(<WorkforceIdentityReviewsPage locale="en" />);
    expect(screen.getByText("You don't have access to this area")).toBeVisible();
    expect(screen.queryByRole("link", { name: "Workforce Identity Reviews" })).toBeNull();
    expect(apiFetchAs).not.toHaveBeenCalled();
  });

  it("separates all review states, retains reasons and history, and reserves acceptance for the holder", async () => {
    vi.mocked(apiFetchAs).mockImplementation(fakeApi({ [PATH]: [review("PENDING_REVIEW"), review("AWAITING_ACCEPTANCE", "r2"), review("RESOLVED", "r3"), review("REJECTED", "r4")] }));
    render(<WorkforceIdentityReviewsPage locale="en" />);
    expect(await screen.findByText("Person r4")).toBeVisible();
    expect(screen.getByRole("heading", { name: "Awaiting holder acceptance" })).toBeVisible();
    expect(screen.getByRole("heading", { name: "Resolved and rejected" })).toBeVisible();
    expect(screen.getAllByText(/Directory email ambiguity/)).toHaveLength(4);
    expect(screen.getAllByText(/reviewer-1/)).toHaveLength(4);
    const history = screen.getAllByText("Review history")[0];
    fireEvent.click(history);
    expect(history.parentElement).toHaveTextContent("Existing identity found");
    expect(screen.getAllByRole("button", { name: "Resolve identity" })).toHaveLength(1);
    expect(screen.getAllByRole("button", { name: "Reject invitation" })).toHaveLength(2);
    expect(screen.queryByRole("button", { name: /Accept/ })).toBeNull();
    expect(apiFetchAs).not.toHaveBeenCalledWith(expect.anything(), "/identity-review/queue", expect.anything());
  });

  it("resolves with the displayed revision and reason, then shows holder acceptance is still required", async () => {
    const posted: unknown[] = [];
    vi.mocked(apiFetchAs).mockImplementation(fakeApi({ [PATH]: [review("PENDING_REVIEW")],
      [`POST ${PATH}/r1/decision`]: (init?: RequestInit) => { posted.push(JSON.parse(String(init?.body))); return review("AWAITING_ACCEPTANCE"); } }));
    render(<WorkforceIdentityReviewsPage locale="en" />);
    fireEvent.click(await screen.findByRole("button", { name: "Resolve identity" }));
    const dialog = screen.getByRole("dialog");
    const submit = within(dialog).getByRole("button", { name: "Resolve identity" });
    expect(submit).toBeDisabled();
    fireEvent.change(within(dialog).getByLabelText(/Reason/), { target: { value: "Corrected the directory match" } });
    fireEvent.click(submit);
    await waitFor(() => expect(posted).toEqual([{ revision: 3, outcome: "RESOLVE", reason: "Corrected the directory match" }]));
    expect(await screen.findByText("Identity confirmed; waiting for the holder to accept.")).toBeVisible();
  });

  it("keeps a refused decision open and preserves the entered reason", async () => {
    vi.mocked(apiFetchAs).mockImplementation(fakeApi({ [PATH]: [review("AWAITING_ACCEPTANCE")],
      [`POST ${PATH}/r1/decision`]: failure(409, "STALE_IDENTITY_REVIEW") }));
    render(<WorkforceIdentityReviewsPage locale="en" />);
    fireEvent.click(await screen.findByRole("button", { name: "Reject invitation" }));
    const dialog = screen.getByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText(/Reason/), { target: { value: "Hiring withdrawn" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Reject invitation" }));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent("changed since you opened it");
    expect(within(dialog).getByLabelText(/Reason/)).toHaveValue("Hiring withdrawn");
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    fireEvent.click(screen.getByRole("button", { name: "Refresh reviews" }));
    await waitFor(() => expect(vi.mocked(apiFetchAs).mock.calls.filter((call) => call[1] === PATH)).toHaveLength(2));
  });
});
