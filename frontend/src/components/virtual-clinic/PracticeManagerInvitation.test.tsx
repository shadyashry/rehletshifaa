import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

import { PracticeManagerInvitation } from "./PracticeManagerInvitation";

const signIn = vi.fn();
const apiFetchAs = vi.fn();
let auth: { user: { access_token: string } | null; loading: boolean };

vi.mock("@/components/AuthProvider", () => ({
  useAuth: () => ({ ...auth, signIn }),
}));
vi.mock("@/lib/api", () => ({ apiFetchAs: (...args: unknown[]) => apiFetchAs(...args) }));

const response = (body: unknown, ok = true, status = 200) => ({ ok, status, json: async () => body } as Response);

describe("Practice Manager invitation", () => {
  beforeEach(() => {
    auth = { user: { access_token: "access" }, loading: false };
    window.history.replaceState({}, "", "/en/portal/virtual-clinic/invitations?token=one-time-token");
    apiFetchAs.mockReset(); signIn.mockReset();
    apiFetchAs.mockResolvedValueOnce(response([{ id: "i1", practitionerId: "p1", consultantName: "Dr A", status: "INVITED", identityResolutionStatus: "READY", permissions: ["PROFILE"], invitedAt: "2026-09-28T10:00:00Z", expiresAt: "2026-10-05T10:00:00Z", version: 0 }]));
  });
  afterEach(cleanup);

  it("shows the explicit isolation boundary and accepts only through the token endpoint", async () => {
    apiFetchAs.mockResolvedValueOnce(response({ status: "ACTIVE" }));
    render(<PracticeManagerInvitation locale="en" />);
    expect(await screen.findByText(/Dr A invited you/)).toBeTruthy();
    expect(screen.getByText(/no access to patients, cases, documents, messages, tasks, referrals, credential decisions, or clinical information/i)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Accept delegation" }));
    await screen.findByRole("heading", { name: "Delegation accepted" });
    expect(apiFetchAs).toHaveBeenCalledWith("access", "/clinics/invitations/accept", { method: "POST", body: JSON.stringify({ token: "one-time-token" }) });
  });

  it("requests step-up sign-in when the backend rejects password-only acceptance", async () => {
    apiFetchAs.mockResolvedValueOnce(response({}, false, 401));
    render(<PracticeManagerInvitation locale="en" />);
    await screen.findByText(/Dr A invited you/);
    fireEvent.click(screen.getByRole("button", { name: "Accept delegation" }));
    await waitFor(() => expect(signIn).toHaveBeenCalledWith(true));
  });
});
