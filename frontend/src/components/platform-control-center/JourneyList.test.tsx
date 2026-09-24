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

const summary = { id: "def-1", key: "INTERNATIONAL_CARE", name: "International Care Journey", createdAt: "2026-09-01T00:00:00Z", liveVersion: 2, livePublishedAt: "2026-09-10T00:00:00Z", publishedVersions: 1, draftVersion: 3, draftStatus: "PENDING_APPROVAL", versions: 3, lastActivityAt: "2026-09-20T00:00:00Z" };
const serve = (rows: unknown[], caps = ["journey.view", "journey.create"]) => vi.mocked(apiFetchAs).mockImplementation(async (_token, path) => {
  if (path.endsWith("/admin/access/me")) return new Response(JSON.stringify(caps.map((permission) => ({ permission, allowed: true }))), { status: 200 });
  if (path === "/admin/journeys/summaries") return new Response(JSON.stringify(rows), { status: 200 });
  return new Response(JSON.stringify({}), { status: 200 });
});
beforeEach(() => { serve([summary]); });
afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe("Care Journeys list", () => {
  it("shows what is published, what is changing and what needs review, from one bounded read", async () => {
    render(<JourneyList locale="en" />);
    const card = await screen.findByRole("link", { name: /International Care Journey/ });
    expect(card).toHaveTextContent("Needs approval");
    expect(card).toHaveTextContent("PublishedVersion 2 · Published on");
    expect(card).toHaveTextContent("Change in progressVersion 3 · Waiting for approval");
    expect(card).toHaveTextContent("Last activity");
    expect(screen.getByRole("heading", { level: 1, name: "Care Journeys" })).toBeVisible();
    // Engine detail and fabricated metrics are not on the list.
    expect(card.textContent).not.toMatch(/INTERNATIONAL_CARE|deploy|runtime|hash|SLA|cases per/i);
    expect(vi.mocked(apiFetchAs).mock.calls.map(([, p]) => p).filter((p) => p.startsWith("/admin/journeys"))).toEqual(["/admin/journeys/summaries"]);
  });

  it("offers creation only while no journey exists (the backend supports exactly one)", async () => {
    render(<JourneyList locale="en" />);
    await screen.findByRole("link", { name: /International Care Journey/ });
    expect(screen.queryByRole("button", { name: /New journey/ })).not.toBeInTheDocument();
    cleanup(); serve([]);
    render(<JourneyList locale="en" />);
    expect(await screen.findByText(/No care journey has been created yet/)).toBeVisible();
    expect(screen.getByRole("button", { name: /New journey/ })).toBeVisible();
  });

  it("says nothing is published when nothing is", async () => {
    serve([{ ...summary, liveVersion: null, livePublishedAt: null, publishedVersions: 0, draftStatus: "DRAFT", draftVersion: 1, versions: 1 }]);
    render(<JourneyList locale="en" />);
    const card = await screen.findByRole("link", { name: /International Care Journey/ });
    expect(card).toHaveTextContent("Nothing published yet");
    expect(card).not.toHaveTextContent("Needs approval");
  });

  it("supports Arabic RTL rendering", async () => {
    const { container } = render(<JourneyList locale="ar" />);
    await screen.findByRole("link", { name: /International Care Journey/ });
    expect(container.querySelector(".cc")).toHaveAttribute("dir", "rtl");
    expect(screen.getByRole("heading", { level: 1, name: "رحلات الرعاية" })).toBeVisible();
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
    expect((await screen.findAllByRole("alert")).some((a) => a.textContent?.startsWith("boom"))).toBe(true);
    expect(screen.getByText("Some sections couldn't be loaded.")).toBeVisible();
    expect(screen.getAllByRole("button", { name: /Refresh/ })[0]).toBeEnabled();
    expect(screen.queryByRole("button", { name: /New journey/ })).not.toBeInTheDocument();
  });
});
