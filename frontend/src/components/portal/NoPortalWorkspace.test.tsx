import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { NoPortalWorkspace } from "./NoPortalWorkspace";
import { apiFetchAs } from "@/lib/api";
import type { Me } from "@/lib/access";
import { meWith } from "@/components/platform-control-center/test-support";

const auth = vi.hoisted(() => ({ user: { access_token: "test", profile: { sub: "verifier" } }, me: null as Me | null, roles: [] as string[], loading: false, meFailed: false, refreshMe: vi.fn(), signIn: vi.fn() }));
vi.mock("@/components/AuthProvider", () => ({ useAuth: () => auth }));
vi.mock("@/lib/api", () => ({ apiFetchAs: vi.fn() }));
afterEach(() => { cleanup(); vi.clearAllMocks(); auth.me = null; auth.meFailed = false; });

describe("Signed-in account without a care-portal workspace", () => {
  it("points a Control-Center-only person to the areas their role opens — never 'no access'", () => {
    auth.me = meWith(["CREDENTIAL_READ", "CREDENTIAL_DECIDE"]);
    render(<NoPortalWorkspace locale="en" />);
    expect(screen.getByRole("heading", { name: "Your work is in the Control Center" })).toBeVisible();
    expect(screen.getByRole("link", { name: /Consultants/ })).toHaveAttribute("href", "/en/portal/control-center/consultants");
    expect(screen.getByRole("link", { name: "Open the Control Center" })).toBeVisible();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    // Discoverability only: nothing is fetched — no case or patient data.
    expect(apiFetchAs).not.toHaveBeenCalled();
    expect(screen.queryByRole("link", { name: /Journeys|People|Price Lists/ })).not.toBeInTheDocument();
  });

  it("tells an account with nothing set up the truth calmly, and a failed read is not 'nothing set up'", () => {
    auth.me = meWith([]);
    render(<NoPortalWorkspace locale="en" />);
    expect(screen.getByRole("heading", { name: "Nothing is set up for your account yet" })).toBeVisible();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    cleanup();
    auth.me = null; auth.meFailed = true;
    render(<NoPortalWorkspace locale="en" />);
    expect(screen.getByRole("alert")).toHaveTextContent("We couldn't check what you can use.");
  });

  it("renders in Arabic", () => {
    auth.me = meWith(["CREDENTIAL_READ"]);
    render(<NoPortalWorkspace locale="ar" />);
    expect(screen.getByRole("heading", { name: "عملك في مركز التحكم" })).toBeVisible();
  });
});
