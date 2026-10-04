import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { ActionMenu, ControlCenterError, ErrorNotice, StatusBadge, friendlyError } from "./cc-ui";

const redirect = vi.hoisted(() => vi.fn((url: string) => { throw new Error("REDIRECT:" + url); }));
vi.mock("next/navigation", () => ({ redirect, notFound: () => { throw new Error("NOT_FOUND"); } }));
vi.mock("@/components/AuthProvider", () => ({ useAuth: () => ({ user: null, roles: [], loading: false, signIn: vi.fn(), signOut: vi.fn() }) }));
afterEach(() => { cleanup(); redirect.mockClear(); });

const go = async (load: () => Promise<{ default: (a: never) => Promise<unknown> }>, params: Record<string, string>, searchParams: Record<string, string> = {}) => {
  const page = (await load()).default;
  await expect(page({ params: Promise.resolve(params), searchParams: Promise.resolve(searchParams) } as never)).rejects.toThrow(/REDIRECT:/);
  return redirect.mock.calls.at(-1)?.[0];
};

describe("Section and legacy journey links land on the right page", () => {
  it("sends journey routes into the Control Center, preserving the designer tab", async () => {
    expect(await go(() => import("@/app/[locale]/portal/journeys/page"), { locale: "en" })).toBe("/en/portal/control-center/journeys");
    expect(await go(() => import("@/app/[locale]/portal/journeys/[definitionId]/versions/[versionId]/page"), { locale: "en", definitionId: "d1", versionId: "v1" }, { tab: "simulation" })).toBe("/en/portal/control-center/journeys/d1/versions/v1?tab=simulation");
  });


  it("opens section landing pages on their first task", async () => {
    expect(await go(() => import("@/app/[locale]/portal/control-center/commercial/page"), { locale: "en" })).toBe("/en/portal/control-center/commercial/prices");
  });
});

describe("Shared Control Center UI", () => {
  it("leads with actionable language and keeps the support code secondary", () => {
    render(<ErrorNotice error={new ControlCenterError("boom", "REQUEST_FAILED", 500)} locale="en" onRetry={() => undefined} />);
    // A 5xx leaves the outcome unknown: never claim it was or wasn't saved.
    expect(screen.getByRole("alert")).toHaveTextContent("We couldn't confirm this change was saved. Refresh to check before trying again");
    expect(screen.getByText("REQUEST_FAILED").tagName).toBe("CODE");
    expect(friendlyError(new ControlCenterError("x", "ACCESS_DENIED", 403), "ar")).toContain("ليس لديك صلاحية");
    expect(friendlyError(new ControlCenterError("Expiry required", "VALID_EXPIRY_REQUIRED", 400), "en")).toBe("Expiry required Nothing was saved.");
  });

  it("renders re-authentication, permission, validation, stale, business-conflict and temporary failures distinctly", () => {
    const say = (status: number, code: string, message = code) => friendlyError(new ControlCenterError(message, code, status), "en");
    const reauth = say(401, "REAUTHENTICATION_REQUIRED", "Sign in again to confirm this sensitive change");
    const denied = say(403, "ACCESS_DENIED");
    const invalid = say(400, "VALID_EXPIRY_REQUIRED", "A future expiry date is required");
    const stale = say(409, "STALE_ONBOARDING", "Onboarding changed; reload before activation");
    const conflict = say(409, "READINESS_BLOCKERS", "Clinician activation is blocked: credentials");
    const unavailable = say(503, "SERVICE_UNAVAILABLE");
    expect(new Set([reauth, denied, invalid, stale, conflict, unavailable]).size).toBe(6);
    expect(reauth).toMatch(/recent sign-in\. Nothing was changed/);
    expect(denied).toMatch(/don't have permission.*nothing was changed/);
    expect(invalid).toMatch(/Nothing was saved/);
    expect(stale).toMatch(/changed since you opened it, so nothing was saved\. Refresh/);
    expect(conflict).toMatch(/can't be done right now, so nothing was changed\. Clinician activation is blocked/);
    expect(unavailable).toMatch(/temporarily unavailable, and your change may not have been saved/);
    expect(say(401, "AUTHENTICATION_REQUIRED")).toMatch(/session has ended/);
  });

  it("explains a re-authentication refusal and offers the sign-in instead of redirecting unannounced", () => {
    render(<ErrorNotice error={new ControlCenterError("Sign in again", "REAUTHENTICATION_REQUIRED", 401)} locale="en" />);
    expect(screen.getByRole("alert")).toHaveTextContent("this change needs a recent sign-in. Nothing was changed.");
    expect(screen.getByRole("button", { name: "Sign in again" })).toBeVisible();
    expect(screen.queryByText("Support code")).not.toBeInTheDocument();
  });

  it("never conveys status by colour alone", () => {
    const { container } = render(<StatusBadge tone="danger">Rejected</StatusBadge>);
    expect(screen.getByText("Rejected")).toBeVisible();
    expect(container.querySelector("svg")).not.toBeNull();
  });

  it("opens row actions as an accessible menu and keeps destructive items last and distinct", () => {
    const remove = vi.fn();
    render(<ActionMenu label="Actions: Mona" actions={[{ label: "Remove", destructive: true, onSelect: remove }, { label: "Open", onSelect: () => undefined }]} />);
    const trigger = screen.getByRole("button", { name: "Actions: Mona" });
    expect(trigger).toHaveAttribute("aria-haspopup", "menu");
    fireEvent.click(trigger);
    const items = screen.getAllByRole("menuitem");
    expect(items.map((i) => i.textContent)).toEqual(["Open", "Remove"]);
    fireEvent.click(items[1]);
    expect(remove).toHaveBeenCalled();
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });
});
