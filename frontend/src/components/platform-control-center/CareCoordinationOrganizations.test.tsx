import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { CareCoordinationOrganizations } from "./CareCoordinationOrganizations";
import { apiFetchAs } from "@/lib/api";

vi.mock("@/components/AuthProvider", () => {
  const auth = { user: { access_token: "test", profile: { sub: "coordination-manager" } }, loading: false, signIn: vi.fn() };
  return { useAuth: () => auth };
});
vi.mock("@/lib/api", () => ({ apiFetchAs: vi.fn() }));

const org = { id: "org-1", displayName: "Nile Care Clinic", type: "CLINIC", status: "ACTIVE" };

beforeEach(() => {
  vi.mocked(apiFetchAs).mockImplementation(async (_token, path) => {
    if (path === "/admin/coordination/organizations") return new Response(JSON.stringify([org]), { status: 200 });
    return new Response(JSON.stringify({}), { status: 200 });
  });
});
afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe("Care Coordination organization picker", () => {
  it("renders organizations the caller can coordinate for, without requiring provider.view", async () => {
    render(<CareCoordinationOrganizations locale="en" />);
    expect(await screen.findByRole("link", { name: /Nile Care Clinic/ })).toHaveAttribute("href", "/en/portal/control-center/coordination/org-1");
  });

  it("shows a denied state when the picker returns no organizations", async () => {
    vi.mocked(apiFetchAs).mockImplementation(async (_token, path) => {
      if (path === "/admin/coordination/organizations") return new Response(JSON.stringify([]), { status: 200 });
      return new Response(JSON.stringify({}), { status: 200 });
    });
    render(<CareCoordinationOrganizations locale="en" />);
    expect(await screen.findByText(/You do not have access/)).toBeVisible();
  });

  it("supports Arabic RTL rendering", async () => {
    const { container } = render(<CareCoordinationOrganizations locale="ar" />);
    await screen.findByRole("link", { name: /Nile Care Clinic/ });
    expect(container.querySelector(".cc")).toHaveAttribute("dir", "rtl");
  });
});
