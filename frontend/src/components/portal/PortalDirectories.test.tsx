import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { IdentityReviewQueue } from "./PortalDirectories";
import { ControlCenterError } from "@/components/platform-control-center/cc-ui";

const signIn = vi.fn(async () => {});
vi.mock("@/components/AuthProvider", () => ({ useAuth: () => ({ user: null, roles: [], loading: false, signIn, signOut: vi.fn() }) }));

const request = { id: "idv-1", subjectType: "PATIENT", status: "MANUAL_REVIEW", documentType: "PASSPORT", issuingCountry: "Saudi Arabia",
  documentReferenceMasked: "***0002", requestedAt: "2026-10-13T12:23:48Z" };

/** The queue answers with one request; a decision is refused because the sign-in carries no recent second factor. */
function stepUpApi() {
  return vi.fn(async (path: string) => {
    if (path === "/identity-review/queue") return [request];
    throw new ControlCenterError("Use multi-factor authentication to confirm this sensitive action", "REAUTHENTICATION_REQUIRED", 401);
  }) as unknown as <T>(path: string, init?: RequestInit) => Promise<T>;
}

async function decide() {
  fireEvent.change(await screen.findByRole("combobox"), { target: { value: "VERIFY" } });
  fireEvent.change(screen.getByRole("textbox"), { target: { value: "Synthetic passport reviewed" } });
  fireEvent.click(screen.getByRole("button", { name: /record decision|تسجيل القرار/i }));
}

describe("IdentityReviewQueue (QA W-49)", () => {
  afterEach(() => { cleanup(); signIn.mockClear(); });

  it("offers the MFA sign-in when a decision needs it, instead of a reload that can never succeed", async () => {
    render(<IdentityReviewQueue api={stepUpApi()} locale="en"/>);
    await decide();
    const again = await screen.findByRole("button", { name: "Sign in again" });
    expect(screen.getByText(/needs a recent sign-in\. Nothing was changed\./)).toBeTruthy();
    expect(screen.queryByRole("button", { name: /retry|try again/i })).toBeNull();
    fireEvent.click(again);
    expect(signIn).toHaveBeenCalledWith(true);
  });

  it("says the same in Arabic", async () => {
    render(<IdentityReviewQueue api={stepUpApi()} locale="ar"/>);
    await decide();
    expect(await screen.findByRole("button", { name: "تسجيل الدخول مجددًا" })).toBeTruthy();
  });

  it("still lets a failed load be tried again", async () => {
    const api = vi.fn(async () => { throw new ControlCenterError("Server error", "INTERNAL_ERROR", 500); }) as unknown as <T>(path: string) => Promise<T>;
    render(<IdentityReviewQueue api={api} locale="en"/>);
    expect(await screen.findByRole("button", { name: "Try again" })).toBeTruthy();
  });
});
