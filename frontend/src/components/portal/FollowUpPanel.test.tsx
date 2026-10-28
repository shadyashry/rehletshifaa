import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";

import { FollowUpPanel, type FollowUpRole } from "./FollowUpPanel";
import type { FollowUpView } from "./portal-model";
import { renderWithWork } from "./test-copy";

/** P1-18 session 2: the staff "Follow-up" panel against the mocked follow-up API. */
const inFollowUp: FollowUpView = {
  caseId: "c1", caseStatus: "FOLLOW_UP", reopenAvailable: false,
  window: { dischargedAt: "2026-10-25T09:00:00Z", freeDays: 30, endsAt: "2026-11-24T09:00:00Z", closedAt: null },
  plan: { id: "p1", dueAt: "2026-11-01T09:00:00Z", mode: "VIDEO", requiredTests: "ECG the day before", instructions: null },
  contacts: [
    { id: "k1", origin: "PLAN", dueAt: "2026-11-01T09:00:00Z", mode: "VIDEO", status: "DONE", recordedAt: "2026-11-01T10:00:00Z", note: "Wound healing well" },
    { id: "k2", origin: "ADDED", dueAt: "2026-11-15T09:00:00Z", mode: "PHONE", status: "SCHEDULED", reminderSentAt: "2026-11-14T09:00:00Z" },
  ],
  checkIns: [
    { point: "D3", dueAt: "2026-10-28T16:00:00Z", status: "DONE", outcome: "REACHED", note: "Comfortable at home", recordedAt: "2026-10-28T11:00:00Z" },
    { point: "D14", dueAt: "2026-11-08T16:00:00Z", status: "DUE" },
    { point: "D30", dueAt: "2026-11-24T16:00:00Z", status: "NOT_YET" },
  ],
  outcomes: [{ point: "D30", requestedAt: "2026-11-24T09:00:00Z", open: false, reportedAt: "2026-11-24T12:00:00Z", channel: "SECURE_LINK", reportedRole: "PATIENT_REPRESENTATIVE",
    pain: 3, function: 7, satisfaction: 9, complication: true, complicationNote: "Fever since yesterday", incidentId: "i1" }],
  closureBlockers: [{ code: "FOLLOW_UP_WINDOW_OPEN", label: "window open" }, { code: "COMPLICATION_UNDER_REVIEW", label: "complication" }],
};
/** The coordinator's read: the API leaves the clinical text out. */
const forCoordinator: FollowUpView = {
  ...inFollowUp,
  contacts: inFollowUp.contacts.map(c => ({ ...c, note: null })),
  outcomes: inFollowUp.outcomes.map(o => ({ ...o, complicationNote: null, reviewNote: null })),
};

function setup(role: FollowUpRole, props: { currentCode?: string; data?: FollowUpView; locale?: "en" | "ar" } = {}) {
  const data = props.data ?? inFollowUp;
  const mutate = vi.fn().mockResolvedValue(data);
  const load = vi.fn().mockResolvedValue(data) as unknown as <T>(path: string) => Promise<T>;
  renderWithWork(<FollowUpPanel locale={props.locale ?? "en"} role={role} caseId="c1" caseStatus={data.caseStatus ?? "FOLLOW_UP"} currentCode={props.currentCode}
                                busy={false} mutate={mutate} load={load}/>, props.locale ?? "en");
  return { mutate, load };
}
const primaries = () => [...document.querySelectorAll("#follow-up-panel .btn-primary")];

describe("FollowUpPanel — Consultant", () => {
  afterEach(cleanup);

  it("shows the window, what holds the case open instead of a close button, the contacts, check-ins and the answers", async () => {
    const { load } = setup("doctor");
    expect(await screen.findByRole("heading", { name: "Follow-up" })).toBeTruthy();
    expect(load).toHaveBeenCalledWith("/doctor/cases/c1/follow-up");
    expect(screen.getByText("30 days")).toBeTruthy();
    expect(screen.getByText("The free follow-up has not ended")).toBeTruthy();
    expect(screen.getByText("A reported complication awaits the Consultant's review")).toBeTruthy();
    expect(screen.getByText(/there is no close button/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: /close/i })).toBeNull();
    expect(screen.getByText("Wound healing well")).toBeTruthy();
    expect(screen.getByText("ECG the day before")).toBeTruthy();
    expect(screen.getByText("Answered by someone for the patient")).toBeTruthy();
    expect(screen.getByText("3 out of 10")).toBeTruthy();
    expect(screen.getByText("Fever since yesterday")).toBeTruthy();
    // No work of theirs here yet: nothing is filled.
    expect(primaries()).toEqual([]);
  });

  it("on REVIEW_COMPLICATION opens the panel with the patient's report and the review, the one primary action, and records it", async () => {
    const { mutate } = setup("doctor", { currentCode: "REVIEW_COMPLICATION" });
    // UX 3-2: the report comes first — the patient's own words, then what to do, then the review — above the schedule.
    const form = await screen.findByRole("group", { name: "The patient reported a problem" });
    expect(within(form).getByText("Fever since yesterday").tagName).toBe("BLOCKQUOTE");
    expect(form.compareDocumentPosition(screen.getByRole("heading", { name: "Contacts" })) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getAllByText("Fever since yesterday")).toHaveLength(1);
    expect(primaries()).toHaveLength(1);
    fireEvent.change(within(form).getByLabelText("What you did or advised"), { target: { value: "Advised antipyretics and a local review." } });
    fireEvent.click(within(form).getByRole("button", { name: "Record the review" }));
    await waitFor(() => expect(mutate).toHaveBeenCalledWith("/doctor/cases/c1/follow-up/outcomes/D30/review", { note: "Advised antipyretics and a local review." }));
  });

  it("on FOLLOW_UP_CONTACT records the booked contact as missed with a note, and can book another", async () => {
    const { mutate } = setup("doctor", { currentCode: "FOLLOW_UP_CONTACT" });
    const record = (await screen.findByText(/^Record the contact of /, { selector: "summary" })).closest("details")!;
    expect(record.open).toBe(true);
    fireEvent.click(within(record).getByLabelText("The patient missed it"));
    fireEvent.change(within(record).getByLabelText("Note"), { target: { value: "Called twice, no answer." } });
    fireEvent.click(within(record).getByRole("button", { name: "Record the contact" }));
    await waitFor(() => expect(mutate).toHaveBeenCalledWith("/doctor/cases/c1/follow-up/contacts/k2", { outcome: "MISSED", note: "Called twice, no answer." }));

    const book = screen.getByText("Book another contact", { selector: "summary" }).closest("details")!;
    fireEvent.change(within(book).getByLabelText("When"), { target: { value: "2026-12-01T10:00" } });
    fireEvent.change(within(book).getByLabelText("How"), { target: { value: "IN_PERSON" } });
    fireEvent.click(within(book).getByRole("button", { name: "Book the contact" }));
    await waitFor(() => expect(mutate).toHaveBeenCalledWith("/doctor/cases/c1/follow-up/contacts", { dueAt: new Date("2026-12-01T10:00").toISOString(), mode: "IN_PERSON" }));
  });
});

describe("FollowUpPanel — coordinator", () => {
  afterEach(cleanup);

  it("reads scores and flags without the clinical text, and records the due check-in from CHECK_IN_D14", async () => {
    const { mutate, load } = setup("coordinator", { currentCode: "CHECK_IN_D14", data: forCoordinator });
    const form = (await screen.findByText("Record the Day 14 check-in", { selector: "summary" })).closest("details")!;
    expect(load).toHaveBeenCalledWith("/coordinator/cases/c1/follow-up");
    expect(screen.getByText("The details are in the Consultant's record.")).toBeTruthy();
    expect(screen.queryByText("Fever since yesterday")).toBeNull();
    // The Consultant's forms are not theirs.
    expect(screen.queryByText("Book another contact")).toBeNull();
    expect(screen.queryByText(/Review the reported complication/)).toBeNull();
    expect(form.open).toBe(true);
    expect(primaries()).toHaveLength(1);
    fireEvent.click(within(form).getByLabelText("Patient reached"));
    fireEvent.click(within(form).getByRole("button", { name: "Record the check-in" }));
    await waitFor(() => expect(mutate).toHaveBeenCalledWith("/coordinator/cases/c1/follow-up/check-ins/D14", { outcome: "REACHED", note: null }));
  });

  it("on REBOOK_FOLLOW_UP says what to arrange, with no form of its own", async () => {
    setup("coordinator", { currentCode: "REBOOK_FOLLOW_UP", data: { ...forCoordinator, checkIns: [] } });
    expect(await screen.findByText(/Agree a new time with the patient and ask the Consultant to book it/)).toBeTruthy();
    expect(primaries()).toEqual([]);
  });
});

describe("FollowUpPanel — closed", () => {
  afterEach(cleanup);

  it("on a closed case with a complication points to the reopen, and in Arabic names it in Arabic", async () => {
    setup("doctor", { locale: "ar", data: { ...inFollowUp, caseStatus: "CLOSED", reopenAvailable: true, closureBlockers: [],
      window: { ...inFollowUp.window!, closedAt: "2026-11-24T10:00:00Z" }, contacts: inFollowUp.contacts.slice(0, 1) } });
    expect(await screen.findByRole("heading", { name: "المتابعة" })).toBeTruthy();
    expect(screen.getByText("الحالة مغلقة")).toBeTruthy();
    expect(screen.getByRole("link", { name: "الانتقال إلى إعادة فتح الحالة" }).getAttribute("href")).toBe("#reopen-case");
    expect(screen.queryByText("إغلاق الحالة")).toBeNull();
  });

  it("shows nothing for a case closed before any discharge", async () => {
    const { load } = setup("doctor", { data: { ...inFollowUp, caseStatus: "CLOSED", window: null, plan: null, contacts: [], checkIns: [], outcomes: [], closureBlockers: [] } });
    await waitFor(() => expect(load).toHaveBeenCalled());
    expect(document.querySelector("#follow-up-panel")).toBeNull();
  });
});
