import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { ControlCenterOverview } from "./ControlCenterOverview";
import { apiFetchAs } from "@/lib/api";
import { failure, fakeApi, json, organization, providerDetail } from "./test-support";

const auth = vi.hoisted(() => ({ user: { access_token: "test", profile: { sub: "owner" } }, roles: [] as string[], loading: false, signIn: vi.fn(), signOut: vi.fn() }));
vi.mock("@/components/AuthProvider", () => ({ useAuth: () => auth }));
vi.mock("@/lib/api", () => ({ apiFetchAs: vi.fn() }));
afterEach(() => { cleanup(); vi.clearAllMocks(); auth.roles = []; });

const main = () => screen.getByRole("main");

describe("Control Center Home answers 'What needs my attention?'", () => {
  it("lists only real waiting work, each linking straight to where it is done — no destination grid", async () => {
    vi.mocked(apiFetchAs).mockImplementation(fakeApi({
      "/admin/providers": [organization], "/admin/providers/org-a": providerDetail,
      "/admin/providers/org-a/credential-reviews": [{ id: "r1" }, { id: "r2" }],
    }, ["provider.view", "credential.review", "provider.clinician.invite"]));
    render(<ControlCenterOverview locale="en" />);
    const reviews = await screen.findByRole("link", { name: /Credentials waiting for review/ });
    expect(reviews).toHaveTextContent("2");
    // One organization holds the work, so the link opens that organization's queue, not a generic landing.
    expect(reviews).toHaveAttribute("href", "/en/portal/control-center/credentials?org=org-a");
    expect(screen.getByRole("link", { name: /Organizations still being set up/ })).toHaveAttribute("href", "/en/portal/control-center/providers/org-a?tab=setup");
    expect(screen.getByRole("link", { name: /People waiting for membership activation/ })).toHaveAttribute("href", "/en/portal/control-center/providers/org-a?tab=people");
    expect(screen.queryByText(/Cases waiting for a coordinator/)).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Add consultant" })).toHaveAttribute("href", "/en/portal/control-center/providers/onboarding/new");
    expect(screen.queryByRole("heading", { name: "What do you want to manage?" })).not.toBeInTheDocument();
    // Every link in the page body is an attention item or the one primary action: nothing duplicates the sidebar.
    expect(within(main()).getAllByRole("link").map((a) => a.textContent)).toHaveLength(4);
    expect(screen.getByRole("heading", { level: 1, name: "Control Center" })).toBeVisible();
  });

  it("says 'You're all caught up.' and what was checked, never zero tiles", async () => {
    vi.mocked(apiFetchAs).mockImplementation(fakeApi({ "/admin/providers": [] }, ["provider.view", "credential.review"]));
    render(<ControlCenterOverview locale="en" />);
    expect(await screen.findByText("You're all caught up.")).toBeVisible();
    expect(screen.getByText("Nothing is waiting in Reviews & Safety, Providers.")).toBeVisible();
    expect(screen.queryByText("0")).not.toBeInTheDocument();
  });

  it("is persona-aware: a journey manager sees no provider onboarding work and gets a calm pointer to their areas", async () => {
    vi.mocked(apiFetchAs).mockImplementation(fakeApi({}, ["journey.view"]));
    render(<ControlCenterOverview locale="en" />);
    expect(await screen.findByText("There's no waiting work to track here for your areas")).toBeVisible();
    expect(within(main()).getByRole("link", { name: "Journeys" })).toHaveAttribute("href", "/en/portal/control-center/journeys");
    expect(screen.queryByRole("link", { name: "Add consultant" })).not.toBeInTheDocument();
    expect(vi.mocked(apiFetchAs).mock.calls.map(([, path]) => path)).toEqual(["/admin/access/me", "/admin/access/me"]);
  });

  it("a credential reviewer sees review work only — no pricing or provider-setup items", async () => {
    vi.mocked(apiFetchAs).mockImplementation(fakeApi({ "/admin/providers": [organization], "/admin/providers/org-a/credential-reviews": [{ id: "r1" }] }, ["credential.review"]));
    render(<ControlCenterOverview locale="en" />);
    expect(await screen.findByRole("link", { name: /Credentials waiting for review/ })).toBeVisible();
    expect(screen.queryByText(/Organizations still being set up|membership activation|Staff invitations/)).not.toBeInTheDocument();
  });

  it("reports a count it could not read as not checked — not as zero and not as no access", async () => {
    vi.mocked(apiFetchAs).mockImplementation(fakeApi({ "/admin/providers": [organization], "/admin/providers/org-a/credential-reviews": failure(500, "REQUEST_FAILED") }, ["credential.review"]));
    render(<ControlCenterOverview locale="en" />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Some waiting work couldn't be checked: Credentials waiting for review.");
    expect(screen.queryByText("You're all caught up.")).not.toBeInTheDocument();
    expect(screen.queryByText(/access/i)).not.toBeInTheDocument();
    vi.mocked(apiFetchAs).mockImplementation(fakeApi({ "/admin/providers": [organization], "/admin/providers/org-a/credential-reviews": [] }, ["credential.review"]));
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("You're all caught up.")).toBeVisible();
  });

  it("marks a count that covers only part of the data", async () => {
    const orgs = Array.from({ length: 26 }, (_, i) => ({ ...organization, id: `org-${i}`, status: "ACTIVE" }));
    vi.mocked(apiFetchAs).mockImplementation(fakeApi({ "/admin/providers": orgs, ...Object.fromEntries(orgs.map((o) => [`/admin/providers/${o.id}`, providerDetail])) }, ["provider.view"]));
    render(<ControlCenterOverview locale="en" />);
    const pending = await screen.findByRole("link", { name: /People waiting for membership activation/ });
    expect(pending).toHaveTextContent("25");
    expect(pending).toHaveTextContent("first 25 organizations only");
  });

  it("tells an account without any area what to do, and a failed capability read is not 'no access'", async () => {
    vi.mocked(apiFetchAs).mockImplementation(fakeApi({}, []));
    render(<ControlCenterOverview locale="ar" />);
    expect(await screen.findByText("لا توجد مجالات في مركز التحكم لحسابك")).toBeVisible();
    cleanup();
    vi.mocked(apiFetchAs).mockImplementation(async () => json({}, 503));
    render(<ControlCenterOverview locale="en" />);
    await waitFor(() => expect(within(main()).getByRole("alert")).toHaveTextContent("We couldn't check which areas you can use."));
    expect(screen.queryByText(/No Control Center areas/)).not.toBeInTheDocument();
  });
});
