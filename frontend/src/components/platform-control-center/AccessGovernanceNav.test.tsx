import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { AccessGovernanceNav } from "./AccessGovernanceNav";
import { apiFetchAs } from "@/lib/api";

const auth = { user: { access_token: "test", profile: { sub: "owner" } }, loading: false, signIn: vi.fn() };
vi.mock("@/components/AuthProvider", () => ({ useAuth: () => auth }));
vi.mock("@/lib/api", () => ({ apiFetchAs: vi.fn() }));

afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe("Access Governance navigation section", () => {
  it("links into the existing Access Governance tabs by deep link, never a second implementation", async () => {
    vi.mocked(apiFetchAs).mockResolvedValue(new Response(JSON.stringify([{ permission: "access.role.view", allowed: true }]), { status: 200 }));
    render(<AccessGovernanceNav locale="en" />);
    expect(await screen.findByRole("link", { name: /Roles/ })).toHaveAttribute("href", "/en/portal/access?tab=roles");
    expect(screen.getByRole("link", { name: /Permissions/ })).toHaveAttribute("href", "/en/portal/access?tab=permissions");
    expect(screen.getByRole("link", { name: /Effective access/ })).toHaveAttribute("href", "/en/portal/access?tab=effective");
    expect(screen.getByRole("link", { name: /Audit/ })).toHaveAttribute("href", "/en/portal/access?tab=audit");
  });
  it("renders nothing without access.role.view (fail-closed navigation)", async () => {
    vi.mocked(apiFetchAs).mockResolvedValue(new Response(JSON.stringify([{ permission: "access.role.view", allowed: false }]), { status: 200 }));
    const { container } = render(<AccessGovernanceNav locale="en" />);
    await waitFor(() => expect(apiFetchAs).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });
});
