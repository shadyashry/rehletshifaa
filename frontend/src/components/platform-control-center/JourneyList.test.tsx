import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { JourneyList } from "./JourneyList";
import { apiFetchAs } from "@/lib/api";

vi.mock("@/components/AuthProvider", () => {
  const auth = { user: { access_token: "test", profile: { sub: "owner" } }, loading: false, signIn: vi.fn() };
  return { useAuth: () => auth };
});
vi.mock("@/lib/api", () => ({ apiFetchAs: vi.fn() }));

const journey = { id: "def-1", key: "INTERNATIONAL_CARE", name: "International Care Journey", createdAt: "2026-09-01T00:00:00Z" };

beforeEach(() => {
  vi.mocked(apiFetchAs).mockImplementation(async (_token, path) => {
    if (path.endsWith("/admin/access/me")) return new Response(JSON.stringify([{ permission: "journey.view", allowed: true }, { permission: "journey.create", allowed: true }]), { status: 200 });
    if (path === "/admin/journeys") return new Response(JSON.stringify([journey]), { status: 200 });
    return new Response(JSON.stringify({}), { status: 200 });
  });
});
afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe("Journey list", () => {
  it("renders real journeys from the backend", async () => {
    render(<JourneyList locale="en" />);
    expect(await screen.findByRole("link", { name: /International Care Journey/ })).toBeVisible();
    expect(screen.getByRole("button", { name: /New journey/ })).toBeVisible();
  });

  it("supports Arabic RTL rendering", async () => {
    const { container } = render(<JourneyList locale="ar" />);
    await screen.findByRole("link", { name: /International Care Journey/ });
    expect(container.querySelector(".cc")).toHaveAttribute("dir", "rtl");
  });

  it("fails closed when the caller lacks journey.view", async () => {
    vi.mocked(apiFetchAs).mockResolvedValue(new Response(JSON.stringify([{ permission: "journey.view", allowed: false }]), { status: 200 }));
    render(<JourneyList locale="en" />);
    expect(await screen.findByText(/You do not have access/)).toBeVisible();
    expect(screen.queryByRole("button", { name: /New journey/ })).not.toBeInTheDocument();
  });

  it("renders a recoverable error without stale data", async () => {
    vi.mocked(apiFetchAs).mockRejectedValue(new Error("boom"));
    render(<JourneyList locale="en" />);
    // The page's own error, plus the shell's truthful "sections couldn't be loaded" (never "no access").
    expect((await screen.findAllByRole("alert")).some((a) => a.textContent === "boom")).toBe(true);
    expect(screen.getByText("Some sections couldn't be loaded.")).toBeVisible();
    expect(screen.getByRole("button", { name: /Refresh/ })).toBeEnabled();
  });

  it("shows the empty state when no journey has been created yet", async () => {
    vi.mocked(apiFetchAs).mockImplementation(async (_token, path) => {
      if (path.endsWith("/admin/access/me")) return new Response(JSON.stringify([{ permission: "journey.view", allowed: true }]), { status: 200 });
      if (path === "/admin/journeys") return new Response(JSON.stringify([]), { status: 200 });
      return new Response(JSON.stringify({}), { status: 200 });
    });
    render(<JourneyList locale="en" />);
    expect(await screen.findByText(/No journeys have been created yet/)).toBeVisible();
  });
});
