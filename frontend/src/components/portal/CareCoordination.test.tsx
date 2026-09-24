import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { TransferOwnership } from "./TransferOwnership";
import { AssignmentHistory, type AssignmentHistoryEntry } from "./AssignmentHistory";
import { CaseQueue, initialQueue, type QueueCase } from "./CaseQueue";

afterEach(() => { cleanup(); vi.clearAllMocks(); });

const staff = [
  { subject: "kc-owner", name: "Omar Nabil", role: "COORDINATOR" },
  { subject: "kc-sara", name: "Sara Ahmed", role: "COORDINATOR" },
  { subject: "kc-lead", name: "Mohamed Ali", role: "COORDINATOR_LEAD" },
  { subject: "kc-ops", name: "Ops Person", role: "OPERATIONS" },
];

describe("Transfer case ownership (Staff Portal)", () => {
  it("offers only valid coordinators, searchable by name, and reviews the real consequences before confirming", async () => {
    const mutate = vi.fn().mockResolvedValue({ id: "a-1", status: "ACTIVE" });
    render(<TransferOwnership locale="en" caseId="case-1" caseNumber="RS-2026-0042" currentOwner="kc-owner" currentOwnerName="Omar Nabil" mySubject="kc-lead" staff={staff} busy={false} mutate={mutate} onClose={vi.fn()} />);
    // Current owner and non-coordinators are never offered; the lead may take it themselves.
    expect(screen.queryByRole("radio", { name: /Omar Nabil/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("radio", { name: /Ops Person/ })).not.toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /Mohamed Ali \(you\)/ })).toBeVisible();
    fireEvent.change(screen.getByRole("searchbox", { name: "Find a coordinator" }), { target: { value: "sar" } });
    expect(screen.queryByRole("radio", { name: /Mohamed Ali/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("radio", { name: /Sara Ahmed/ }));
    const next = screen.getByRole("button", { name: "Review transfer" });
    expect(next).toBeDisabled();
    fireEvent.change(screen.getByRole("textbox", { name: /Reason for the transfer/ }), { target: { value: "Leave coverage" } });
    fireEvent.click(next);

    const review = screen.getByRole("region", { name: "Review before transferring" });
    expect(review).toHaveTextContent("RS-2026-0042");
    expect(review).toHaveTextContent("Sara Ahmed becomes the case owner (the responsible coordinator).");
    expect(review).toHaveTextContent("Open coordinator work on this case moves to Sara Ahmed.");
    expect(review).toHaveTextContent("Consultant, Operations and Finance assignments and their work.");
    expect(review).toHaveTextContent("Sara Ahmed is not notified automatically");
    expect(mutate).not.toHaveBeenCalled();
    fireEvent.click(within(review).getByRole("button", { name: "Transfer ownership" }));
    expect(await screen.findByRole("status")).toHaveTextContent("Ownership transferred to Sara Ahmed. Nobody was notified automatically.");
    expect(mutate).toHaveBeenCalledWith("/coordinator/cases/case-1/coordinator-assignment", { assigneeSubject: "kc-sara", reason: "Leave coverage" });
  });

  it("stays on the review when the backend refuses, and explains an empty team truthfully", async () => {
    const mutate = vi.fn().mockResolvedValue(undefined);
    render(<TransferOwnership locale="en" caseId="case-1" caseNumber="RS-1" currentOwner="kc-owner" mySubject="kc-lead" staff={staff} busy={false} mutate={mutate} onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole("radio", { name: /Sara Ahmed/ }));
    fireEvent.change(screen.getByRole("textbox", { name: /Reason/ }), { target: { value: "x" } });
    fireEvent.click(screen.getByRole("button", { name: "Review transfer" }));
    fireEvent.click(screen.getByRole("button", { name: "Transfer ownership" }));
    expect(await screen.findByRole("button", { name: "Transfer ownership" })).toBeVisible();
    expect(screen.queryByText(/Ownership transferred/)).not.toBeInTheDocument();
    cleanup();
    render(<TransferOwnership locale="en" caseId="case-1" caseNumber="RS-1" currentOwner="kc-owner" staff={[staff[0], staff[3]]} busy={false} mutate={mutate} onClose={vi.fn()} />);
    expect(screen.getByText(/No coordinators report to you yet/)).toBeVisible();
  });

  it("isolates names and the case number in Arabic", () => {
    const { container } = render(<div dir="rtl"><TransferOwnership locale="ar" caseId="case-1" caseNumber="RS-1" currentOwner="kc-owner" staff={staff} busy={false} mutate={vi.fn()} onClose={vi.fn()} /></div>);
    expect(screen.getByRole("button", { name: "مراجعة النقل" })).toBeDisabled();
    expect(Array.from(container.querySelectorAll("bdi")).map((b) => b.textContent)).toContain("Sara Ahmed");
  });
});

describe("Assignment history (Staff Portal)", () => {
  const rows: AssignmentHistoryEntry[] = [
    { role: "COORDINATOR", assigneeName: "Sara Ahmed", status: "ACTIVE", assignedAt: "2026-09-24T10:42:00Z", endedAt: null, assignedByKind: "PERSON", assignedByName: "Mohamed Ali", reason: "Coverage change" },
    { role: "COORDINATOR", assigneeName: "Omar Nabil", status: "ENDED", assignedAt: "2026-09-20T09:00:00Z", endedAt: "2026-09-24T10:42:00Z", assignedByKind: "PERSON", assignedByName: "Omar Nabil", reason: "Coordinator claimed intake queue case" },
    { role: "DOCTOR", assigneeName: "Dr Salma Farouk", status: "PENDING", assignedAt: "2026-09-21T09:00:00Z", endedAt: null, assignedByKind: "ROUTING", assignedByName: null, reason: null },
  ];
  it("lists authoritative responsibility changes, newest first, with who, by whom and why", async () => {
    render(<AssignmentHistory locale="en" caseId="case-1" load={vi.fn().mockResolvedValue(rows)} />);
    const items = await screen.findAllByRole("listitem");
    expect(screen.getByRole("heading", { name: "Assignment history" })).toBeVisible();
    expect(items[0]).toHaveTextContent("Case owner (coordinator): Sara Ahmed");
    expect(items[0]).toHaveTextContent("Current");
    expect(items[0]).toHaveTextContent("By Mohamed Ali");
    expect(items[0]).toHaveTextContent("Reason: Coverage change");
    expect(items[1]).toHaveTextContent(/Ended (Sep 24|24 Sep)/);
    expect(items[2]).toHaveTextContent("Consultant: Dr Salma Farouk");
    expect(items[2]).toHaveTextContent("By automatic routing");
    // Recommendations are not assignments: nothing here says "evaluation".
    expect(screen.queryByText(/evaluation|recommend/i)).not.toBeInTheDocument();
  });
  it("says so when the history cannot be read or is empty", async () => {
    render(<AssignmentHistory locale="en" caseId="case-1" load={vi.fn().mockRejectedValue(new Error("403"))} />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Assignment history could not be loaded.");
    cleanup();
    render(<AssignmentHistory locale="en" caseId="case-1" load={vi.fn().mockResolvedValue([])} />);
    expect(await screen.findByText("No assignments are recorded on this case yet.")).toBeVisible();
  });
});

describe("Team queue", () => {
  const cases: QueueCase[] = [
    { id: "c-1", caseNumber: "RS-1", patientName: "Layla Hassan", status: "RECEIVED", country: "EG", createdAt: "2026-09-20T09:00:00Z", updatedAt: "2026-09-24T09:00:00Z" },
    { id: "c-2", caseNumber: "RS-2", patientName: "Karim Adel", status: "INTAKE_REVIEW", country: "EG", coordinatorSubject: "kc-owner", coordinatorName: "Omar Nabil", createdAt: "2026-09-19T09:00:00Z", updatedAt: "2026-09-23T09:00:00Z" },
    { id: "c-3", caseNumber: "RS-3", patientName: "Mine", status: "INTAKE_REVIEW", country: "EG", coordinatorSubject: "kc-lead", coordinatorName: "Mohamed Ali", createdAt: "2026-09-19T09:00:00Z", updatedAt: "2026-09-23T09:00:00Z" },
  ];
  const props = { locale: "en" as const, role: "coordinator", cases, subject: "kc-lead", busy: false, onChange: vi.fn(), onOpen: vi.fn(), onMutate: vi.fn(), statusLabel: (s: string) => s, categoryLabel: (s: string) => s };

  it("separates unowned work from team-owned cases and offers Transfer only on a teammate's case", () => {
    const onTransfer = vi.fn();
    const { rerender } = render(<CaseQueue {...props} lead scope="team" state={{ ...initialQueue, tab: "unowned" }} onTransfer={onTransfer} />);
    expect(screen.getByRole("tab", { name: "Needs an owner" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByText(/New requests nobody owns yet/)).toBeVisible();
    expect(screen.getByText("Layla Hassan")).toBeVisible();
    expect(screen.queryByText("Karim Adel")).not.toBeInTheDocument();
    expect(screen.getByText(/Received/)).toBeVisible();
    expect(screen.getByRole("button", { name: "Take ownership" })).toBeVisible();
    expect(screen.queryByRole("button", { name: "Transfer ownership" })).not.toBeInTheDocument();

    rerender(<CaseQueue {...props} lead scope="team" state={{ ...initialQueue, tab: "team" }} onTransfer={onTransfer} />);
    expect(screen.getByRole("tab", { name: "Owned by my team" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByText("Karim Adel")).toBeVisible();
    expect(screen.queryByText("Mine")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Transfer ownership" }));
    expect(onTransfer).toHaveBeenCalledWith(cases[1]);

    // My cases: only cases this coordinator owns, with no transfer shortcut.
    rerender(<CaseQueue {...props} lead scope="mine" state={{ ...initialQueue, tab: "mine" }} onTransfer={onTransfer} />);
    expect(screen.getByText("Cases you own as the responsible coordinator.")).toBeVisible();
    expect(screen.getByText("Mine")).toBeVisible();
    expect(screen.queryByText("Karim Adel")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Transfer ownership" })).not.toBeInTheDocument();
  });

  it("gives a coordinator who is not a lead no team-owned view", () => {
    render(<CaseQueue {...props} lead={false} scope="team" state={{ ...initialQueue, tab: "unowned" }} />);
    expect(screen.queryByRole("tab", { name: "Owned by my team" })).not.toBeInTheDocument();
  });
});
