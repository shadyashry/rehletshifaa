import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";

import { MyCare } from "./MyCare";
import { PatientFollowUp } from "./PatientFollowUp";
import type { CaseActions } from "./CurrentAction";
import type { PatientFollowUpView, PatientStatement } from "./portal-model";
import { renderWithWork } from "./test-copy";

/** P1-18 session 2: the follow-up block, the outcome questions and the closing statement inside My Care, against the mocked API. */
const base = { id: "c1", caseNumber: "RS-2026-000123", status: "FOLLOW_UP", careCategory: "cardiology", coordinatorName: "Sara Ahmed", waitingOn: "STAFF", updatedAt: "2026-11-24T09:00:00Z" };
const step = (code: string, kind: CaseActions["currentAction"]["kind"] = "WAIT", exit?: string): CaseActions => ({ journeyStage: base.status, waitingOn: "STAFF", blockers: [],
  currentAction: { code, kind, ...(exit ? { exit } : {}) }, availableActions: ["MESSAGE_COORDINATOR"] });
const followUp: PatientFollowUpView = {
  active: true, windowEndsAt: "2026-11-24T09:00:00Z", windowClosed: false, closed: false, openOutcome: null,
  contacts: [{ dueAt: "2026-11-01T09:00:00Z", mode: "VIDEO", status: "DONE" }, { dueAt: "2026-11-15T09:00:00Z", mode: "PHONE", status: "SCHEDULED" }],
  outcomes: [],
};
const closingStatement: PatientStatement = {
  id: "s2", kind: "CLOSURE", statementNumber: "RS-SC-RS-2026-000123-1", revision: 1, issuedAt: "2026-11-25T09:00:00Z", displayCurrency: "EGP",
  totals: { packageEgp: 200000, changeOrdersEgp: 0, medicalChargedEgp: 200000, platformFeeEgp: 30000, totalChargedEgp: 230000, depositPaidEgp: 34500, feeBalancePaidEgp: 0,
    paidAtFacilityEgp: 195500, refundedEgp: 0, balanceDueEgp: 0, creditDueEgp: 0 },
  lines: [{ kind: "PACKAGE", description: "Coronary stent package", amountEgp: 200000 }],
};

function renderStep(code: string, data: PatientFollowUpView, opts: { kind?: CaseActions["currentAction"]["kind"]; exit?: string; status?: string; statements?: PatientStatement[]; locale?: "en" | "ar" } = {}) {
  const locale = opts.locale ?? "en";
  const load = vi.fn((path: string) => Promise.resolve(path.endsWith("/statements") ? opts.statements ?? [] : data)) as unknown as <T>(path: string) => Promise<T>;
  const mutate = vi.fn().mockResolvedValue({ ...data, openOutcome: null, outcomes: [{ point: "D30", requestedAt: "2026-11-24T09:00:00Z", open: false, reportedAt: "2026-11-25T09:00:00Z" }] });
  const summary = { ...base, status: opts.status ?? base.status };
  renderWithWork(<MyCare locale={locale} caseSummary={summary} actions={step(code, opts.kind, opts.exit)} documents={[]} unreadMessages={0} cases={[summary]}
                         view="care" onView={vi.fn()} onOpenCase={vi.fn()} onOpenProposal={vi.fn()} messagesPanel={null}
                         followUpStep={<PatientFollowUp locale={locale} caseId="c1" code={code} busy={false} mutate={mutate} load={load}/>}/>, locale);
  return { load, mutate };
}

describe("My Care follow-up", () => {
  afterEach(cleanup);

  it("FOLLOW_UP: the next contact with its reminder, the free follow-up's end and who to turn to, in order", async () => {
    const { load } = renderStep("FOLLOW_UP", followUp);
    expect(await screen.findByRole("heading", { name: "Your follow-up" })).toBeTruthy();
    expect(load).toHaveBeenCalledWith("/patient/cases/c1/follow-up");
    expect(screen.getByText(/^By phone on /)).toBeTruthy();
    expect(screen.getByText("We remind you the day before.")).toBeTruthy();
    expect(screen.getByText(/^Your free follow-up lasts until /)).toBeTruthy();
    const route = screen.getByRole("heading", { name: "If something goes wrong" }).closest("section")!;
    expect(within(route).getAllByRole("listitem").map(li => li.textContent)).toEqual([
      "1Tell your coordinator first.", "2Your coordinator brings in your Consultant.",
      "3In an emergency, do not wait: call your local emergency number or go to the nearest emergency department."]);
    expect(screen.queryByRole("button", { name: "Send my answers" })).toBeNull();
  });

  it("REPORT_OUTCOME: the purpose notice above the questions, each one required, a complication asks what happened, and the notice version is sent", async () => {
    const { mutate } = renderStep("REPORT_OUTCOME", { ...followUp, openOutcome: "D30", outcomes: [{ point: "D30", requestedAt: "2026-11-24T09:00:00Z", open: true }] }, { kind: "FOCUS" });
    expect(await screen.findByRole("heading", { name: "How are you doing?" })).toBeTruthy();
    expect(await screen.findByRole("heading", { name: "Before you answer" })).toBeTruthy();
    expect(screen.getByText("One month after you left hospital")).toBeTruthy();
    // My Care has no "who is answering": the account is the patient's or their representative's, known to the backend.
    expect(screen.queryByText("Who is answering?")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Send my answers" }));
    expect(screen.getAllByText("Answer this question.")).toHaveLength(4);
    await waitFor(() => expect(document.activeElement?.getAttribute("name")).toBe("pain"));
    for (const [legend, n] of [["How much pain do you have now?", "6"], ["How well can you manage your daily activities?", "4"], ["How satisfied are you with your care?", "8"]] as const) {
      fireEvent.click(within(screen.getByRole("group", { name: legend })).getByLabelText(n));
    }
    fireEvent.click(within(screen.getByRole("group", { name: "Has anything gone wrong since you left hospital?" })).getByLabelText("Yes"));
    expect(screen.getByText(/If it is an emergency, do not wait for a reply/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Send my answers" }));
    expect(screen.getByText("Say what happened.")).toBeTruthy();
    expect(mutate).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText("What happened?"), { target: { value: "A fever since yesterday" } });
    fireEvent.click(screen.getByRole("button", { name: "Send my answers" }));
    await waitFor(() => expect(mutate).toHaveBeenCalledWith("/patient/cases/c1/follow-up/outcomes/D30", { pain: 6, function: 4, satisfaction: 8, complication: true,
      complicationNote: "A fever since yesterday", noticeVersion: "outcome-notice-2026-10" }));
    expect(await screen.findByText("Thank you. Your Consultant is asked to review what you reported, and your coordinator is told.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Send my answers" })).toBeNull();
  });

  it("COMPLETED: the closing statement and the review the team asked for, with no follow-up route", async () => {
    const { load } = renderStep("NONE", { ...followUp, closed: true, windowClosed: true, contacts: [] }, { kind: "NONE", exit: "COMPLETED", status: "CLOSED", statements: [closingStatement] });
    expect(await screen.findByRole("heading", { name: "Your care with us is complete" })).toBeTruthy();
    expect(await screen.findByRole("heading", { name: "Your closing statement" })).toBeTruthy();
    expect(load).toHaveBeenCalledWith("/patient/cases/c1/statements");
    expect(await screen.findByText(/^Closing statement · Issued /)).toBeTruthy();
    expect(screen.getByRole("heading", { name: "How was your journey?" })).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "If something goes wrong" })).toBeNull();
  });

  it("in Arabic words the step and the questions in Arabic", async () => {
    renderStep("REPORT_OUTCOME", { ...followUp, openOutcome: "D90" }, { kind: "FOCUS", locale: "ar" });
    expect(await screen.findByRole("heading", { name: "كيف حالك؟" })).toBeTruthy();
    expect(await screen.findByText("بعد ثلاثة أشهر من خروجك من المستشفى")).toBeTruthy();
    expect(screen.getByRole("button", { name: "إرسال إجاباتي" })).toBeTruthy();
  });
});
