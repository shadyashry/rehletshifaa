import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { Portal } from "./Portal";
import { apiFetchAs } from "@/lib/api";
import { getDictionary } from "@/lib/dictionary";
import type { Me } from "@/lib/access";
import { fakeApi, meWith } from "@/components/platform-control-center/test-support";
import { workCopyFor } from "./test-copy";

const auth = vi.hoisted(() => ({ user: { access_token: "test", profile: { sub: "u1", name: "Rana Adel" } }, me: null as Me | null, roles: [] as string[], loading: false, meFailed: false, refreshMe: vi.fn(), signIn: vi.fn(), signOut: vi.fn() }));
const router = vi.hoisted(() => ({ replace: vi.fn(), push: vi.fn() }));
vi.mock("@/components/AuthProvider", () => ({ useAuth: () => auth }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));
vi.mock("@/lib/api", () => ({ apiFetchAs: vi.fn(), SITE_URL: "https://example.org", OIDC_AUTHORITY: "https://auth.example/realms/r" }));

beforeEach(() => { const slot = document.createElement("div"); slot.id = "portal-account-slot"; document.body.appendChild(slot); });
afterEach(() => { cleanup(); vi.clearAllMocks(); document.getElementById("portal-account-slot")?.remove(); auth.me = null; window.history.replaceState({}, "", "/"); });

describe("One way into the Control Center", () => {
  it("takes a Control-Center-only account straight there — no intermediate page", async () => {
    auth.me = meWith(["WORKFORCE_READ", "WORKFORCE_ADMINISTER", "ACCESS_GOVERN"], { roles: ["SYSTEM_ADMINISTRATOR", "ACCOUNT_HOLDER"], workspaces: ["CONTROL_CENTER"] });
    vi.mocked(apiFetchAs).mockImplementation(fakeApi({}));
    render(<Portal locale="en" proposalCopy={getDictionary("en").portalProposal} workCopy={workCopyFor("en")} />);
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith("/en/portal/control-center"));
    expect(screen.getByText("Opening the Control Center…")).toBeVisible();
  });

  it("does the same for an identity-review-only account", async () => {
    auth.me = meWith(["PATIENT_IDENTITY_REVIEW", "PATIENT_IDENTITY_READ"], { workspaces: ["IDENTITY_REVIEW"] });
    vi.mocked(apiFetchAs).mockImplementation(fakeApi({}));
    render(<Portal locale="ar" proposalCopy={getDictionary("ar").portalProposal} workCopy={workCopyFor("ar")} />);
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith("/ar/portal/control-center"));
  });

  it("keeps a Finance officer in their workspace, with the Control Center in the account menu", async () => {
    auth.me = meWith(["WORK_QUEUE_VIEW", "COMMERCIAL_POLICY_READ", "COMMERCIAL_POLICY_MANAGE", "PAYMENT_RECORD", "REFERENCE_DATA_READ"], { roles: ["FINANCE", "ACCOUNT_HOLDER"], workspaces: ["FINANCE"] });
    vi.mocked(apiFetchAs).mockImplementation(fakeApi({ "/finance/cases": [], "/work/mine": [] }));
    render(<Portal locale="en" proposalCopy={getDictionary("en").portalProposal} workCopy={workCopyFor("en")} />);
    fireEvent.click(await screen.findByLabelText("Account: Rana Adel"));
    expect(await screen.findByRole("link", { name: "Control Center" })).toHaveAttribute("href", "/en/portal/control-center");
    expect(router.replace).not.toHaveBeenCalled();
    expect(screen.getByRole("link", { name: "Margin & deposit policies" })).toHaveAttribute("href", "/en/portal/control-center/commercial/margin-deposit");
  });

  it("offers no Control Center entry to a Coordinator who cannot open any area", async () => {
    auth.me = meWith(["WORK_QUEUE_VIEW", "COORDINATION_QUEUE", "REFERENCE_DATA_READ"], { roles: ["COORDINATOR", "ACCOUNT_HOLDER"], workspaces: ["COORDINATION"] });
    vi.mocked(apiFetchAs).mockImplementation(fakeApi({ "/coordinator/cases": [], "/work/mine": [] }));
    render(<Portal locale="en" proposalCopy={getDictionary("en").portalProposal} workCopy={workCopyFor("en")} />);
    fireEvent.click(await screen.findByLabelText("Account: Rana Adel"));
    expect(screen.queryByRole("link", { name: "Control Center" })).not.toBeInTheDocument();
    expect(vi.mocked(apiFetchAs).mock.calls.map(([, p]) => p)).not.toContain("/admin/access/me");
  });
});

describe("Patient-side accounts land in My Care", () => {
  it("opens My Care for an account with no workforce workspace and binds it to its patient record", async () => {
    auth.me = meWith([], { roles: ["ACCOUNT_HOLDER"], workspaces: [] });
    vi.mocked(apiFetchAs).mockImplementation(fakeApi({ "POST /patient/account/session": { linked: true, currentCaseId: null, accountStatus: "ACTIVE" }, "/patient/cases": [], "/work/mine": [] }));
    render(<Portal locale="en" proposalCopy={getDictionary("en").portalProposal} workCopy={workCopyFor("en")} />);
    expect(await screen.findByText("No active case yet")).toBeVisible();
    expect(apiFetchAs).toHaveBeenCalledWith("test", "/patient/account/session", expect.objectContaining({ method: "POST" }));
    // Once the account is bound, /api/v1/me is re-read so the Patient role takes effect.
    await waitFor(() => expect(auth.refreshMe).toHaveBeenCalled());
    expect(router.replace).not.toHaveBeenCalled();
  });

  it("keeps staff out of the patient flow", async () => {
    auth.me = meWith(["WORK_QUEUE_VIEW", "COORDINATION_QUEUE"], { roles: ["COORDINATOR", "ACCOUNT_HOLDER"], workspaces: ["COORDINATION"] });
    vi.mocked(apiFetchAs).mockImplementation(fakeApi({ "/coordinator/cases": [], "/work/mine": [] }));
    render(<Portal locale="en" proposalCopy={getDictionary("en").portalProposal} workCopy={workCopyFor("en")} />);
    await screen.findByLabelText("Account: Rana Adel");
    expect(vi.mocked(apiFetchAs).mock.calls.map(([, p]) => String(p)).filter((p) => p.startsWith("/patient"))).toEqual([]);
  });
});
