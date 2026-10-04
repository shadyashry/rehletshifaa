import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { ControlCenterOverview } from "./ControlCenterOverview";
import { apiFetchAs } from "@/lib/api";
import type { Me } from "@/lib/access";
import { failure, fakeApi, meWith } from "./test-support";

const auth = vi.hoisted(() => ({ user: { access_token: "test", profile: { sub: "owner" } }, me: null as Me | null, roles: [] as string[], loading: false, meFailed: false, refreshMe: vi.fn(), signIn: vi.fn(), signOut: vi.fn() }));
vi.mock("@/components/AuthProvider", () => ({ useAuth: () => auth }));
vi.mock("@/lib/api", () => ({ apiFetchAs: vi.fn() }));
afterEach(() => { cleanup(); vi.clearAllMocks(); auth.me = null; auth.meFailed = false; });

const main = () => screen.getByRole("main");

describe("Control Center Home answers 'What needs my attention?'", () => {
  it("lists only real waiting work, each linking straight to where it is done — no destination grid", async () => {
    auth.me = meWith(["CREDENTIAL_READ", "CREDENTIAL_DECIDE", "CONSULTANT_ONBOARD"]);
    vi.mocked(apiFetchAs).mockImplementation(fakeApi({ "/admin/practitioners": [{ id: "p1", credentialingStatus: "UNDER_REVIEW" }, { id: "p2", credentialingStatus: "VERIFIED" }] }));
    render(<ControlCenterOverview locale="en" />);
    const waiting = await screen.findByRole("link", { name: /Consultants waiting for case approval/ });
    expect(waiting).toHaveTextContent("1");
    expect(waiting).toHaveAttribute("href", "/en/portal/control-center/consultants");
    expect(screen.getByRole("link", { name: "Add consultant" })).toHaveAttribute("href", "/en/portal/control-center/consultants/new");
    expect(within(main()).getAllByRole("link")).toHaveLength(2);
    expect(screen.getByRole("heading", { level: 1, name: "Control Center" })).toBeVisible();
  });

  it("a system administrator sees workforce and governance work only", async () => {
    auth.me = meWith(["WORKFORCE_READ", "WORKFORCE_ADMINISTER", "ACCESS_GOVERN", "AUDIT_READ"]);
    vi.mocked(apiFetchAs).mockImplementation(fakeApi({
      "/admin/platform-access/staff": { people: [], invitations: [{ status: "SENT" }, { status: "QUEUED" }, { status: "ACCEPTED" }] },
      "/admin/platform-access/staffing-requests": [{ status: "SUBMITTED" }],
      "/admin/platform-access/administrator-changes": { administrators: [], requests: [{ status: "PENDING" }, { status: "APPROVED" }] },
      "/admin/platform-access/mfa-reset-requests": [],
    }));
    render(<ControlCenterOverview locale="en" />);
    expect(await screen.findByRole("link", { name: /Staff invitations not yet accepted/ })).toHaveTextContent("2");
    expect(screen.getByRole("link", { name: /Staffing requests waiting for a decision/ })).toHaveAttribute("href", "/en/portal/control-center/staffing-requests");
    expect(screen.getByRole("link", { name: /waiting for a second approver/ })).toHaveTextContent("1");
    expect(screen.queryByText(/MFA reset requests/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Consultants waiting|coordinator/)).not.toBeInTheDocument();
    const paths = vi.mocked(apiFetchAs).mock.calls.map(([, path]) => path);
    expect(paths).not.toContain("/admin/practitioners");
  });

  it("says 'You're all caught up.' and what was checked, never zero tiles", async () => {
    auth.me = meWith(["ROUTING_READ", "ROUTING_ASSIGN"]);
    vi.mocked(apiFetchAs).mockImplementation(fakeApi({ "/admin/coordination/queue": [] }));
    render(<ControlCenterOverview locale="en" />);
    expect(await screen.findByText("You're all caught up.")).toBeVisible();
    expect(screen.getByText("Nothing is waiting in Operations.")).toBeVisible();
    expect(screen.queryByText("0")).not.toBeInTheDocument();
  });

  it("is persona-aware: a journey manager gets a calm pointer to their areas and no reads", async () => {
    auth.me = meWith(["JOURNEY_READ", "JOURNEY_EDIT"]);
    vi.mocked(apiFetchAs).mockImplementation(fakeApi({}));
    render(<ControlCenterOverview locale="en" />);
    expect(await screen.findByText("There's no waiting work to track here for your areas")).toBeVisible();
    expect(within(main()).getByRole("link", { name: "Journeys" })).toHaveAttribute("href", "/en/portal/control-center/journeys");
    expect(vi.mocked(apiFetchAs)).not.toHaveBeenCalled();
  });

  it("reports a count it could not read as not checked — not as zero and not as no access", async () => {
    auth.me = meWith(["PATIENT_IDENTITY_REVIEW", "PATIENT_IDENTITY_READ"]);
    vi.mocked(apiFetchAs).mockImplementation(fakeApi({ "/identity-review/queue": failure(500, "REQUEST_FAILED") }));
    render(<ControlCenterOverview locale="en" />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Some waiting work couldn't be checked: Identity checks waiting for a decision.");
    expect(screen.queryByText("You're all caught up.")).not.toBeInTheDocument();
    vi.mocked(apiFetchAs).mockImplementation(fakeApi({ "/identity-review/queue": [] }));
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("You're all caught up.")).toBeVisible();
  });

  it("tells an account without any area what to do, and a failed access read is not 'no access'", async () => {
    auth.me = meWith([]);
    render(<ControlCenterOverview locale="ar" />);
    expect(await screen.findByText("لا توجد مجالات في مركز التحكم لحسابك")).toBeVisible();
    cleanup();
    auth.me = null; auth.meFailed = true;
    render(<ControlCenterOverview locale="en" />);
    expect(within(main()).getByRole("alert")).toHaveTextContent("We couldn't check which areas you can use.");
    expect(screen.queryByText(/No Control Center areas/)).not.toBeInTheDocument();
  });
});
