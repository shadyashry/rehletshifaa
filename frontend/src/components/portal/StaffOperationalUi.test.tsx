import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// jsdom implements <dialog> only partially.
beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  HTMLDialogElement.prototype.close = function () { this.open = false; this.dispatchEvent(new Event("close")); };
});
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

import { JourneyPulse, FullJourneyDialog, type TimelineEvent } from "./JourneySnapshot";
import { CurrentActionPanel } from "./CurrentAction";
import { CaseBlockers } from "./CaseBlockers";
import { MoreActions } from "./CoordinatorActions";
import { RoleDashboardSummary } from "./RoleDashboardSummary";
import { CaseQueue, attentionRank, filterQueue, initialQueue, type QueueCase } from "./CaseQueue";
import { MyWork, type WorkItem } from "./MyWork";
import { NotificationBell } from "./NotificationBell";
import { DeclineAssignmentDialog } from "./DeclineAssignmentDialog";
import { PatientCaseView } from "./PatientCaseView";

const item: WorkItem = {
  id: "w1", caseId: "c1", caseNumber: "RS-10281", patientName: "Mohamed Ahmed", caseStatus: "INTAKE_REVIEW",
  waitingOn: "STAFF", type: "REVIEW", title: "Review", context: null, priority: "HIGH", status: "OPEN",
  blocking: false, dueAt: null, overdue: false, createdAt: new Date().toISOString(), version: 0,
};

/**
 * The operational surfaces a staff member reads first: what this case needs now, who has the ball, and
 * which cases deserve attention — each one compact by default, with detail available on demand.
 */
const timeline: TimelineEvent[] = [
  { type: "STATUS", label: "RECEIVED", status: "RECEIVED", occurredAt: "2026-09-08T21:28:00Z", actorName: "System", actorRole: "SYSTEM", note: null },
  { type: "STATUS", label: "INTAKE_REVIEW", status: "INTAKE_REVIEW", occurredAt: "2026-09-08T21:29:00Z", actorName: "Ahmed Hassan", actorRole: "COORDINATOR", note: null },
  { type: "STATUS", label: "CONSULTANT_REVIEW", status: "CONSULTANT_REVIEW", occurredAt: "2026-09-08T21:34:00Z", actorName: "Dr. Yasmine", actorRole: "DOCTOR", note: "Awaiting imaging" },
];

describe("JourneyPulse", () => {
  afterEach(cleanup);

  it("gives orientation only: phases, current position and who has the ball", () => {
    render(<JourneyPulse locale="en" stage="PROPOSAL_PREPARATION" waitingOn="STAFF" onViewJourney={vi.fn()}/>);
    ["Intake", "Consultant", "Proposal", "Patient decision", "Deposit", "Treatment", "Follow-up"]
      .forEach(phase => expect(screen.getByText(phase)).toBeTruthy());
    expect(screen.getByText(/Waiting on: our team/i)).toBeTruthy();
    // It never repeats the current action or the people already shown in the header.
    expect(screen.queryByText(/next action/i)).toBeNull();
    expect(screen.queryByText(/assignee/i)).toBeNull();
    expect(screen.queryByRole("button", { name: /open current task/i })).toBeNull();
  });

  it("marks the current phase and opens the full journey on demand", () => {
    const onViewJourney = vi.fn();
    render(<JourneyPulse locale="en" stage="CONSULTANT_REVIEW" waitingOn="CONSULTANT" onViewJourney={onViewJourney}/>);
    expect(screen.getByText("Consultant").className).toContain("font-bold");
    expect(screen.getByText("Proposal").className).not.toContain("font-bold");
    fireEvent.click(screen.getByRole("button", { name: /view full journey/i }));
    expect(onViewJourney).toHaveBeenCalled();
  });

  it("shows the detailed history with actors and roles only in the dialog", () => {
    render(<FullJourneyDialog locale="en" timeline={timeline} caseNumber="RS-10281" onClose={vi.fn()}/>);
    expect(screen.getByText("Intake")).toBeTruthy();
    expect(screen.getByText("Consultant")).toBeTruthy();
    expect(screen.getByText("Under consultant review")).toBeTruthy();
    expect(screen.getByText(/Dr\. Yasmine · Consultant/)).toBeTruthy();
    expect(screen.getByText("Awaiting imaging")).toBeTruthy();
    expect(screen.queryByText("CONSULTANT_REVIEW")).toBeNull();
  });
});

describe("CurrentActionPanel", () => {
  afterEach(cleanup);

  it("names the business outcome and never the task mechanics", () => {
    const onComplete = vi.fn();
    render(<CurrentActionPanel locale="en" role="coordinator"
                               action={{ code: "WORK_ITEM", kind: "COMPLETE", workItemId: "w1", workItemVersion: 0, workType: "REVIEW_PATIENT_RESPONSE", title: "Review information provided by the patient" }}
                               response={{ message: "Kindly find attached document", documentName: "Echo_Report.pdf" }}
                               secondary={[{ label: "Request information", onClick: vi.fn() }]} onComplete={onComplete}/>);

    expect(screen.getByRole("heading", { name: "Review information provided by the patient" })).toBeTruthy();
    // The thing being reviewed is inline, so no navigation is needed to act.
    expect(screen.getByText("Kindly find attached document")).toBeTruthy();
    expect(screen.getByText("Echo_Report.pdf")).toBeTruthy();
    ["Start now", "Open current task", "Complete task"].forEach(label =>
      expect(screen.queryByRole("button", { name: label })).toBeNull());

    fireEvent.click(screen.getByRole("button", { name: /accept & continue/i }));
    fireEvent.click(screen.getByRole("button", { name: /accept & continue/i })); // confirm step
    expect(onComplete).toHaveBeenCalled();
  });

  it("offers one primary and at most two secondary actions", () => {
    render(<CurrentActionPanel locale="en" role="coordinator" action={{ code: "ASSIGN_CONSULTANT", kind: "FOCUS" }}
                               onFocusAction={vi.fn()} secondary={[
                                 { label: "Request information", onClick: vi.fn() },
                                 { label: "Message patient", onClick: vi.fn() },
                                 { label: "Should not render", onClick: vi.fn() }]}/>);
    expect(screen.getByRole("button", { name: /assign consultant/i })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /should not render/i })).toBeNull();
    expect(screen.getAllByRole("button")).toHaveLength(3);
  });

  it("shows no primary action while the ball is with the patient", () => {
    render(<CurrentActionPanel locale="en" role="coordinator" action={{ code: "WAIT_PATIENT_INFORMATION", kind: "WAIT" }}
                               onFocusAction={vi.fn()} secondary={[{ label: "Record patient response", onClick: vi.fn() }]}/>);
    expect(screen.getByRole("heading", { name: /waiting for the patient/i })).toBeTruthy();
    expect(screen.getAllByRole("button")).toHaveLength(1); // the secondary only
  });

  // The acknowledged-proposal regression: at the deposit stage the patient's profile step is the current
  // action, and neither "Prepare proposal" nor "Assign Operations" exists anywhere on the panel.
  it("explains a patient readiness wait instead of offering future steps", () => {
    render(<CurrentActionPanel locale="en" role="coordinator" action={{ code: "WAIT_PATIENT_READINESS", kind: "WAIT", blockerCode: "CONTACT_NOT_VERIFIED" }}/>);
    expect(screen.getByRole("heading", { name: /waiting for contact verification/i })).toBeTruthy();
    expect(screen.queryAllByRole("button")).toHaveLength(0);
    expect(screen.queryByText(/prepare the proposal/i)).toBeNull();
    expect(screen.queryByText(/assign operations/i)).toBeNull();
  });

  it("renders the deposit arrangement as staff work with its own outcome label", () => {
    render(<CurrentActionPanel locale="en" role="coordinator" onComplete={vi.fn()}
                               action={{ code: "WORK_ITEM", kind: "COMPLETE", workItemId: "w2", workItemVersion: 0, workType: "DEPOSIT_ARRANGEMENT", title: "Arrange the coordination deposit" }}/>);
    expect(screen.getByRole("heading", { name: /arrange the coordination deposit/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /payment instructions sent/i })).toBeTruthy();
  });

  it("reads right-to-left with Arabic copy for the same contract", () => {
    render(<CurrentActionPanel locale="ar" role="coordinator" action={{ code: "WAIT_PATIENT_READINESS", kind: "WAIT", blockerCode: "PROFILE_NOT_ACTIVATED" }}/>);
    expect(screen.getByText("الإجراء الحالي")).toBeTruthy();
    expect(screen.getByRole("heading", { name: /بانتظار تفعيل المريض لملفه/ })).toBeTruthy();
  });

  it("shows nothing to patients", () => {
    const { container } = render(<CurrentActionPanel locale="en" role="patient" action={{ code: "NONE", kind: "NONE" }}/>);
    expect(container.firstChild).toBeNull();
  });
});

describe("CaseBlockers", () => {
  afterEach(cleanup);
  const deposit = { status: "REQUESTED", currency: "EGP", totalDisplay: 3000 };

  it("is compact: a count, each blocker, and whose move it is", () => {
    render(<CaseBlockers locale="en" deposit={deposit} blockers={[
      { code: "CONTACT_NOT_VERIFIED", labelEn: "Contact channel verification", labelAr: "تأكيد وسيلة التواصل", owner: "PATIENT", gating: true },
      { code: "DEPOSIT_UNPAID", labelEn: "Coordination deposit", labelAr: "وديعة التنسيق", owner: "LATER", gating: true }]}/>);
    expect(screen.getByText("1 item needs attention")).toBeTruthy();
    expect(screen.getByText("Contact channel verification")).toBeTruthy();
    expect(screen.getByText("Waiting for patient")).toBeTruthy();
    expect(screen.getByText(/Requested · .*3,000 · pending readiness/)).toBeTruthy();
    // No workflow documentation prose, no metadata grid.
    ["Safe next action", "Responsible", "Last update", "Current step"].forEach(label => expect(screen.queryByText(new RegExp(label))).toBeNull());
  });

  it("renders nothing when nothing is outstanding", () => {
    const { container } = render(<CaseBlockers locale="en" blockers={[]} deposit={deposit}/>);
    expect(container.firstChild).toBeNull();
  });
});

describe("MoreActions", () => {
  afterEach(cleanup);

  it("lists only what the backend offered, one control per business action", () => {
    const mutate = vi.fn().mockResolvedValue({});
    render(<MoreActions locale="en" caseId="c1" version={1} travelPackage={false} busy={false} mutate={mutate}
                        available={["REQUEST_INFORMATION"]} onRequestInformation={vi.fn()} onRecordResponse={vi.fn()}/>);
    const labels = screen.getAllByRole("button").map(b => b.textContent ?? "");
    expect(labels.some(l => /request more information/i.test(l))).toBe(true);
    expect(labels.some(l => /assign/i.test(l))).toBe(false);
    expect(labels.some(l => /cancel case/i.test(l))).toBe(false);
    expect(labels.some(l => /travel package/i.test(l))).toBe(false);
  });

  it("is honest when the state allows nothing extra", () => {
    render(<MoreActions locale="en" caseId="c1" version={1} travelPackage={false} busy={false} mutate={vi.fn()}
                        available={[]} onRequestInformation={vi.fn()} onRecordResponse={vi.fn()}/>);
    expect(screen.getByText(/no additional actions/i)).toBeTruthy();
  });
});

describe("RoleDashboardSummary", () => {
  afterEach(cleanup);
  const cases = [
    { status: "RECEIVED", overdueTaskCount: 0 },
    { status: "INTAKE_REVIEW", coordinatorSubject: "me", overdueTaskCount: 2 },
    { status: "CLOSED", coordinatorSubject: "me" },
  ];

  it("renders KPIs as real toggle buttons, not decoration", () => {
    const onSelect = vi.fn();
    render(<RoleDashboardSummary locale="en" role="coordinator" cases={cases} tasks={[]} selected="" onSelect={onSelect}/>);
    const overdue = screen.getByRole("button", { name: /overdue/i });
    expect(overdue.getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(overdue);
    expect(onSelect).toHaveBeenCalledWith("overdue");
  });

  it("clicking the active KPI clears it", () => {
    const onSelect = vi.fn();
    render(<RoleDashboardSummary locale="en" role="coordinator" cases={cases} tasks={[]} selected="overdue" onSelect={onSelect}/>);
    const overdue = screen.getByRole("button", { name: /overdue/i });
    expect(overdue.getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(overdue);
    expect(onSelect).toHaveBeenCalledWith("");
  });
});

describe("CaseQueue", () => {
  beforeEach(() => { try { localStorage.clear(); } catch { /* private mode */ } });
  afterEach(cleanup);

  const cases: QueueCase[] = [
    { id: "1", caseNumber: "RS-2026-000029", patientName: "Yassmine Lashine", status: "READY_FOR_CONSULTANT", waitingOn: "CONSULTANT",
      country: "Egypt", careCategory: "cardiology", coordinatorSubject: "me", coordinatorName: "Ahmed Hassan", doctorName: "Dr. Yasmine",
      createdAt: "2026-09-01T10:00:00Z", updatedAt: "2026-09-08T10:00:00Z", overdueTaskCount: 1 },
    { id: "2", caseNumber: "RS-2026-000030", patientName: "Omar Nabil", status: "INTAKE_REVIEW", waitingOn: "STAFF",
      country: "UAE", careCategory: "orthopedics", coordinatorSubject: "me", coordinatorName: "Ahmed Hassan",
      createdAt: "2026-09-02T10:00:00Z", updatedAt: "2026-09-09T10:00:00Z" },
  ];
  const props = {
    locale: "en" as const, role: "coordinator", cases, subject: "me", lead: false, busy: false,
    state: { ...initialQueue, tab: "mine" }, scope: "mine" as const, onChange: vi.fn(), onOpen: vi.fn(),
    onMutate: vi.fn(() => Promise.resolve({})), statusLabel: (v: string) => v.replaceAll("_", " ").toLowerCase(),
    categoryLabel: (v: string) => v,
  };

  it("defaults to a scannable list carrying stage, waiting-on, people and one primary action per row", () => {
    render(<CaseQueue {...props}/>);
    expect(screen.getByRole("button", { name: /list/i }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByText("Yassmine Lashine")).toBeTruthy();
    expect(screen.getByText("RS-2026-000029")).toBeTruthy();
    expect(screen.getAllByText(/Waiting:/).length).toBe(2);
    expect(screen.getByText("Overdue")).toBeTruthy();
    expect(screen.getAllByRole("button", { name: /^open$/i })).toHaveLength(2);
  });

  it("keeps advanced filters out of the page until they are asked for", () => {
    render(<CaseQueue {...props}/>);
    expect(screen.queryByRole("dialog", { name: /filters/i })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /filters/i }));
    expect(screen.getByRole("dialog", { name: /filters/i })).toBeTruthy();
    const panel=screen.getByRole("dialog",{name:/filters/i});
    expect(panel.querySelector("select")).toBeTruthy();
    expect(screen.getAllByText(/care area/i).length).toBeGreaterThan(0);
  });

  it("shows active refinements as removable chips", () => {
    const onChange = vi.fn();
    render(<CaseQueue {...props} state={{ ...initialQueue, tab: "mine", country: "Egypt" }} onChange={onChange}/>);
    expect(screen.getByText("Egypt")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /remove country/i }));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ country: "" }));
  });

  it("reveals bulk actions only after a case is selected", () => {
    render(<CaseQueue {...props}/>);
    expect(screen.queryByText(/1 selected/)).toBeNull();
    fireEvent.click(screen.getAllByRole("checkbox")[1]);
    expect(screen.getByText(/1 selected/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /clear selection/i }));
    expect(screen.queryByText(/1 selected/)).toBeNull();
  });
});

describe("attention ordering", () => {
  afterEach(cleanup);
  const base = { caseNumber: "RS-1", status: "INTAKE_REVIEW", country: "Egypt", createdAt: "2026-09-01T10:00:00Z", updatedAt: "2026-09-01T10:00:00Z" };
  const soon = new Date(Date.now() + 6 * 3600_000).toISOString();
  const later = new Date(Date.now() + 10 * 86400_000).toISOString();

  it("ranks cases by the work they carry, not by any case-level priority", () => {
    const rank = (extra: Partial<QueueCase>) => attentionRank({ ...base, id: "x", ...extra } as QueueCase);
    expect(rank({ blockingOverdueCount: 1, overdueTaskCount: 1, openTaskCount: 2 })).toBe(0);
    expect(rank({ highPriorityCount: 1, openTaskCount: 1 })).toBe(1);
    expect(rank({ overdueTaskCount: 1, openTaskCount: 1 })).toBe(2);
    expect(rank({ nextDueAt: soon, openTaskCount: 1 })).toBe(2);
    expect(rank({ patientResponsePending: true, openTaskCount: 1 })).toBe(3);
    expect(rank({ openTaskCount: 1, nextDueAt: later })).toBe(4);
    expect(rank({ openTaskCount: 0 })).toBe(5);
  });

  it("sorts the queue by attention first, then by most recently updated", () => {
    const cases: QueueCase[] = [
      { ...base, id: "quiet", updatedAt: "2026-09-09T10:00:00Z", openTaskCount: 0 },
      { ...base, id: "responded", updatedAt: "2026-09-02T10:00:00Z", openTaskCount: 1, patientResponsePending: true },
      { ...base, id: "blocking", updatedAt: "2026-09-01T10:00:00Z", openTaskCount: 1, blockingOverdueCount: 1, overdueTaskCount: 1 },
      { ...base, id: "open-a", updatedAt: "2026-09-08T10:00:00Z", openTaskCount: 1 },
      { ...base, id: "open-b", updatedAt: "2026-09-03T10:00:00Z", openTaskCount: 2 },
    ];
    const ordered = filterQueue(cases, { ...initialQueue }, false).map(item => item.id);
    expect(ordered).toEqual(["blocking", "responded", "open-a", "open-b", "quiet"]);
  });

  it("labels why a case is near the top", () => {
    render(<CaseQueue locale="en" role="coordinator" subject="me" lead={false} busy={false} state={{ ...initialQueue, tab: "mine" }} scope="mine" onChange={vi.fn()} onOpen={vi.fn()} onMutate={vi.fn(() => Promise.resolve({}))} statusLabel={(v: string) => v} categoryLabel={(v: string) => v}
      cases={[{ ...base, id: "1", patientName: "Omar Nabil", coordinatorSubject: "me", openTaskCount: 1, patientResponsePending: true }]}/>);
    expect(screen.getByText("Patient responded")).toBeTruthy();
  });
});

describe("consultant workspace", () => {
  afterEach(cleanup);

  it("treats a pending assignment as one accept/decline decision, not clinical work", () => {
    const onAccept = vi.fn(), onDecline = vi.fn();
    render(<CurrentActionPanel locale="en" role="doctor" action={{ code: "ACCEPT_ASSIGNMENT", kind: "ACCEPT" }}
                               secondary={[{ label: "Messages", onClick: vi.fn() }]}
                               onAcceptAssignment={onAccept} onDeclineAssignment={onDecline}/>);

    expect(screen.getByRole("heading", { name: /new clinical assignment/i })).toBeTruthy();
    // Exactly one accept location, plus decline. No review/start/complete duplicates, no secondaries.
    const buttons = screen.getAllByRole("button").map(b => (b.textContent ?? "").trim());
    expect(buttons).toHaveLength(2);
    expect(buttons[0]).toMatch(/accept assignment/i);
    expect(buttons[1]).toMatch(/decline/i);
    ["Review assignment", "Start clinical review", "Complete task", "Messages"].forEach(label =>
      expect(screen.queryByRole("button", { name: label })).toBeNull());

    fireEvent.click(screen.getByRole("button", { name: /accept assignment/i }));
    expect(onAccept).toHaveBeenCalled();
    expect(onDecline).not.toHaveBeenCalled();
  });

  it("turns the accepted assignment into the clinical work and drops the acceptance controls", () => {
    render(<CurrentActionPanel locale="en" role="doctor"
                               action={{ code: "WORK_ITEM", kind: "FOCUS", workItemId: "w1", workItemVersion: 0, workType: "CLINICAL_REVIEW", title: "Review case and provide clinical recommendation" }}
                               onFocusAction={vi.fn()}/>);
    // Who has the ball is stated once, in the case header — never repeated inside the action panel.
    expect(screen.queryByText(/waiting on/i)).toBeNull();
    // After acceptance the CTA is the clinical work, and acceptance controls are gone.
    expect(screen.getByRole("button", { name: /start clinical review/i })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /accept assignment/i })).toBeNull();
  });

  it("labels the consultant's new assignments in My Work with the review CTA", () => {
    const onOpen = vi.fn();
    render(<MyWork locale="en" busy={false} onOpen={onOpen} items={[{
      ...item, id: "a1", type: "CONSULTANT_ASSIGNMENT", title: "New clinical assignment",
      context: "You have been assigned case RS-10281 for clinical review.", waitingOn: "CONSULTANT",
    }]}/>);
    fireEvent.click(screen.getByRole("button", { name: /review assignment/i }));
    expect(onOpen).toHaveBeenCalledWith("c1");
  });

  it("counts a consultant's new assignments from work items, not from cases", () => {
    render(<RoleDashboardSummary locale="en" role="doctor" cases={[]} tasks={[
      { overdue: false, status: "OPEN", type: "CONSULTANT_ASSIGNMENT" },
      { overdue: false, status: "OPEN", type: "CLINICAL_REVIEW" },
    ]} selected="" onSelect={vi.fn()}/>);
    const card = screen.getByRole("button", { name: /new assignments/i });
    expect(card.textContent).toContain("1");
  });
});

describe("notification bell unread state", () => {
  beforeEach(() => {
    const slot = document.createElement("div");
    slot.id = "portal-account-slot";
    document.body.appendChild(slot);
  });
  afterEach(() => { cleanup(); document.getElementById("portal-account-slot")?.remove(); });

  const unreadFeed = {
    unread: 2,
    items: [
      { id: "n1", caseId: "c1", caseNumber: "RS-10281", taskId: "w1", eventType: "ASSIGNMENT_CREATED",
        title: "New clinical assignment", context: "Case RS-10281 for clinical review.", createdAt: new Date().toISOString(), read: false },
      { id: "n2", caseId: "c2", caseNumber: "RS-10282", taskId: "w2", eventType: "ASSIGNMENT_CREATED",
        title: "New clinical assignment", context: "Case RS-10282 for clinical review.", createdAt: new Date().toISOString(), read: false },
    ],
  };

  it("shows a red count badge only while something is unread", async () => {
    const api = vi.fn(() => Promise.resolve(unreadFeed));
    render(<NotificationBell locale="en" api={api as never} onOpenCase={vi.fn()}/>);
    const bell = await screen.findByRole("button", { name: /notifications: 2 unread/i });
    expect(bell.querySelector("span.bg-alert-600")).toBeTruthy();

    cleanup();
    const empty = vi.fn(() => Promise.resolve({ unread: 0, items: [] }));
    render(<NotificationBell locale="en" api={empty as never} onOpenCase={vi.fn()}/>);
    const quiet = await screen.findByRole("button", { name: /^notifications$/i });
    expect(quiet.querySelector("span.bg-alert-600")).toBeNull();
  });

  it("opening the drawer does not acknowledge anything", async () => {
    const api = vi.fn(() => Promise.resolve(unreadFeed));
    render(<NotificationBell locale="en" api={api as never} onOpenCase={vi.fn()}/>);
    fireEvent.click(await screen.findByRole("button", { name: /notifications: 2 unread/i }));
    expect(await screen.findAllByText("New clinical assignment")).toHaveLength(2);
    // Listing and opening are reads, never writes.
    expect(api.mock.calls.every(call => String((call as unknown as string[])[0]) === "/notifications")).toBe(true);
  });

  it("acknowledging one notification marks only that one", async () => {
    const api = vi.fn((path: string) => path === "/notifications" ? Promise.resolve(unreadFeed) : Promise.resolve({ unread: 1 }));
    render(<NotificationBell locale="en" api={api as never} onOpenCase={vi.fn()}/>);
    fireEvent.click(await screen.findByRole("button", { name: /notifications: 2 unread/i }));
    fireEvent.click(screen.getAllByRole("button", { name: /^mark as read:/i })[0]);
    await waitFor(() => expect(api).toHaveBeenCalledWith("/notifications/read?id=n1", { method: "POST" }));
    expect(api.mock.calls.filter(call => String(call[0]).startsWith("/notifications/read"))).toHaveLength(1);
  });
});

describe("DeclineAssignmentDialog", () => {
  afterEach(cleanup);

  it("asks for a structured reason before it will decline", () => {
    const onConfirm = vi.fn();
    render(<DeclineAssignmentDialog locale="en" caseNumber="RS-10281" onConfirm={onConfirm} onClose={vi.fn()}/>);
    expect(screen.getByRole("heading", { name: "Decline assignment" })).toBeTruthy();
    ["Outside my clinical scope", "Insufficient availability", "Unable to take this case", "Duplicate assignment", "Other"]
      .forEach(label => expect(screen.getByRole("radio", { name: label })).toBeTruthy());

    fireEvent.click(screen.getByRole("button", { name: "Decline assignment" }));
    expect(onConfirm).not.toHaveBeenCalled();
    expect(screen.getByRole("alert").textContent).toMatch(/choose a reason/i);
  });

  it("composes the reason and the optional note into the single field the backend stores", () => {
    const onConfirm = vi.fn();
    render(<DeclineAssignmentDialog locale="en" onConfirm={onConfirm} onClose={vi.fn()}/>);
    fireEvent.click(screen.getByRole("radio", { name: "Outside my clinical scope" }));
    fireEvent.change(screen.getByLabelText(/note for the coordinator/i), { target: { value: "This needs an electrophysiologist." } });
    fireEvent.click(screen.getByRole("button", { name: "Decline assignment" }));
    expect(onConfirm).toHaveBeenCalledWith("Outside my clinical scope - This needs an electrophysiologist.");
  });

  it("sends the reason alone when no note is written", () => {
    const onConfirm = vi.fn();
    render(<DeclineAssignmentDialog locale="en" onConfirm={onConfirm} onClose={vi.fn()}/>);
    fireEvent.click(screen.getByRole("radio", { name: "Duplicate assignment" }));
    fireEvent.click(screen.getByRole("button", { name: "Decline assignment" }));
    expect(onConfirm).toHaveBeenCalledWith("Duplicate assignment");
  });

  it("cancelling declines nothing and closes", () => {
    const onConfirm = vi.fn(), onClose = vi.fn();
    render(<DeclineAssignmentDialog locale="en" onConfirm={onConfirm} onClose={onClose}/>);
    fireEvent.click(screen.getByRole("radio", { name: "Other" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onConfirm).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it("shows Arabic labels but still stores the canonical reason", () => {
    const onConfirm = vi.fn();
    render(<DeclineAssignmentDialog locale="ar" onConfirm={onConfirm} onClose={vi.fn()}/>);
    expect(screen.getByRole("heading", { name: "رفض التعيين" })).toBeTruthy();
    fireEvent.click(screen.getByRole("radio", { name: "خارج نطاق تخصصي السريري" }));
    fireEvent.click(screen.getByRole("button", { name: "رفض التعيين" }));
    expect(onConfirm).toHaveBeenCalledWith("Outside my clinical scope");
  });
});

describe("PatientCaseView", () => {
  afterEach(cleanup);

  const base = {
    id: "c1", caseNumber: "RS-2026-000030", status: "CONSULTANT_REVIEW", careCategory: "cardiology",
    coordinatorName: "Layla Hassan", doctorName: "Dr Ahmed Alashry", waitingOn: "CONSULTANT",
    updatedAt: new Date().toISOString(), travelPackageRequested: false,
  };
  const timeline = [{ status: "RECEIVED", occurredAt: "2026-09-08T09:00:00Z" }, { status: "CONSULTANT_REVIEW", occurredAt: "2026-09-09T09:00:00Z" }];

  it("explains where the case is, who has it and that nothing is needed from the patient", () => {
    render(<PatientCaseView locale="en" caseSummary={base} tasks={[]} documents={[]} timeline={timeline} hasProposal={false}/>);
    expect(screen.getByRole("heading", { name: /your consultant is reviewing your case/i })).toBeTruthy();
    expect(screen.getByText(/no action is required from you right now/i)).toBeTruthy();
    expect(screen.getByText(/you will receive a recommendation/i)).toBeTruthy();
    expect(screen.getByText("Layla Hassan")).toBeTruthy();
    expect(screen.getByText("Dr Ahmed Alashry")).toBeTruthy();
    // Workflow vocabulary never reaches the patient.
    expect(screen.queryByText(/CONSULTANT_REVIEW/)).toBeNull();
    // Who has the ball is stated once, in the case header — never repeated inside the action panel.
    expect(screen.queryByText(/waiting on/i)).toBeNull();
  });

  it("shows the journey as patient-friendly phases with the current one marked", () => {
    render(<PatientCaseView locale="en" caseSummary={base} tasks={[]} documents={[]} timeline={timeline} hasProposal={false}/>);
    const tracker = screen.getByRole("list");
    const labels = [...tracker.querySelectorAll("li")].map(li => (li.textContent ?? "").trim());
    expect(labels).toEqual(["Case received", "Coordinator review", "Consultant review", "Your proposal", "Deposit", "Treatment", "Follow-up"]);
    const current = [...tracker.querySelectorAll("li > span:last-child")].find(s => s.textContent === "Consultant review");
    expect(current!.className).toContain("font-bold");
  });

  it("surfaces a required action instead of the calm state when one is open", () => {
    render(<PatientCaseView locale="en" caseSummary={{ ...base, status: "INFORMATION_REQUIRED", waitingOn: "PATIENT" }}
                            tasks={[{ id: "t1", title: "Upload your latest Echo report", status: "OPEN" }]}
                            documents={[]} timeline={timeline} hasProposal={false}/>);
    expect(screen.getByRole("heading", { name: /we need something from you/i })).toBeTruthy();
    expect(screen.getByText("Upload your latest Echo report")).toBeTruthy();
    expect(screen.getByText(/something is needed from you/i)).toBeTruthy();
    expect(screen.queryByText(/no action is required/i)).toBeNull();
  });

  it("keeps travel support as a calm read-only preference, never a control", () => {
    render(<PatientCaseView locale="en" caseSummary={{ ...base, travelPackageRequested: true }} tasks={[]} documents={[]} timeline={timeline} hasProposal={false}/>);
    expect(screen.getByText("Travel support preference")).toBeTruthy();
    expect(screen.getByText("Requested")).toBeTruthy();
    expect(screen.queryByRole("switch")).toBeNull();
    expect(screen.queryByRole("checkbox")).toBeNull();
  });

  it("offers patient-facing tabs and never a clinical one", () => {
    render(<PatientCaseView locale="en" caseSummary={base} tasks={[]}
                            documents={[{ documentId: "d1", fileName: "Echo_Report.pdf", status: "CLEAN", sizeBytes: 10, createdAt: new Date().toISOString() }]}
                            timeline={timeline} hasProposal={false}/>);
    ["Overview", "Documents", "Updates"].forEach(label => expect(screen.getByRole("tab", { name: new RegExp(label, "i") })).toBeTruthy());
    expect(screen.queryByRole("tab", { name: /clinical/i })).toBeNull();
    fireEvent.click(screen.getByRole("tab", { name: /documents/i }));
    expect(screen.getByText("Echo_Report.pdf")).toBeTruthy();
  });
});

describe("consultant work rows", () => {
  afterEach(cleanup);

  it("carry the case identity a consultant needs before opening anything", () => {
    render(<MyWork locale="en" busy={false} onOpen={vi.fn()} items={[{
      ...item, id: "a1", type: "CONSULTANT_ASSIGNMENT", title: "New clinical assignment",
      caseNumber: "RS-2026-000030", patientName: "Ahmed Ali", careCategory: "cardiology",
      coordinatorName: "Layla Hassan", documentCount: 3, context: null,
    }]}/>);
    expect(screen.getByText("RS-2026-000030")).toBeTruthy();
    expect(screen.getByText("Ahmed Ali")).toBeTruthy();
    expect(screen.getByText("cardiology")).toBeTruthy();
    expect(screen.getByText("Layla Hassan")).toBeTruthy();
    expect(screen.getByText(/3 documents/)).toBeTruthy();
    expect(screen.getByRole("button", { name: /review assignment/i })).toBeTruthy();
  });
});
