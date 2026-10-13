import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";

const callback = vi.fn();
const getUser = vi.fn();
vi.mock("@/lib/auth-client", async (original) => ({
  ...(await original<typeof import("@/lib/auth-client")>()),
  authManager: () => ({ signinRedirectCallback: callback, getUser }),
}));

import AuthCallbackPage from "./page";
import { rememberSignInLocale } from "@/lib/auth-client";

describe("/auth/callback (QA W-19)", () => {
  const replace = vi.fn();
  beforeEach(() => {
    vi.spyOn(window, "location", "get").mockReturnValue({ ...window.location, replace } as Location);
    sessionStorage.clear();
  });
  afterEach(() => { cleanup(); vi.restoreAllMocks(); callback.mockReset(); getUser.mockReset(); replace.mockReset(); });

  it("replaces itself with the page the sign-in started from", async () => {
    callback.mockResolvedValue({ state: { returnTo: "/ar/portal?case=c1" } });
    render(<AuthCallbackPage/>);
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/ar/portal?case=c1"));
  });

  it("sends a signed-in person back to the portal in their language when Back replays a used callback", async () => {
    rememberSignInLocale("ar");
    callback.mockRejectedValue(new Error("No matching state found in storage"));
    getUser.mockResolvedValue({ expired: false });
    render(<AuthCallbackPage/>);
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/ar/portal"));
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("explains a real failure in the sign-in language, with a way back", async () => {
    rememberSignInLocale("ar");
    callback.mockRejectedValue(new Error("invalid_grant"));
    getUser.mockResolvedValue(null);
    render(<AuthCallbackPage/>);
    expect((await screen.findByRole("alert")).textContent).toContain("تعذّر إكمال تسجيل الدخول");
    expect(screen.getByRole("link", { name: "العودة إلى البوابة" }).getAttribute("href")).toBe("/ar/portal");
    expect(replace).not.toHaveBeenCalled();
  });
});
