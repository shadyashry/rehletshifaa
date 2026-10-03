import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { apiFetchAs } from "@/lib/api";
import type { Me } from "@/lib/access";
import { fakeApi, meWith } from "./test-support";
import { PeoplePage } from "./WorkforcePages";

const auth = vi.hoisted(() => ({
  user: { access_token: "test", profile: { sub: "admin", auth_time: Math.floor(Date.now() / 1000), acr: "3" } },
  me: null as Me | null,
  roles: [] as string[],
  loading: false,
  meFailed: false,
  refreshMe: vi.fn(),
  signIn: vi.fn(),
  signOut: vi.fn(),
}));

vi.mock("@/components/AuthProvider", () => ({ useAuth: () => auth }));
vi.mock("@/lib/api", () => ({ apiFetchAs: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn(), push: vi.fn() }) }));

const directory = {
  people: [{
    subject: "lean-worker", name: "Lean Worker", email: "lean@example.test", lifecycle: "ACTIVE",
    roles: ["COORDINATOR", "OPERATIONS", "SYSTEM_ADMINISTRATOR"], activatedAt: null, lastSignInAt: null, revision: 4,
  }],
  invitations: [],
};

beforeEach(() => {
  auth.me = meWith(["WORKFORCE_READ", "WORKFORCE_ADMINISTER"]);
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  auth.me = null;
});

describe("Workforce multi-role controls", () => {
  it("shows every held role and submits multiple ordinary roles from Invite Person", async () => {
    vi.mocked(apiFetchAs).mockImplementation(fakeApi({
      "/admin/platform-access/staff": directory,
      "POST /admin/platform-access/staff/invitations": {},
    }));
    render(<PeoplePage locale="en" />);

    expect(await screen.findByText(/Care Coordinator · Operations Specialist · System Administrator/)).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Invite person" }));
    const dialog = screen.getByRole("dialog", { name: "Invite a person" });
    expect(within(dialog).queryByRole("checkbox", { name: "System Administrator" })).not.toBeInTheDocument();
    fireEvent.change(within(dialog).getByLabelText(/Full name/), { target: { value: "New Lean Worker" } });
    fireEvent.change(within(dialog).getByLabelText(/Work email/), { target: { value: "new.lean@example.test" } });
    fireEvent.click(within(dialog).getByRole("checkbox", { name: "Care Coordinator" }));
    fireEvent.click(within(dialog).getByRole("checkbox", { name: "Operations Specialist" }));
    fireEvent.change(within(dialog).getByLabelText(/Reason/), { target: { value: "Lean staffing" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Send invitation" }));

    await waitFor(() => expect(apiFetchAs).toHaveBeenCalledWith("test", "/admin/platform-access/staff/invitations",
      expect.objectContaining({ method: "POST", body: expect.stringContaining('"roles":["COORDINATOR","OPERATIONS"]') })));
  });

  it("changes ordinary roles independently while keeping System Administrator outside the selector", async () => {
    vi.mocked(apiFetchAs).mockImplementation(fakeApi({
      "/admin/platform-access/staff": directory,
      "POST /admin/platform-access/staff/lean-worker/job": {},
    }));
    render(<PeoplePage locale="en" />);

    fireEvent.click(await screen.findByRole("button", { name: "Change roles" }));
    const dialog = screen.getByRole("dialog", { name: "Roles of Lean Worker" });
    expect(within(dialog).getByRole("checkbox", { name: "Care Coordinator" })).toBeChecked();
    expect(within(dialog).getByRole("checkbox", { name: "Operations Specialist" })).toBeChecked();
    expect(within(dialog).queryByRole("checkbox", { name: "System Administrator" })).not.toBeInTheDocument();
    expect(within(dialog).getByText(/two-person approval/)).toBeVisible();

    fireEvent.click(within(dialog).getByRole("checkbox", { name: "Operations Specialist" }));
    fireEvent.click(within(dialog).getByRole("checkbox", { name: "Finance Officer" }));
    fireEvent.change(within(dialog).getByLabelText(/Reason/), { target: { value: "Coverage change" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save roles" }));

    await waitFor(() => expect(apiFetchAs).toHaveBeenCalledWith("test", "/admin/platform-access/staff/lean-worker/job",
      expect.objectContaining({ method: "POST", body: expect.stringContaining('"grant":["FINANCE"],"revoke":["OPERATIONS"]') })));
  });
});
