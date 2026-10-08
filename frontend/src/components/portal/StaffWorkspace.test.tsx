import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

import { MyWork, type WorkItem } from "./MyWork";
import { NotificationBell } from "./NotificationBell";
import { RequestInformationDialog } from "./RequestInformationDialog";
import { renderWithWork } from "./test-copy";

/**
 * The staff side of the operational loop: work items are what you must do, notifications are what you
 * should know, and "Request more information" collects exactly what the patient has to provide.
 */
const item: WorkItem = {
  id: "w1", caseId: "c1", caseNumber: "RS-10281", patientName: "Mohamed Ahmed", caseStatus: "INTAKE_REVIEW",
  waitingOn: "STAFF", type: "REVIEW_PATIENT_RESPONSE", title: "Review information provided by the patient",
  context: "Mohamed Ahmed answered your information request.", priority: "HIGH", status: "OPEN",
  blocking: false, dueAt: null, overdue: false, createdAt: new Date().toISOString(), version: 0,
};


describe("MyWork", () => {
  afterEach(cleanup);

  it("shows the priority, case, patient and a single primary action", () => {
    const onOpen = vi.fn();
    renderWithWork(<MyWork locale="en" items={[item]} busy={false} onOpen={onOpen}/>);
    expect(screen.getByText("Review information provided by the patient")).toBeTruthy();
    expect(screen.getByText("RS-10281")).toBeTruthy();
    expect(screen.getAllByText(/Mohamed Ahmed/).length).toBeGreaterThan(0);
    expect(screen.getByText("High")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /open/i }));
    expect(onOpen).toHaveBeenCalledWith("c1");
  });

  it("flags overdue work so it cannot be missed", () => {
    renderWithWork(<MyWork locale="en" items={[{ ...item, overdue: true, dueAt: new Date(Date.now() - 86400000).toISOString() }]} busy={false} onOpen={vi.fn()}/>);
    expect(screen.getByText("Overdue")).toBeTruthy();
  });

  it("has a calm empty state rather than a blank panel", () => {
    renderWithWork(<MyWork locale="en" items={[]} busy={false} onOpen={vi.fn()}/>);
    expect(screen.getByText("Nothing is assigned to you.")).toBeTruthy();
    expect(screen.getByText(/anything assigned to you/i)).toBeTruthy();
  });

  it("points an empty My work at new cases waiting in the Team queue", () => {
    const onTeamQueue = vi.fn();
    renderWithWork(<MyWork locale="en" items={[]} busy={false} onOpen={vi.fn()} teamWaiting={2} onTeamQueue={onTeamQueue}/>);
    fireEvent.click(screen.getByRole("button", { name: /2 new cases are waiting/i }));
    expect(onTeamQueue).toHaveBeenCalled();
  });
});

describe("NotificationBell", () => {
  beforeEach(() => {
    const slot = document.createElement("div");
    slot.id = "portal-account-slot";
    document.body.appendChild(slot);
  });
  afterEach(() => { cleanup(); document.getElementById("portal-account-slot")?.remove(); });

  const feed = {
    unread: 1,
    items: [{ id: "n1", caseId: "c1", caseNumber: "RS-10281", taskId: "w1", eventType: "PATIENT_RESPONDED",
              title: "Patient provided requested information", context: "Mohamed Ahmed answered.",
              createdAt: new Date().toISOString(), read: false }],
  };

  it("badges unread notifications and opens the case without clearing the work", async () => {
    const api = vi.fn((path: string) => path === "/notifications" ? Promise.resolve(feed) : Promise.resolve({ unread: 0 }));
    const onOpenCase = vi.fn();
    render(<NotificationBell locale="en" api={api as never} onOpenCase={onOpenCase}/>);

    const bell = await screen.findByRole("button", { name: /notifications: 1 unread/i });
    fireEvent.click(bell);
    expect(await screen.findByText("Patient provided requested information")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /^open case$/i }));
    // The CTA navigates to the work; marking read is an inbox action, never a completion.
    expect(onOpenCase).toHaveBeenCalledWith("c1");
    await waitFor(() => expect(api).toHaveBeenCalledWith("/notifications/read?id=n1", { method: "POST" }));
  });

  it("shows an empty inbox rather than a stale badge", async () => {
    const api = vi.fn(() => Promise.resolve({ unread: 0, items: [] }));
    render(<NotificationBell locale="en" api={api as never} onOpenCase={vi.fn()}/>);
    fireEvent.click(await screen.findByRole("button", { name: /^notifications$/i }));
    expect(await screen.findByText(/no notifications yet/i)).toBeTruthy();
  });
});

describe("RequestInformationDialog", () => {
  afterEach(cleanup);

  beforeEach(() => {
    // jsdom implements <dialog> only partially.
    HTMLDialogElement.prototype.showModal = function () { this.open = true; };
    HTMLDialogElement.prototype.close = function () { this.open = false; this.dispatchEvent(new Event("close")); };
  });

  it("sends a bulk request once per case and retries only the cases that failed", async () => {
    let failC2 = true;
    const mutate = vi.fn((path: string) => Promise.resolve(path.includes("/c2/") && failC2 ? undefined : { status: "REQUESTED" }));
    const onPartial = vi.fn(), onDone = vi.fn();
    renderWithWork(<RequestInformationDialog locale="en" caseIds={["c1", "c2", "c3"]} busy={false} mutate={mutate} onClose={vi.fn()} onDone={onDone} onPartial={onPartial}/>);
    fireEvent.click(screen.getByRole("checkbox", { name: /current medication/i }));
    fireEvent.click(screen.getByRole("button", { name: /send request/i }));
    expect(await screen.findByText(/Sent to 2 of 3 cases/)).toBeTruthy();
    expect(onPartial).toHaveBeenCalledWith(["c2"]);
    expect(mutate).toHaveBeenCalledTimes(3);
    failC2 = false;
    fireEvent.click(screen.getByRole("button", { name: /send request/i }));
    await waitFor(() => expect(onDone).toHaveBeenCalled());
    // The retry went to c2 only: c1 and c3 never get the request twice.
    expect(mutate.mock.calls.map(call => call[0]).filter(path => path.includes("/c1/"))).toHaveLength(1);
    expect(mutate).toHaveBeenCalledTimes(4);
  });

  it("sends exactly the requested items, the message and the blocking choice", async () => {
    const mutate = vi.fn(() => Promise.resolve({ status: "REQUESTED" }));
    const onClose = vi.fn();
    renderWithWork(<RequestInformationDialog locale="en" caseIds={["c1"]} busy={false} mutate={mutate} onClose={onClose}/>);

    fireEvent.click(screen.getByRole("checkbox", { name: /current medication/i }));
    fireEvent.change(screen.getByLabelText(/message to the patient/i), { target: { value: "Please confirm your medication." } });
    fireEvent.click(screen.getByRole("button", { name: /send request/i }));

    await waitFor(() => expect(mutate).toHaveBeenCalled());
    const [path, body] = mutate.mock.calls[0] as unknown as [string, { items: { code: string }[]; message: string; blocking: boolean }];
    expect(path).toBe("/coordinator/cases/c1/information-requests");
    expect(body.items.map(i => i.code)).toEqual(["CURRENT_MEDICATION"]);
    expect(body.message).toBe("Please confirm your medication.");
    expect(body.blocking).toBe(true);
  });

  it("refuses an empty request instead of sending a bare status change", async () => {
    const mutate = vi.fn(() => Promise.resolve({}));
    renderWithWork(<RequestInformationDialog locale="en" caseIds={["c1"]} busy={false} mutate={mutate} onClose={vi.fn()}/>);
    fireEvent.click(screen.getByRole("button", { name: /send request/i }));
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(mutate).not.toHaveBeenCalled();
  });

  it("supports a non-blocking request for optional information", async () => {
    const mutate = vi.fn(() => Promise.resolve({ status: "REQUESTED" }));
    renderWithWork(<RequestInformationDialog locale="en" caseIds={["c1"]} busy={false} mutate={mutate} onClose={vi.fn()}/>);
    fireEvent.click(screen.getByRole("checkbox", { name: /preferred treatment dates/i }));
    fireEvent.click(screen.getByRole("checkbox", { name: /journey cannot continue/i }));
    fireEvent.click(screen.getByRole("button", { name: /send request/i }));
    await waitFor(() => expect(mutate).toHaveBeenCalled());
    expect((mutate.mock.calls[0] as unknown as [string, { blocking: boolean }])[1].blocking).toBe(false);
  });
});
