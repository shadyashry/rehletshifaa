import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, fireEvent, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { AvailabilityManagement } from "./AvailabilityManagement";
import { apiFetchAs } from "@/lib/api";

const auth = { user: { access_token: "test", profile: { sub: "dr-consultant" } }, loading: false, signIn: vi.fn() };
vi.mock("@/components/AuthProvider", () => ({ useAuth: () => auth }));
vi.mock("@/lib/api", () => ({ apiFetchAs: vi.fn() }));

const slot = { id: "slot-1", dayOfWeek: 1, startTime: "09:00:00", endTime: "17:00:00", timeZone: "Africa/Cairo", serviceCode: "CONSULT", consultationMode: "IN_PERSON", location: "Cairo Clinic", effectiveFrom: "2026-01-01", effectiveTo: null, status: "ACTIVE", revision: 0 };
const exception = { id: "ex-1", type: "LEAVE", startsAt: "2026-10-01T00:00:00Z", endsAt: "2026-10-05T00:00:00Z", timeZone: "Africa/Cairo", serviceCode: null, consultationMode: null, location: null, reason: "Annual leave", revision: 0 };
const schedule = { organizationId: "org-a", practitionerId: "prac-1", recurring: [slot], exceptions: [exception] };
const effectiveAvailability = { available: true, source: "RECURRING", sourceId: "slot-1", evaluatedAt: "2026-09-22T10:00:00Z" };

function mockApi(capabilities: string[], sc = schedule) {
  vi.mocked(apiFetchAs).mockImplementation(async (_token, path, init) => {
    if (path.endsWith("/admin/access/me")) return new Response(JSON.stringify(capabilities.map((permission) => ({ permission, allowed: true }))), { status: 200 });
    if (path.endsWith("/availability/effective")) return new Response(JSON.stringify(effectiveAvailability), { status: 200 });
    if (path.endsWith("/availability") && (!init?.method || init.method === "GET")) return new Response(JSON.stringify(sc), { status: 200 });
    if (path.endsWith("/availability/exceptions") && init?.method === "DELETE") return new Response(null, { status: 200 });
    return new Response(JSON.stringify({}), { status: 200 });
  });
}
afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe("Availability management", () => {
  it("renders the weekly schedule with its explicit time zone, never silently converted", async () => {
    mockApi(["availability.view"]);
    render(<AvailabilityManagement locale="en" organizationId="org-a" practitionerId="prac-1" />);
    expect(await screen.findByText("Monday")).toBeVisible();
    expect(screen.getByText(/09:00–17:00/)).toHaveTextContent("(Africa/Cairo)");
    expect(screen.getByText(/All times are stored and displayed/)).toBeVisible();
  });

  it("renders a leave exception distinctly from the weekly schedule", async () => {
    mockApi(["availability.view"]);
    render(<AvailabilityManagement locale="en" organizationId="org-a" practitionerId="prac-1" />);
    expect(await screen.findByText("Leave")).toBeVisible();
    expect(screen.getByText("Annual leave")).toBeVisible();
  });

  it("shows empty states when nothing is configured", async () => {
    mockApi(["availability.view"], { ...schedule, recurring: [], exceptions: [] });
    render(<AvailabilityManagement locale="en" organizationId="org-a" practitionerId="prac-1" />);
    expect(await screen.findByText("No weekly availability configured yet.")).toBeVisible();
    expect(screen.getByText("No exceptions or leave recorded.")).toBeVisible();
  });

  it("hides management controls without availability.manage or availability.manage_self", async () => {
    mockApi(["availability.view"]);
    render(<AvailabilityManagement locale="en" organizationId="org-a" practitionerId="prac-1" />);
    await screen.findByText("Monday");
    expect(screen.queryByRole("button", { name: /New weekly slot/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Edit" })).not.toBeInTheDocument();
  });

  it("lets an authorized clinician remove an exception", async () => {
    mockApi(["availability.view", "availability.manage_self"]);
    render(<AvailabilityManagement locale="en" organizationId="org-a" practitionerId="prac-1" />);
    fireEvent.click(await screen.findByRole("button", { name: "Remove" }));
    await waitFor(() => expect(apiFetchAs).toHaveBeenCalledWith("test", expect.stringContaining("/availability/exceptions/ex-1?revision=0"), expect.objectContaining({ method: "DELETE" })));
  });

  it("fails closed without availability.view", async () => {
    mockApi([]);
    render(<AvailabilityManagement locale="en" organizationId="org-a" practitionerId="prac-1" />);
    expect(await screen.findByText(/You do not have access/)).toBeVisible();
  });
});
