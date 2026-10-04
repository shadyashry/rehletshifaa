import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { apiFetchAs } from "@/lib/api";
import type { Me } from "@/lib/access";
import { fakeApi, meWith } from "./test-support";
import { AdministratorsPage } from "./GovernancePages";
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
