import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";

import { ConversationSetup } from "./ConversationSetup";
import type { CoordinationContext } from "./CareCoordinationWorkspace";

afterEach(cleanup);

const levels = { businessHours: { SATURDAY: ["10:00-20:00"], SUNDAY: ["10:00-20:00"] }, timeZone: "Africa/Cairo", firstResponseMinutes: 30,
  escalationMinutes: 60, idleCloseHours: 72, revision: 0 };
const cover = { id: "cv1", ownerSubject: "sara", ownerName: "Sara Ahmed", coverSubject: "omar", coverName: "Omar Ali",
  startsAt: "2026-10-10T08:00:00Z", endsAt: "2026-10-12T16:00:00Z", active: true, canRevoke: true };

function context(api: ReturnType<typeof vi.fn>): CoordinationContext {
  const people = [
    { subject: "sara", name: "Sara Ahmed", account: "ACTIVE" as const, teams: [], capacity: null, workload: 0 },
    { subject: "omar", name: "Omar Ali", account: "ACTIVE" as const, teams: [], capacity: null, workload: 0 },
  ];
  return { locale: "en", base: "/admin/coordination", api: api as unknown as CoordinationContext["api"], can: () => true, teams: [], people,
    personName: (s) => people.find((p) => p.subject === s)?.name ?? "", teamName: () => "", reload: async () => {} };
}

function stubApi() {
  return vi.fn(async (path: string) => {
    if (path.endsWith("/conversation-settings")) return levels;
    if (path.endsWith("/intake-settings")) return [{ subject: "omar", name: "Omar Ali", intakeEligible: true, maxIntake: 8, schedule: {}, timeZone: null, revision: 1 }];
    if (path === "/coordinator/reply-covers") return [cover];
    return { status: "SAVED" };
  });
}

describe("ConversationSetup", () => {
  it("shows the team's hours, who takes new conversations and current covers", async () => {
    render(<ConversationSetup {...context(stubApi())} />);

    expect(await screen.findByText("30 working minutes")).toBeTruthy();
    expect(screen.getByText("Saturday 10:00-20:00 · Sunday 10:00-20:00")).toBeTruthy();
    expect(screen.getByText("Does not take new conversations")).toBeTruthy();
    expect(screen.getByText("Up to 8 open at once")).toBeTruthy();
    expect(screen.getByText("Omar Ali answers Sara Ahmed’s patients")).toBeTruthy();
  });

  it("switches a coordinator on with a limit and a working week", async () => {
    const api = stubApi();
    render(<ConversationSetup {...context(api)} />);
    const sara = (await screen.findByRole("heading", { name: "Sara Ahmed" })).closest("li")!;
    fireEvent.click(within(sara).getByRole("button", { name: "Edit" }));

    const dialog = await screen.findByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText(/Open conversations at once/), { target: { value: "4" } });
    fireEvent.click(within(dialog).getByLabelText("Saturday"));
    fireEvent.change(within(dialog).getByLabelText(/Reason/), { target: { value: "Joins the intake rota" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));

    await vi.waitFor(() => expect(api).toHaveBeenCalledWith("/admin/coordination/intake-settings/sara", { method: "PUT", body: {
      intakeEligible: true, maxIntake: 4, schedule: { SATURDAY: ["10:00-20:00"] }, timeZone: "Africa/Cairo", reason: "Joins the intake rota" } }));
  });

  it("ends a cover", async () => {
    const api = stubApi();
    render(<ConversationSetup {...context(api)} />);
    fireEvent.click(await screen.findByRole("button", { name: "End cover" }));
    await vi.waitFor(() => expect(api).toHaveBeenCalledWith("/coordinator/reply-covers/cv1/revoke", { method: "POST" }));
  });
});
