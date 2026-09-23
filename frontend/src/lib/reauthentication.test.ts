import { afterEach, describe, expect, it, vi } from "vitest";
import { requestReauthentication, takeReauthenticationReturn } from "./reauthentication";
import { signInIsStale } from "@/components/platform-control-center/control-center-access";

afterEach(() => { sessionStorage.clear(); });

describe("Recent-authentication round trip", () => {
  it("remembers that a sensitive change was interrupted, and reports it exactly once on return", async () => {
    const signIn = vi.fn(async () => undefined);
    await requestReauthentication(signIn);
    expect(signIn).toHaveBeenCalledWith(true);
    expect(takeReauthenticationReturn()).toBe(true);
    expect(takeReauthenticationReturn()).toBe(false);
  });

  it("ignores an abandoned, stale marker", async () => {
    await requestReauthentication(vi.fn(async () => undefined));
    expect(takeReauthenticationReturn(Date.now() + 31 * 60_000)).toBe(false);
  });

  it("treats a sign-in older than the backend window (or of unknown age) as stale", () => {
    const now = Date.parse("2026-09-23T12:00:00Z");
    expect(signInIsStale(now / 1000 - 60, now)).toBe(false);
    expect(signInIsStale(now / 1000 - 20 * 60, now)).toBe(true);
    expect(signInIsStale(undefined, now)).toBe(true);
  });
});
