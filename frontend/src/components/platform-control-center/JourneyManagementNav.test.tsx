import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { JourneyManagementNav } from "./JourneyManagementNav";
import { apiFetchAs } from "@/lib/api";

const auth = { user: { access_token: "test", profile: { sub: "owner" } }, loading: false, signIn: vi.fn() };
vi.mock("@/components/AuthProvider", () => ({ useAuth: () => auth }));
vi.mock("@/lib/api", () => ({ apiFetchAs: vi.fn() }));

afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe("Journey Management navigation section", () => {
  it("links into the journey list only when journey.view is allowed", async () => {
    vi.mocked(apiFetchAs).mockResolvedValue(new Response(JSON.stringify([{ permission: "journey.view", allowed: true }]), { status: 200 }));
    render(<JourneyManagementNav locale="en" />);
    expect(await screen.findByRole("link", { name: /Journeys/ })).toHaveAttribute("href", "/en/portal/journeys");
  });
  it("marks the link current when active", async () => {
    vi.mocked(apiFetchAs).mockResolvedValue(new Response(JSON.stringify([{ permission: "journey.view", allowed: true }]), { status: 200 }));
    render(<JourneyManagementNav locale="en" active />);
    expect(await screen.findByRole("link", { name: /Journeys/ })).toHaveAttribute("aria-current", "page");
  });
  it("renders nothing without journey.view (fail-closed navigation)", async () => {
    vi.mocked(apiFetchAs).mockResolvedValue(new Response(JSON.stringify([{ permission: "journey.view", allowed: false }]), { status: 200 }));
    const { container } = render(<JourneyManagementNav locale="en" />);
    await waitFor(() => expect(apiFetchAs).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });
});
