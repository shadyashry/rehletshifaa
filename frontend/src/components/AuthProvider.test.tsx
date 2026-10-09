import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { AuthProvider, useAuth } from "./AuthProvider";
import { apiFetchAs } from "@/lib/api";
import { meWith } from "@/components/platform-control-center/test-support";

const session = { access_token: "invitee-token", expired: false, profile: { sub: "invitee" } };
vi.mock("@/lib/auth-client", () => ({
  authManager: () => ({ getUser: async () => session, events: { addUserLoaded: vi.fn(), addUserUnloaded: vi.fn(), removeUserLoaded: vi.fn(), removeUserUnloaded: vi.fn() } }),
}));
vi.mock("@/lib/api", () => ({ apiFetchAs: vi.fn() }));
afterEach(() => { cleanup(); vi.clearAllMocks(); });

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const invited = meWith([], { pendingActions: ["ACTIVATE_ACCOUNT"] });
const active = meWith([], { roles: ["COORDINATOR"], workspaces: ["COORDINATION"] });
const calls = () => vi.mocked(apiFetchAs).mock.calls.map(([, path, init]) => `${init?.method ?? "GET"} ${path}`);

function Probe() {
  const { me, loading, activationIssue } = useAuth();
  if (loading) return <p>loading</p>;
  return <p data-testid="state">{`${me?.roles.join(",") || "none"}|${me?.pendingActions.join(",") || "-"}|${activationIssue?.code ?? "-"}`}</p>;
}

describe("STF-02 activation after an invited person's first sign-in", () => {
  it("activates once when /me reports ACTIVATE_ACCOUNT, then re-reads /me so granted roles take effect", async () => {
    let activated = false;
    vi.mocked(apiFetchAs).mockImplementation(async (_t, path) => {
      if (path === "/me/activation") { activated = true; return json({ lifecycle: "ACTIVE" }); }
      return json(activated ? active : invited);
    });
    render(<AuthProvider><Probe /></AuthProvider>);
    await waitFor(() => expect(screen.getByTestId("state")).toHaveTextContent("COORDINATOR|-|-"));
    expect(calls()).toEqual(["GET /me", "POST /me/activation", "GET /me"]);
  });

  it("keeps an MFA refusal as the activation issue without failing /me or granting anything", async () => {
    vi.mocked(apiFetchAs).mockImplementation(async (_t, path) => path === "/me/activation"
      ? json({ code: "MFA_ENROLMENT_REQUIRED", message: "Set up two-step verification before activating your account" }, 409)
      : json(invited));
    render(<AuthProvider><Probe /></AuthProvider>);
    await waitFor(() => expect(screen.getByTestId("state")).toHaveTextContent("none|ACTIVATE_ACCOUNT|MFA_ENROLMENT_REQUIRED"));
    expect(calls()).toEqual(["GET /me", "POST /me/activation"]);
  });

  it("never calls activation for an account that is not awaiting it", async () => {
    vi.mocked(apiFetchAs).mockResolvedValue(json(active));
    render(<AuthProvider><Probe /></AuthProvider>);
    await waitFor(() => expect(screen.getByTestId("state")).toHaveTextContent("COORDINATOR|-|-"));
    expect(calls()).toEqual(["GET /me"]);
  });
});

describe("refreshMe", () => {
  function Refreshing({ onReady }: { onReady: (refresh: () => void) => void }) {
    const { refreshMe } = useAuth();
    onReady(refreshMe);
    return <Probe />;
  }

  it("keeps the previous answer on screen while it re-reads /me for the same person", async () => {
    let answer: (response: Response) => void = () => {};
    vi.mocked(apiFetchAs).mockResolvedValueOnce(json(active))
      .mockImplementationOnce(() => new Promise<Response>(resolve => { answer = resolve; }));
    let refresh = () => {};
    render(<AuthProvider><Refreshing onReady={value => { refresh = value; }} /></AuthProvider>);
    await waitFor(() => expect(screen.getByTestId("state")).toHaveTextContent("COORDINATOR|-|-"));
    act(() => refresh());
    await waitFor(() => expect(calls()).toEqual(["GET /me", "GET /me"]));
    // Still the previous answer, never the loading state, while the re-read is in flight.
    expect(screen.getByTestId("state")).toHaveTextContent("COORDINATOR|-|-");
    await act(async () => answer(json(meWith([], { roles: ["COORDINATOR", "FINANCE"], workspaces: ["COORDINATION"] }))));
    await waitFor(() => expect(screen.getByTestId("state")).toHaveTextContent("COORDINATOR,FINANCE|-|-"));
  });
});
