import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen } from "@testing-library/react";

import { MyCare } from "./MyCare";
import { PatientGoingHome } from "./PatientGoingHome";
import type { CaseActions } from "./CurrentAction";
import type { PatientDischargeView, PatientStatement } from "./portal-model";
import { renderWithWork } from "./test-copy";

/** P1-17 session 2: "Going home" and the statement inside My Care, against the mocked patient discharge and statements API. */
const base = { id: "c1", caseNumber: "RS-2026-000123", status: "DISCHARGED", careCategory: "cardiology", coordinatorName: "Sara Ahmed", waitingOn: "STAFF", updatedAt: "2026-10-26T09:00:00Z" };
const step = (code: string): CaseActions => ({ journeyStage: base.status, waitingOn: "STAFF", blockers: [], currentAction: { code, kind: "WAIT" }, availableActions: ["MESSAGE_COORDINATOR"] });
const home: PatientDischargeView = {
  discharged: true,
  documents: [{ kind: "DISCHARGE_SUMMARY", documentId: "d1", recordedAt: "2026-10-24T09:00:00Z" }, { kind: "FIT_TO_FLY", documentId: "d2", recordedAt: "2026-10-25T08:00:00Z" }],
  medications: [{ name: "Aspirin", dose: "75 mg", frequency: "Once a day", duration: "Lifelong" }],
  warningSigns: "Chest pain, breathlessness or bleeding from the wound.",
  followUpDueAt: "2026-11-25T09:00:00Z", followUpMode: "VIDEO", returnMode: "FLIGHT", returnDepartureAt: "2026-10-27T09:00:00Z", departed: false,
  handoverLetter: { evidenceId: "h1", generatedAt: "2026-10-25T11:00:00Z", english: "Dear colleague,", arabic: "الزميل العزيز،" },
};
// Odd figures on purpose: the statement is shown exactly as returned.
const statement: PatientStatement = {
  id: "s1", kind: "DISCHARGE", statementNumber: "RS-ST-RS-2026-000123-1", revision: 1, issuedAt: "2026-10-26T09:00:00Z", displayCurrency: "USD",
  totals: { packageEgp: 200000, changeOrdersEgp: 24691, medicalChargedEgp: 224691, platformFeeEgp: 33703.65, totalChargedEgp: 258394.65, totalChargedDisplay: 5271.25, depositPaidEgp: 38759.2,
    feeBalancePaidEgp: 0, paidAtFacilityEgp: 224000, refundedEgp: 0, balanceDueEgp: 0, balanceDueDisplay: 0, creditDueEgp: 4364.55, creditDueDisplay: 89.04 },
  lines: [{ kind: "PACKAGE", description: "Coronary stent package", amountEgp: 200000, amountDisplay: 4080 }, { kind: "DEPOSIT_PAID", amountEgp: -38759.2, amountDisplay: -790.69 }],
};
const documents = [{ documentId: "d1", fileName: "discharge-summary.pdf", status: "CLEAN", createdAt: "2026-10-24T09:00:00Z" }];

function renderStep(code: string, statements: PatientStatement[], locale: "en" | "ar" = "en") {
  const load = vi.fn((path: string) => Promise.resolve(path.endsWith("/statements") ? statements : home)) as unknown as <T>(path: string) => Promise<T>;
  const onOpenDocuments = vi.fn();
  renderWithWork(<MyCare locale={locale} caseSummary={base} actions={step(code)} documents={documents} unreadMessages={0} cases={[base]}
                         view="care" onView={vi.fn()} onOpenCase={vi.fn()} onOpenProposal={vi.fn()} messagesPanel={null}
                         dischargeStep={<PatientGoingHome locale={locale} caseId="c1" code={code} documents={documents} onOpenDocuments={onOpenDocuments} load={load}/>}/>, locale);
  return { load, onOpenDocuments };
}

describe("My Care going home", () => {
  afterEach(cleanup);

  it("GOING_HOME: the warning signs first, the medicines, the follow-up, the journey home and the documents, with no action to take", async () => {
    const { load, onOpenDocuments } = renderStep("GOING_HOME", []);
    expect(await screen.findByRole("heading", { name: "You are going home" })).toBeTruthy();
    expect(await screen.findByRole("heading", { name: "Get medical help at once if" })).toBeTruthy();
    expect(load).toHaveBeenCalledWith("/patient/cases/c1/discharge");
    expect(load).toHaveBeenCalledWith("/patient/cases/c1/statements");
    expect(screen.getByText("Chest pain, breathlessness or bleeding from the wound.")).toBeTruthy();
    expect(screen.getByText("Aspirin")).toBeTruthy();
    expect(screen.getByText(/^By video on /)).toBeTruthy();
    expect(screen.getByText(/^Flight, leaving /)).toBeTruthy();
    expect(screen.getByText("Fit-to-fly certificate")).toBeTruthy();
    expect(screen.getByText("discharge-summary.pdf")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Open Documents" }));
    expect(onOpenDocuments).toHaveBeenCalled();
    expect(screen.getByRole("button", { name: /^Print\W+English$/ })).toBeTruthy();
    // The statement waits for the reconciliation, and nothing on the step is filled.
    expect(screen.getByText(/Your statement is ready once/)).toBeTruthy();
    expect(document.querySelectorAll(".btn-primary")).toHaveLength(0);
  });

  it("FOLLOW_UP: the statement's lines and the credit in EGP and the patient's currency, as returned", async () => {
    renderStep("FOLLOW_UP", [statement]);
    expect(await screen.findByRole("heading", { name: /Statement\W+RS-ST-RS-2026-000123-1/ })).toBeTruthy();
    expect(screen.getByText("Treatment package")).toBeTruthy();
    expect(screen.getByText("Coronary stent package")).toBeTruthy();
    expect(screen.getByText("Deposit paid")).toBeTruthy();
    expect(screen.getByText(/258,394\.65/)).toBeTruthy();
    expect(screen.getByText("Credit due")).toBeTruthy();
    expect(screen.getByText(/4,364\.55/)).toBeTruthy();
    expect(screen.getByText("$89.04")).toBeTruthy();
  });

  it("reads in Arabic, right to left", async () => {
    renderStep("GOING_HOME", [statement], "ar");
    expect(await screen.findByRole("heading", { name: "اطلب المساعدة الطبية فورًا إذا" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "أدويتك" })).toBeTruthy();
    expect(await screen.findByText("رصيد مستحق للمريض")).toBeTruthy();
    expect(screen.getByText("باقة العلاج")).toBeTruthy();
  });
});
