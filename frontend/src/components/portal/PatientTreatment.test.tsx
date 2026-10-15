import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  HTMLDialogElement.prototype.close = function () { this.open = false; this.dispatchEvent(new Event("close")); };
});

import { MyCare } from "./MyCare";
import { PatientTreatment } from "./PatientTreatment";
import type { CaseActions } from "./CurrentAction";
import type { PatientTreatmentView } from "./portal-model";
import { renderWithWork } from "./test-copy";

/** P1-16 session 2: the treatment timeline and the change-order decision inside My Care, against the mocked patient treatment API. */
const base = { id: "c1", caseNumber: "RS-2026-000123", status: "TREATMENT_IN_PROGRESS", careCategory: "cardiology", coordinatorName: "Sara Ahmed", waitingOn: "PATIENT", updatedAt: "2026-10-21T09:00:00Z" };
const step = (code: string, kind: "FOCUS" | "WAIT"): CaseActions =>
  ({ journeyStage: base.status, waitingOn: kind === "FOCUS" ? "PATIENT" : "STAFF", blockers: [], currentAction: { code, kind }, availableActions: ["MESSAGE_COORDINATOR"] });
// Odd figures on purpose: the page shows what the API returns and never adds the lines up itself.
const awaiting = { id: "o2", orderNumber: "RS-CO-RS-2026-000123-2", status: "AWAITING_PATIENT", emergency: false, reason: "One more night of observation in intensive care.",
  lines: [{ kind: "EXTRA_NIGHT", description: "Extra ICU night", quantity: 2, lineEgp: 24691, lineDisplay: 503.71 }], totalEgp: 24691.4, totalDisplay: 503.72, displayCurrency: "USD",
  awaitingDecision: true };
const view: PatientTreatmentView = {
  facilityName: "Nile Heart Hospital", facilityCity: "Cairo", awaitingDecisionId: "o2",
  timeline: [
    { kind: "ADMITTED", occurredAt: "2026-10-20T08:00:00Z", reportedBy: "CONSULTANT" },
    { kind: "CARE_UPDATE", occurredAt: "2026-10-21T06:00:00Z", reportedBy: "CONSULTANT" },
    { kind: "WARD", occurredAt: "2026-10-21T10:00:00Z", reportedBy: "CARE_TEAM" },
    { kind: "DISCHARGE_PLANNED", occurredAt: "2026-10-21T12:00:00Z", reportedBy: "CONSULTANT", plannedDischargeOn: "2026-10-25" },
  ],
  changeOrders: [
    { id: "o1", orderNumber: "RS-CO-RS-2026-000123-1", status: "EMERGENCY", emergency: true, reason: "Bleeding", lines: [], totalEgp: null, awaitingDecision: false, decidedAt: "2026-10-21T05:00:00Z" },
    awaiting,
  ],
};
const decided: PatientTreatmentView = { ...view, awaitingDecisionId: null, changeOrders: [view.changeOrders[0], { ...awaiting, status: "ACCEPTED", awaitingDecision: false, decidedAt: "2026-10-21T13:00:00Z" }] };

function renderStep(code: string, kind: "FOCUS" | "WAIT", data: PatientTreatmentView, locale: "en" | "ar" = "en") {
  const mutate = vi.fn().mockResolvedValue(decided);
  const load = vi.fn(() => Promise.resolve(data)) as unknown as <T>(path: string) => Promise<T>;
  renderWithWork(<MyCare locale={locale} caseSummary={base} actions={step(code, kind)} documents={[]} unreadMessages={0} cases={[base]}
                         view="care" onView={vi.fn()} onOpenCase={vi.fn()} onOpenProposal={vi.fn()} messagesPanel={null}
                         treatmentStep={<PatientTreatment locale={locale} caseId="c1" code={code} busy={false} mutate={mutate} load={load}/>}/>, locale);
  return { mutate, load };
}

describe("My Care treatment", () => {
  afterEach(cleanup);

  it("REVIEW_CHANGE_ORDER: the reason, the lines and the cost as returned, and accepting as the step's one action", async () => {
    const { mutate, load } = renderStep("REVIEW_CHANGE_ORDER", "FOCUS", view);
    expect(screen.getByRole("heading", { name: "Review a change to your treatment" })).toBeTruthy();
    const decision = within((await screen.findByRole("heading", { name: "The change your Consultant recommends" })).closest("section")!);
    expect(load).toHaveBeenCalledWith("/patient/cases/c1/treatment");
    expect(decision.getByText("One more night of observation in intensive care.")).toBeTruthy();
    expect(decision.getByText("Extra ICU night")).toBeTruthy();
    expect(decision.getByText("EGP 24,691")).toBeTruthy();
    expect(decision.getByText("$503.71")).toBeTruthy();
    expect(decision.getByText("EGP 24,691.40")).toBeTruthy();
    expect(decision.getByText(/About.*\$503\.72.*at the rate fixed on your quote/)).toBeTruthy();
    const accept = decision.getByRole("button", { name: "Accept the change" });
    expect([...document.querySelectorAll(".my-care-step .btn-primary")]).toEqual([accept]);
    expect(decision.getByRole("button", { name: "Decline" }).className).toContain("btn-secondary");
    fireEvent.click(accept);
    expect(mutate).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("alertdialog", { name: "Accept this change?" }).querySelector(".btn-primary") as HTMLElement);
    await waitFor(() => expect(mutate).toHaveBeenCalledWith("/patient/cases/c1/change-orders/o2/decision", { decision: "ACCEPT", note: null }));
    // The answer is the new treatment page: the change now reads as accepted, and nothing is left to decide.
    expect(await screen.findByText("Accepted")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Accept the change" })).toBeNull();
  });

  it("declines with a note after its own confirmation", async () => {
    const { mutate } = renderStep("REVIEW_CHANGE_ORDER", "FOCUS", view);
    fireEvent.change(await screen.findByLabelText("Anything your care team should know (optional)"), { target: { value: "I would rather go home" } });
    fireEvent.click(screen.getByRole("button", { name: "Decline" }));
    const dialog = screen.getByRole("alertdialog", { name: "Decline this change?" });
    expect(dialog.textContent).toContain("Your coordinator contacts you");
    fireEvent.click(dialog.querySelector(".btn-primary") as HTMLElement);
    await waitFor(() => expect(mutate).toHaveBeenCalledWith("/patient/cases/c1/change-orders/o2/decision", { decision: "REJECT", note: "I would rather go home" }));
  });

  it("IN_TREATMENT: a calm timeline, a complication only as a care update, and the decided changes", async () => {
    renderStep("IN_TREATMENT", "WAIT", decided);
    expect(screen.getByRole("heading", { name: "Your treatment is under way" })).toBeTruthy();
    expect(await screen.findByText("You were admitted to hospital")).toBeTruthy();
    expect(screen.getByText("Care update: your Consultant will talk it through with you")).toBeTruthy();
    expect(screen.getByText("You moved to the ward").parentElement?.textContent).toContain("reported by the care team");
    expect(screen.getByText("Your discharge is planned for October 25, 2026")).toBeTruthy();
    expect(screen.queryByText(/complication/i)).toBeNull();
    expect(screen.getByText("Done in an emergency")).toBeTruthy();
    expect(screen.getByText("Price to follow")).toBeTruthy();
    expect(screen.getByText("Accepted")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Accept the change" })).toBeNull();
    expect(document.querySelectorAll(".my-care-step .btn-primary")).toHaveLength(0);
  });

  it("reads in Arabic", async () => {
    renderStep("REVIEW_CHANGE_ORDER", "FOCUS", view, "ar");
    expect(screen.getByRole("heading", { name: "راجع تغييرًا في علاجك" })).toBeTruthy();
    expect(await screen.findByRole("button", { name: "اقبل التغيير" })).toBeTruthy();
    expect(screen.getByText("دخلت المستشفى")).toBeTruthy();
    expect(screen.getByText("نُفّذ في حالة طارئة")).toBeTruthy();
  });
});
