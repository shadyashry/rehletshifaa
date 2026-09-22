import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { CareCoordinationNav } from "./CareCoordinationNav";
import { apiFetchAs } from "@/lib/api";

const auth = { user: { access_token: "test", profile: { sub: "owner" } }, loading: false, signIn: vi.fn() };
vi.mock("@/components/AuthProvider", () => ({ useAuth: () => auth }));
vi.mock("@/lib/api", () => ({ apiFetchAs: vi.fn() }));

afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe("Care Coordination navigation section", () => {
  it("links into the org picker when any assignment view/manage capability is allowed", async () => {
    vi.mocked(apiFetchAs).mockResolvedValue(new Response(JSON.stringify([{ permission: "assignment.queue.manage", allowed: true }]), { status: 200 }));
    render(<CareCoordinationNav locale="en" />);
    expect(await screen.findByRole("link", { name: /Care Coordination/ })).toHaveAttribute("href", "/en/portal/control-center/coordination");
  });
  it("renders nothing without any assignment capability (fail-closed navigation)", async () => {
    vi.mocked(apiFetchAs).mockResolvedValue(new Response(JSON.stringify([{ permission: "assignment.team.view", allowed: false }]), { status: 200 }));
    const { container } = render(<CareCoordinationNav locale="en" />);
    await waitFor(() => expect(apiFetchAs).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });
});
