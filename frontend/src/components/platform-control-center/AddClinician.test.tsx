import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { AddClinician } from "./AddClinician";
import { apiFetchAs } from "@/lib/api";
import { fakeApi, organization, providerDetail } from "./test-support";

const auth = vi.hoisted(() => ({ user: { access_token: "test", profile: { sub: "ops" } }, roles: [] as string[], loading: false, signIn: vi.fn() }));
const router = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn() }));
vi.mock("@/components/AuthProvider", () => ({ useAuth: () => auth }));
vi.mock("@/lib/api", () => ({ apiFetchAs: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));

const caps = ["provider.view", "provider.clinician.invite"];
const routes = { "/admin/providers": [organization], "/admin/providers/org-a": providerDetail };
beforeEach(() => { auth.roles = []; vi.mocked(apiFetchAs).mockImplementation(fakeApi(routes, caps)); });
afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe("Add clinician — a short invitation, then Consultant Setup", () => {
  it("asks only for the invitation facts; the required audit note is prefilled under its own disclosure", async () => {
    render(<AddClinician locale="en" />);
    await waitFor(() => expect(screen.getByLabelText(/Provider Organization/)).toHaveValue("org-a"));
    const labels = Array.from(document.querySelectorAll(".cc-form-grid .cc-field-label")).map((l) => l.textContent?.replace(" *", ""));
    expect(labels).toEqual(["Full name", "Work email", "Provider Organization", "Clinician type", "Invitation language"]);
    expect(screen.getByText("Audit note").closest("details")).not.toHaveAttribute("open");
    expect(screen.getByLabelText(/Note for the audit trail/)).toHaveValue("New clinician invited from the Control Center");
    expect(screen.queryByRole("list", { name: "Setup steps" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Send invitation" }));
    expect(screen.getAllByText("This field is required.").length).toBe(2);
    expect(apiFetchAs).not.toHaveBeenCalledWith("test", expect.stringContaining("/members/invite"), expect.anything());
  });

  it("invites with the unchanged API and opens Consultant Setup for the new clinician", async () => {
    vi.mocked(apiFetchAs).mockImplementation(fakeApi({ ...routes, "POST /admin/providers/org-a/members/invite": { id: "op-1", organizationId: "org-a", subject: "kc-consultant", status: "COMPLETED" } }, caps));
    render(<AddClinician locale="en" />);
    await waitFor(() => expect(screen.getByLabelText(/Provider Organization/)).toHaveValue("org-a"));
    fireEvent.change(screen.getByLabelText(/Full name/), { target: { value: "Dr Salma Farouk" } });
    fireEvent.change(screen.getByLabelText(/Work email/), { target: { value: "salma@example.test" } });
    fireEvent.click(screen.getByRole("button", { name: "Send invitation" }));
    await waitFor(() => expect(router.push).toHaveBeenCalledWith("/en/portal/control-center/providers/clinicians/org-a/prac-1?tab=setup&invited=1"));
    const call = vi.mocked(apiFetchAs).mock.calls.find(([, p]) => p === "/admin/providers/org-a/members/invite")!;
    expect(JSON.parse(String(call[2]!.body))).toEqual({ name: "Dr Salma Farouk", email: "salma@example.test", role: "CONSULTANT", locale: "en", reason: "New clinician invited from the Control Center" });
  });

  it("offers Direct with RehletShifaa only to accounts that have it, with its own required facts and unchanged endpoint", async () => {
    auth.roles = ["CREDENTIALING_ADMIN"];
    vi.mocked(apiFetchAs).mockImplementation(fakeApi({ ...routes, "POST /admin/practitioners": { id: "p-77" } }, caps));
    render(<AddClinician locale="en" />);
    fireEvent.click(await screen.findByRole("radio", { name: /Direct with RehletShifaa/ }));
    expect(screen.queryByRole("combobox", { name: /Provider Organization/ })).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/Full name/), { target: { value: "Dr Omar Said" } });
    fireEvent.change(screen.getByLabelText(/Work email/), { target: { value: "omar@example.test" } });
    fireEvent.change(screen.getByLabelText(/^Specialty/), { target: { value: "Cardiology" } });
    fireEvent.change(screen.getByLabelText(/Care area/), { target: { value: "cardiology" } });
    fireEvent.click(screen.getByRole("button", { name: "Send invitation" }));
    await waitFor(() => expect(router.push).toHaveBeenCalledWith("/en/portal/control-center/providers/clinicians/direct/p-77?invited=1"));
  });

  it("keeps a half-finished sign-in account recoverable", async () => {
    vi.mocked(apiFetchAs).mockImplementation(fakeApi({ ...routes, "POST /admin/providers/org-a/members/invite": { id: "op-9", organizationId: "org-a", subject: null, status: "IDENTITY_PENDING" } }, caps));
    render(<AddClinician locale="en" />);
    await waitFor(() => expect(screen.getByLabelText(/Provider Organization/)).toHaveValue("org-a"));
    fireEvent.change(screen.getByLabelText(/Full name/), { target: { value: "Dr Salma Farouk" } });
    fireEvent.change(screen.getByLabelText(/Work email/), { target: { value: "salma@example.test" } });
    fireEvent.click(screen.getByRole("button", { name: "Send invitation" }));
    expect(await screen.findByRole("button", { name: "Finish account setup" })).toBeVisible();
  });
});
