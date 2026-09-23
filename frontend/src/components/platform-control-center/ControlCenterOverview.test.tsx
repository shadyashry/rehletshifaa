import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { ControlCenterOverview } from "./ControlCenterOverview";
import { apiFetchAs } from "@/lib/api";
import { fakeApi, organization, providerDetail } from "./test-support";

const auth = vi.hoisted(() => ({ user: { access_token: "test", profile: { sub: "owner" } }, roles: [] as string[], loading: false, signIn: vi.fn() }));
vi.mock("@/components/AuthProvider", () => ({ useAuth: () => auth }));
vi.mock("@/lib/api", () => ({ apiFetchAs: vi.fn() }));
afterEach(() => { cleanup(); vi.clearAllMocks(); auth.roles = []; });

describe("Control Center overview", () => {
  it("counts only real waiting work the caller can read and links each item to where it is done", async () => {
    vi.mocked(apiFetchAs).mockImplementation(fakeApi({
      "/admin/providers": [organization], "/admin/providers/org-a": providerDetail,
      "/admin/providers/org-a/credential-reviews": [{ id: "r1" }, { id: "r2" }],
    }, ["provider.view", "credential.review", "provider.clinician.invite"]));
    render(<ControlCenterOverview locale="en" />);
    const reviews = await screen.findByRole("link", { name: /Credentials waiting for review/ });
    expect(reviews).toHaveTextContent("2");
    expect(reviews).toHaveAttribute("href", "/en/portal/control-center/credentials");
    expect(screen.getByRole("link", { name: /Organizations still being set up/ })).toHaveTextContent("1");
    expect(screen.getByRole("link", { name: /People waiting for membership activation/ })).toHaveTextContent("1");
    expect(screen.queryByText(/Cases waiting for a coordinator/)).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Add consultant" })).toHaveAttribute("href", "/en/portal/control-center/providers/onboarding/new");
    expect(screen.getByRole("heading", { name: "What do you want to manage?" })).toBeVisible();
    expect(screen.getByRole("link", { name: /Organizations Hospitals, clinics/ })).toBeVisible();
  });

  it("shows a calm empty state instead of zero-value tiles", async () => {
    vi.mocked(apiFetchAs).mockImplementation(fakeApi({ "/admin/providers": [] }, ["provider.view", "credential.review"]));
    render(<ControlCenterOverview locale="en" />);
    expect(await screen.findByText("Nothing is waiting for you")).toBeVisible();
    expect(screen.queryByText("0")).not.toBeInTheDocument();
  });

  it("tells an account without any area what to do", async () => {
    vi.mocked(apiFetchAs).mockImplementation(fakeApi({}, []));
    render(<ControlCenterOverview locale="ar" />);
    expect(await screen.findByText("لا توجد أقسام متاحة لحسابك")).toBeVisible();
  });
});
