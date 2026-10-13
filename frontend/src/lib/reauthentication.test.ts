import { afterEach, describe, expect, it, vi } from "vitest";
import { requestReauthentication, takePendingChange, takeReauthenticationReturn } from "./reauthentication";
import { signInIsStale } from "@/components/platform-control-center/control-center-access";

afterEach(() => { sessionStorage.clear(); });

describe("Recent-authentication round trip", () => {
  it("remembers that a sensitive change was interrupted, and reports it exactly once on return", async () => {
    const signIn = vi.fn(async () => undefined);
    await requestReauthentication(signIn);
    expect(signIn).toHaveBeenCalledWith(true);
    expect(takeReauthenticationReturn()).toBe("completed");
    expect(takeReauthenticationReturn()).toBeNull();
  });

  it("tells a completed re-check from an abandoned one by the sign-in time (QA W-30)", async () => {
    await requestReauthentication(vi.fn(async () => undefined));
    expect(takeReauthenticationReturn(Math.floor(Date.now() / 1000) - 3600)).toBe("abandoned");
    await requestReauthentication(vi.fn(async () => undefined));
    expect(takeReauthenticationReturn(Math.floor(Date.now() / 1000) + 1)).toBe("completed");
  });

  it("keeps the refused change for one re-send after the sign-in (QA #6 / W-6), never twice and never when stale", async () => {
    const change = { path: "/finance/cases/c1/proposals/v1/approve", method: "POST", body: undefined };
    await requestReauthentication(vi.fn(async () => undefined), change);
    expect(takePendingChange()).toEqual(change);
    expect(takePendingChange()).toBeNull();
    await requestReauthentication(vi.fn(async () => undefined), { path: "/doctor/cases/c1/review", method: "POST", body: "{\"a\":1}" });
    expect(takePendingChange(Date.now() + 11 * 60_000)).toBeNull();
    // A sign-in for a read keeps nothing; a stored value that is not an API path is never re-sent.
    await requestReauthentication(vi.fn(async () => undefined));
    expect(takePendingChange()).toBeNull();
    sessionStorage.setItem("rs:reauthentication-pending-change", JSON.stringify({ path: "https://elsewhere.example", method: "POST", at: Date.now() }));
    expect(takePendingChange()).toBeNull();
  });

  it("ignores an abandoned, stale marker", async () => {
    await requestReauthentication(vi.fn(async () => undefined));
    expect(takeReauthenticationReturn(undefined, Date.now() + 31 * 60_000)).toBeNull();
  });

  it("treats a sign-in older than the backend window (or of unknown age) as stale", () => {
    const now = Date.parse("2026-09-23T12:00:00Z");
    expect(signInIsStale(now / 1000 - 60, now)).toBe(false);
    expect(signInIsStale(now / 1000 - 20 * 60, now)).toBe(true);
    expect(signInIsStale(undefined, now)).toBe(true);
  });
});
