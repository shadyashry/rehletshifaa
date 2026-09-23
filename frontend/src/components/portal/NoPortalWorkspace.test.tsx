import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { NoPortalWorkspace } from "./NoPortalWorkspace";
import { apiFetchAs } from "@/lib/api";

const auth = vi.hoisted(() => ({ user: { access_token: "test", profile: { sub: "provider-ops" } }, roles: [] as string[], loading: false, signIn: vi.fn() }));
vi.mock("@/components/AuthProvider", () => ({ useAuth: () => auth }));
vi.mock("@/lib/api", () => ({ apiFetchAs: vi.fn() }));
const me = (allowed: string[]) => vi.mocked(apiFetchAs).mockImplementation(async (_t, path) =>
  new Response(JSON.stringify(path === "/admin/access/me" ? allowed.map((permission) => ({ permission, allowed: true, recentAuthentication: false })) : {}), { status: 200 }));
afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe("Signed-in account without a care-portal role (interim, until the Provider Workspace)", () => {
  it("points a capability-only provider person to the areas their role opens — never 'no access'", async () => {
    me(["provider.view", "credential.view"]);
    render(<NoPortalWorkspace locale="en" />);
    expect(await screen.findByRole("heading", { name: "Your work is in the Control Center" })).toBeVisible();
    expect(screen.getByRole("link", { name: /Organizations/ })).toHaveAttribute("href", "/en/portal/control-center/providers");
    expect(screen.getByRole("link", { name: "Open the Control Center" })).toBeVisible();
    expect(screen.queryByText(/no portal role/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    // Discoverability only: nothing beyond the caller's own capability read is fetched — no case or patient data.
    expect(vi.mocked(apiFetchAs).mock.calls.map(([, path]) => path)).toEqual(["/admin/access/me"]);
    expect(screen.queryByRole("link", { name: /Journeys|Roles|RehletShifaa Staff|Price Lists/ })).not.toBeInTheDocument();
  });

  it("tells an account with nothing set up the truth calmly, with the next step", async () => {
    me([]);
    render(<NoPortalWorkspace locale="en" />);
    expect(await screen.findByRole("heading", { name: "Nothing is set up for your account yet" })).toBeVisible();
    expect(screen.getByText(/membership may still be waiting for confirmation/)).toBeVisible();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("renders in Arabic", async () => {
    me(["provider.view"]);
    render(<NoPortalWorkspace locale="ar" />);
    expect(await screen.findByRole("heading", { name: "عملك في مركز التحكم" })).toBeVisible();
  });
});
