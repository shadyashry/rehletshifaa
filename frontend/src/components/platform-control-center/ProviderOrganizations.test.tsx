import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { ProviderOrganizations } from "./ProviderOrganizations";
import { ControlCenterNavigation } from "./ControlCenterNavigation";
import { apiFetchAs } from "@/lib/api";
import { failure, fakeApi, organization } from "./test-support";

vi.mock("@/components/AuthProvider", () => {
  const auth = { user: { access_token: "test", profile: { sub: "owner" } }, roles: [], loading: false, signIn: vi.fn() };
  return { useAuth: () => auth };
});
vi.mock("@/lib/api", () => ({ apiFetchAs: vi.fn() }));

const active = { ...organization, id: "org-1", status: "ACTIVE" };
beforeEach(() => { vi.mocked(apiFetchAs).mockImplementation(fakeApi({ "/admin/providers": [active] }, ["provider.view", "provider.create"])); });
afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe("Provider organizations list", () => {
  it("answers who we work with in business status language, with one primary action", async () => {
    render(<ProviderOrganizations locale="en" />);
    expect(await screen.findByRole("link", { name: "Nile Care Clinic" })).toHaveAttribute("href", "/en/portal/control-center/providers/org-1");
    expect(screen.getByText("Active")).toBeVisible();
    expect(screen.getByRole("heading", { level: 1, name: "Organizations" })).toBeVisible();
    expect(screen.getByRole("button", { name: /Add organization/ })).toBeVisible();
    expect(screen.queryByText("org-1")).not.toBeInTheDocument();
  });

  it("creates an organization from a focused dialog with field-level validation", async () => {
    render(<ProviderOrganizations locale="en" />);
    fireEvent.click(await screen.findByRole("button", { name: /Add organization/ }));
    const dialog = screen.getByRole("dialog", { name: "Add organization" });
    fireEvent.click(screen.getAllByRole("button", { name: "Add organization" }).at(-1)!);
    expect(dialog).toHaveTextContent("This field is required.");
    fireEvent.change(screen.getByLabelText(/Legal name/), { target: { value: "Delta Health LLC" } });
    fireEvent.change(screen.getByLabelText(/Display name/), { target: { value: "Delta Health" } });
    fireEvent.click(screen.getAllByRole("button", { name: "Add organization" }).at(-1)!);
    await waitFor(() => expect(apiFetchAs).toHaveBeenCalledWith("test", "/admin/providers", expect.objectContaining({ method: "POST" })));
    expect(await screen.findByText("Delta Health was added.")).toBeVisible();
  });

  it("supports Arabic RTL rendering", async () => {
    const { container } = render(<ProviderOrganizations locale="ar" />);
    await screen.findByRole("link", { name: "Nile Care Clinic" });
    expect(container.querySelector(".cc")).toHaveAttribute("dir", "rtl");
    expect(screen.getByText("نشطة")).toBeVisible();
  });

  it("fails closed when the caller lacks provider.view", async () => {
    vi.mocked(apiFetchAs).mockImplementation(fakeApi({}, []));
    const navigation = render(<ControlCenterNavigation locale="en" />);
    await waitFor(() => expect(apiFetchAs).toHaveBeenCalled());
    expect(screen.queryByRole("link", { name: /Control Center/ })).not.toBeInTheDocument();
    navigation.unmount();
    render(<ProviderOrganizations locale="en" />);
    expect(await screen.findByText(/You do not have access/)).toBeVisible();
    expect(screen.queryByRole("button", { name: /Add organization/ })).not.toBeInTheDocument();
  });

  it("shows an actionable, recoverable error instead of a raw code", async () => {
    vi.mocked(apiFetchAs).mockImplementation(fakeApi({ "/admin/providers": failure(500, "REQUEST_FAILED") }, ["provider.view"]));
    render(<ProviderOrganizations locale="en" />);
    expect(await screen.findByRole("alert")).toHaveTextContent("We couldn't load this information. Try again.");
    expect(screen.getByRole("alert")).toHaveTextContent("REQUEST_FAILED");
    expect(screen.getByRole("button", { name: "Try again" })).toBeEnabled();
  });

  it("shows a useful empty state", async () => {
    vi.mocked(apiFetchAs).mockImplementation(fakeApi({ "/admin/providers": [] }, ["provider.view", "provider.create"]));
    render(<ProviderOrganizations locale="en" />);
    expect(await screen.findByText("No organizations yet")).toBeVisible();
    expect(screen.getByText(/Add your first organization/)).toBeVisible();
  });
});
