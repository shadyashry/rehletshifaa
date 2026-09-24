import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { Portal } from "./Portal";
import { apiFetchAs } from "@/lib/api";
import { fakeApi } from "@/components/platform-control-center/test-support";

const auth = vi.hoisted(() => ({ user: { access_token: "test", profile: { sub: "u1", name: "Rana Adel" } }, roles: [] as string[], loading: false, signIn: vi.fn(), signOut: vi.fn() }));
const router = vi.hoisted(() => ({ replace: vi.fn(), push: vi.fn() }));
vi.mock("@/components/AuthProvider", () => ({ useAuth: () => auth }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));
vi.mock("@/lib/api", () => ({ apiFetchAs: vi.fn(), SITE_URL: "https://example.org", OIDC_AUTHORITY: "https://auth.example/realms/r" }));

beforeEach(() => { const slot = document.createElement("div"); slot.id = "portal-account-slot"; document.body.appendChild(slot); });
afterEach(() => { cleanup(); vi.clearAllMocks(); document.getElementById("portal-account-slot")?.remove(); auth.roles = []; });

describe("One way into the Control Center", () => {
  it("takes an administration-only account straight to the Control Center — no 'Administration has moved' hop", async () => {
    auth.roles = ["SYSTEM_ADMIN"];
    vi.mocked(apiFetchAs).mockImplementation(fakeApi({}, []));
    render(<Portal locale="en" />);
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith("/en/portal/control-center"));
    expect(screen.getByText("Opening the Control Center…")).toBeVisible();
    expect(screen.queryByText(/Administration has moved/)).not.toBeInTheDocument();
  });

  it("does the same for an identity-review-only account", async () => {
    auth.roles = ["PATIENT_IDENTITY_REVIEWER"];
    vi.mocked(apiFetchAs).mockImplementation(fakeApi({}, []));
    render(<Portal locale="ar" />);
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith("/ar/portal/control-center"));
  });

  it("keeps a mixed-role person in their workspace, with the Control Center in the account menu and no admin tab", async () => {
    auth.roles = ["FINANCE", "FINANCE_LEAD", "SYSTEM_ADMIN"];
    vi.mocked(apiFetchAs).mockImplementation(fakeApi({ "/finance/cases": [], "/work/mine": [] }, []));
    render(<Portal locale="en" />);
    fireEvent.click(await screen.findByLabelText("Account: Rana Adel"));
    expect(await screen.findByRole("link", { name: "Control Center" })).toHaveAttribute("href", "/en/portal/control-center");
    expect(router.replace).not.toHaveBeenCalled();
    // One workspace remains (Finance), so there is no role switcher offering "Administration".
    expect(screen.queryByRole("button", { name: /Administration|Platform administration/ })).not.toBeInTheDocument();
    // Margin & deposit policies moved to Control Center › Commercial; the workspace keeps one contextual link.
    expect(screen.getByRole("link", { name: "Margin & deposit policies" })).toHaveAttribute("href", "/en/portal/control-center/commercial/margin-deposit");
    expect(screen.queryByText("Financial policies")).not.toBeInTheDocument();
  });

  it("offers no Control Center entry to someone who cannot open any area", async () => {
    auth.roles = ["COORDINATOR"];
    vi.mocked(apiFetchAs).mockImplementation(fakeApi({ "/coordinator/cases": [], "/work/mine": [] }, []));
    render(<Portal locale="en" />);
    fireEvent.click(await screen.findByLabelText("Account: Rana Adel"));
    await waitFor(() => expect(apiFetchAs).toHaveBeenCalledWith("test", "/admin/access/me"));
    expect(screen.queryByRole("link", { name: "Control Center" })).not.toBeInTheDocument();
  });
});

describe("Provider Workspace landing (UX-4)", () => {
  const practice = { practices: [{ organizationId: "org-a", organizationName: "Al Noor Practice", organizationStatus: "ONBOARDING", roles: ["CONSULTANT"], clinician: null, relationships: [], managedClinicians: [], managedCliniciansTruncated: false, organizationCapabilities: [] }], truncated: false };
  afterEach(() => window.history.replaceState({}, "", "/"));

  it("sends a provider person to My Practice even though the identity system gave the account its default PATIENT role", async () => {
    auth.roles = ["PATIENT"];
    vi.mocked(apiFetchAs).mockImplementation(fakeApi({ "/provider-workspace/me": practice }, []));
    render(<Portal locale="en" />);
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith("/en/portal/practice"));
    expect(screen.getByText("Opening My Practice…")).toBeVisible();
    expect(screen.queryByText("No active case yet")).not.toBeInTheDocument();
    // The hop loads no patient data for a provider person.
    expect(vi.mocked(apiFetchAs).mock.calls.map(([, path]) => path).filter((p) => String(p).startsWith("/patient") || p === "/work/mine")).toEqual([]);
  });

  it("keeps My Care reachable from the workspace switch, with My Practice one link away", async () => {
    auth.roles = ["PATIENT"];
    window.history.replaceState({}, "", "/en/portal?workspace=care");
    vi.mocked(apiFetchAs).mockImplementation(fakeApi({ "/provider-workspace/me": practice, "POST /patient/account/session": { linked: false, currentCaseId: null, accountStatus: "ACTIVE" }, "/patient/cases": [], "/work/mine": [] }, []));
    render(<Portal locale="en" />);
    expect(await screen.findByRole("link", { name: "My Practice" })).toHaveAttribute("href", "/en/portal/practice");
    expect(router.replace).not.toHaveBeenCalled();
  });

  it("keeps RehletShifaa staff in their workspace and offers My Practice as a switch", async () => {
    auth.roles = ["COORDINATOR"];
    vi.mocked(apiFetchAs).mockImplementation(fakeApi({ "/provider-workspace/me": practice, "/coordinator/cases": [], "/work/mine": [] }, []));
    render(<Portal locale="en" />);
    expect(await screen.findByRole("link", { name: "My Practice" })).toHaveAttribute("href", "/en/portal/practice");
    expect(router.replace).not.toHaveBeenCalled();
  });

  it("leaves a patient without any provider relationship in My Care", async () => {
    auth.roles = ["PATIENT"];
    vi.mocked(apiFetchAs).mockImplementation(fakeApi({ "/provider-workspace/me": { practices: [], truncated: false }, "POST /patient/account/session": { linked: false, currentCaseId: null, accountStatus: "ACTIVE" }, "/patient/cases": [], "/work/mine": [] }, []));
    render(<Portal locale="en" />);
    expect(await screen.findByText("No active case yet")).toBeVisible();
    expect(router.replace).not.toHaveBeenCalled();
    expect(screen.queryByRole("link", { name: "My Practice" })).not.toBeInTheDocument();
  });
});
