import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { apiFetchAs } from "@/lib/api";
import type { Me } from "@/lib/access";
import { fakeApi, meWith } from "./test-support";
import { AdministratorsPage, OwnershipPage } from "./GovernancePages";
import { navItem } from "./control-center-nav";
import type { ControlCenterAccess } from "./control-center-access";

const auth = vi.hoisted(() => ({ user: { access_token: "test", profile: { sub: "owner", auth_time: Math.floor(Date.now() / 1000) } }, me: null as Me | null, roles: [] as string[], loading: false, meFailed: false, refreshMe: vi.fn(), signIn: vi.fn(), signOut: vi.fn() }));
vi.mock("@/components/AuthProvider", () => ({ useAuth: () => auth }));
vi.mock("@/lib/api", () => ({ apiFetchAs: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn(), push: vi.fn() }), usePathname: () => "/en/portal/control-center/administrators" }));

const overview = {
  administrators: [{ id: "a1", subject: "admin-a", effectiveFrom: "2026-09-01T00:00:00Z", effectiveTo: null, revision: 0 }],
  requests: [{ id: "r1", type: "APPOINT", subject: "third", effectiveFrom: "2026-10-04T00:00:00Z", effectiveTo: null, status: "PENDING", requestedBy: "admin-a", expiresAt: "2026-10-07T00:00:00Z", revision: 0 }],
  names: { "admin-a": "Amal Admin", third: "Tarek Third" },
};
beforeEach(() => { vi.mocked(apiFetchAs).mockImplementation(fakeApi({ "/admin/platform-access/administrator-changes": overview })); });
afterEach(() => { cleanup(); vi.clearAllMocks(); auth.me = null; });

const access = (me: Me): ControlCenterAccess => ({ loading: false, failed: false, retry: () => {}, me, can: (p) => me.permissions.includes(p), canAny: (ps) => ps.some((p) => me.permissions.includes(p)), needsFreshSignIn: () => false });

describe("Administrators — Platform Account Owner (GOV-02)", () => {
  it("the owner sees the page in navigation without any administrator permission", () => {
    expect(navItem("administrators").visible(access(meWith([], { platformAccountOwner: true, workspaces: ["CONTROL_CENTER"] })))).toBe(true);
    expect(navItem("administrators").visible(access(meWith(["WORKFORCE_READ"])))).toBe(false);
  });

  it("the owner decides pending requests by name but cannot raise appointments or removals", async () => {
    auth.me = meWith([], { platformAccountOwner: true, workspaces: ["CONTROL_CENTER"] });
    render(<AdministratorsPage locale="en" />);
    expect(await screen.findByText(/Tarek Third/)).toBeVisible();
    expect(screen.getAllByText("Amal Admin").length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "Approve" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Reject" })).toBeVisible();
    expect(screen.queryByRole("button", { name: "Request appointment" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Request removal" })).toBeNull();
    expect(apiFetchAs).not.toHaveBeenCalledWith(expect.anything(), "/admin/platform-access/staff", expect.anything());
  });

  it("an administrator still raises requests", async () => {
    auth.me = meWith(["ACCESS_GOVERN", "WORKFORCE_READ"]);
    render(<AdministratorsPage locale="en" />);
    expect(await screen.findByRole("button", { name: "Request removal" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Request appointment" })).toBeVisible();
  });
});

const transfer = (over: Record<string, unknown>) => ({
  id: "t1", currentOwner: { subject: "ceo", name: "Cyrine CEO" }, incomingOwner: { subject: "heir", name: "Hadi Heir" }, status: "PENDING_ACCEPTANCE",
  reason: "Planned succession", initiatedAt: "2026-10-04T10:00:00Z", expiresAt: "2026-10-07T10:00:00Z", revision: 0,
  canAccept: false, canVerify: false, canWithdraw: false, canDecline: false, ...over,
});
const ownership = (over: Record<string, unknown>) => ({ currentOwner: { subject: "ceo", name: "Cyrine CEO" }, viewerIsOwner: false, viewerIsAdministrator: false, canInitiate: false, transfers: [], ...over });
const OWNER_PATH = "/admin/platform-access/owner-transfers";

describe("Platform Ownership — the three-party transfer", () => {
  it("the owner starts a transfer by the incoming owner's work email, with a reason", async () => {
    const posted: unknown[] = [];
    vi.mocked(apiFetchAs).mockImplementation(fakeApi({ [OWNER_PATH]: ownership({ viewerIsOwner: true, canInitiate: true }),
      [`POST ${OWNER_PATH}`]: (init?: RequestInit) => { posted.push(JSON.parse(String(init?.body))); return {}; } }));
    auth.me = meWith([], { platformAccountOwner: true, workspaces: ["CONTROL_CENTER"] });
    render(<OwnershipPage locale="en" />);
    expect(await screen.findByText("Cyrine CEO")).toBeVisible();
    expect(screen.getByText("No transfer is in progress.")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Transfer ownership" }));
    const dialog = screen.getByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText(/work email/), { target: { value: "heir@example.test" } });
    fireEvent.change(within(dialog).getByLabelText(/Reason/), { target: { value: "Planned succession" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Start transfer" }));
    await waitFor(() => expect(posted).toEqual([{ incomingOwnerEmail: "heir@example.test", reason: "Planned succession" }]));
    expect(await screen.findByText(/The incoming owner must accept within 72 hours/)).toBeVisible();
  });

  it("the named incoming owner can reach the page and accept or decline", async () => {
    const posted: string[] = [];
    vi.mocked(apiFetchAs).mockImplementation(fakeApi({ [OWNER_PATH]: ownership({ transfers: [transfer({ canAccept: true, canDecline: true })] }),
      [`POST ${OWNER_PATH}/t1/accept`]: (init?: RequestInit) => { posted.push(String(init?.body)); return {}; } }));
    const me = meWith([], { pendingActions: ["ACCEPT_PLATFORM_OWNERSHIP"], workspaces: ["CONTROL_CENTER"] });
    expect(navItem("ownership").visible(access(me))).toBe(true);
    auth.me = me;
    render(<OwnershipPage locale="en" />);
    expect(await screen.findByText("Waiting for the incoming owner")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Transfer ownership" })).toBeNull();
    expect(screen.getByRole("button", { name: "Decline" })).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Accept ownership" }));
    const dialog = screen.getByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText(/Reason/), { target: { value: "I accept" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Accept ownership" }));
    await waitFor(() => expect(posted).toEqual([JSON.stringify({ revision: 0, reason: "I accept" })]));
  });

  it("an independent administrator verifies or refuses; others see who must act", async () => {
    vi.mocked(apiFetchAs).mockImplementation(fakeApi({ [OWNER_PATH]: ownership({ viewerIsAdministrator: true,
      transfers: [transfer({ status: "PENDING_VERIFICATION", canVerify: true }), transfer({ id: "t0", status: "REJECTED" })] }) }));
    auth.me = meWith(["ACCESS_GOVERN", "WORKFORCE_READ"]);
    render(<OwnershipPage locale="en" />);
    expect(await screen.findByRole("button", { name: "Verify and complete" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Refuse verification" })).toBeVisible();
    expect(screen.getByText("Earlier transfers")).toBeVisible();
    expect(screen.getByText("Stopped")).toBeVisible();
  });

  it("is hidden from people with no part in ownership", () => {
    expect(navItem("ownership").visible(access(meWith(["WORKFORCE_READ", "TEAM_MANAGE"])))).toBe(false);
  });
});
