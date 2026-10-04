import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { OwnerWorkspace } from "./OwnerWorkspace";
import { CommissioningAcceptance } from "./CommissioningAcceptance";
import { apiFetchAs } from "@/lib/api";
import type { Me } from "@/lib/access";

const auth = vi.hoisted(() => ({
  user: { access_token: "token", profile: { sub: "owner-subject" } },
  me: null as Me | null, roles: [] as string[], loading: false, meFailed: false,
  refreshMe: vi.fn(), signIn: vi.fn(), signOut: vi.fn(),
}));
vi.mock("@/components/AuthProvider", () => ({ useAuth: () => auth }));
vi.mock("@/lib/api", () => ({ apiFetchAs: vi.fn() }));

const owner: Me = { subject: "owner-subject", roles: [], permissions: ["EXECUTIVE_OVERVIEW_VIEW"], reauthenticate: [],
  workspaces: ["OWNER"], managedFunctions: [], platformAccountOwner: true, workforce: null, pendingActions: [] };
const metric = (data: Record<string, unknown>) => ({ definitionVersion: "v1", evaluatedAt: "2026-09-28T10:00:00Z", from: "2026-08-28T10:00:00Z", to: "2026-09-28T10:00:00Z", freshnessTarget: "HOURLY", data, definitions: {} });

afterEach(() => { cleanup(); vi.clearAllMocks(); auth.me = null; auth.loading = false; });

describe("Platform Account Owner experiences", () => {
  it("uses owner-only typed analytics APIs and renders period, freshness and aggregate values", async () => {
    auth.me = owner;
    vi.mocked(apiFetchAs).mockImplementation(async (_token, path) => new Response(JSON.stringify(path === "/owner/overview"
      ? metric({ activeCases: 12, netPaymentsEgp: 8400 })
      : metric({ casesByStatus: { INTAKE_REVIEW: 7, CLOSED: "SUPPRESSED" } })), { status: 200 }));
    render(<OwnerWorkspace locale="en" />);
    expect(await screen.findByText("12")).toBeVisible();
    expect(screen.getByText(/Freshness: HOURLY/)).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Journeys" }));
    expect(await screen.findByText(/INTAKE_REVIEW: 7/)).toBeVisible();
    expect(apiFetchAs).toHaveBeenCalledWith("token", "/owner/analytics/journeys");
    expect(screen.queryByRole("button", { name: /edit case|record payment|clinical/i })).not.toBeInTheDocument();
  });

  it("does not treat a System Administrator as an owner in the browser", () => {
    auth.me = { ...owner, platformAccountOwner: false, workspaces: ["CONTROL_CENTER"], roles: ["SYSTEM_ADMINISTRATOR"] };
    render(<OwnerWorkspace locale="en" />);
    expect(screen.getByRole("alert")).toHaveTextContent("only to the current Platform Account Owner");
    expect(apiFetchAs).not.toHaveBeenCalled();
  });

  it("binds commissioning acceptance to the signed-in invitation and never submits an actor subject", async () => {
    auth.me = owner;
    vi.mocked(apiFetchAs).mockImplementation(async (_token, path, init) => {
      if (path === "/governance/commissioning/current-invitation") return new Response(JSON.stringify({ commissioningId: "c-1", participantType: "OWNER", subject: "owner-subject", status: "INVITED" }), { status: 200 });
      if (init?.method === "POST") return new Response(JSON.stringify({ status: "OWNER_ACCEPTED" }), { status: 200 });
      return new Response("{}", { status: 404 });
    });
    render(<CommissioningAcceptance locale="en" />);
    expect(await screen.findByText(/executive owner accountable/)).toBeVisible();
    fireEvent.change(screen.getByRole("textbox", { name: "Acceptance reason" }), { target: { value: "I accept the accountable role" } });
    fireEvent.click(screen.getByRole("button", { name: "Accept responsibility" }));
    await screen.findByText(/Your acceptance was recorded/);
    await waitFor(() => expect(apiFetchAs).toHaveBeenCalledWith("token", "/governance/commissioning/c-1/acceptance", expect.objectContaining({ method: "POST", body: JSON.stringify({ reason: "I accept the accountable role" }) })));
    const body = JSON.parse(String(vi.mocked(apiFetchAs).mock.calls.at(-1)?.[2]?.body));
    expect(body).not.toHaveProperty("subject");
  });
});
