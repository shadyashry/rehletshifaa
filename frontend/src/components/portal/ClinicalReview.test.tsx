import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen, within } from "@testing-library/react";

import { ClinicalReviewPanel, type CatalogService, type FxRate } from "./ClinicalReview";
import { CaseEvidence } from "./ClinicalDecision";
import { renderWithWork } from "./test-copy";

// jsdom implements <dialog> only partially.
beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  HTMLDialogElement.prototype.close = function () { this.open = false; this.dispatchEvent(new Event("close")); };
});
import { getDictionary } from "@/lib/dictionary";

const catalog: CatalogService[] = [
  { id: "svc-1", serviceCode: "PACE-DUAL", serviceName: "Dual-chamber pacemaker implant", category: "Procedure", priceEgp: 390000, active: true },
  { id: "svc-2", serviceCode: "ECHO", serviceName: "Echocardiogram", category: "Diagnostic", priceEgp: 8500, active: true },
];
const fxRates: FxRate[] = [{ currency: "USD", rate: 0.0207, rateDate: "2026-09-10", source: "CBE" }];

function setup(overrides: Partial<Parameters<typeof ClinicalReviewPanel>[0]> = {}) {
  const mutate = vi.fn().mockResolvedValue({ status: "SAVED" });
  renderWithWork(<ClinicalReviewPanel locale="en" caseId="case-1" busy={false} catalog={catalog} fxRates={fxRates}
                                      documentsOnFile={2} mutate={mutate} payees={getDictionary("en").portalProposal.price.payees} {...overrides}/>);
  return { mutate };
}
const recommendationField = () => screen.getByLabelText("Clinical recommendation") as HTMLTextAreaElement;
const summaryValue = (label: string) => within(screen.getByRole("region", { name: "Before you send" })).getByText(label).nextElementSibling?.textContent;

/**
 * The Consultant's review has one normal completion and one grammar (UX 3-1): "1 Recommendation", "2 Estimate lines", then
 * a summary led by the clinical text. The domain rules it depends on: catalogue prices stay authoritative in EGP, and the
 * currency the Consultant selects is the one the patient proposal is issued in.
 */
describe("ClinicalReviewPanel", () => {
  afterEach(cleanup);

  it("offers one filled completion, in numbered parts, with the exits behind one disclosure", () => {
    setup();
    expect(screen.getByRole("heading", { level: 4, name: "1 Recommendation" })).toBeTruthy();
    expect(screen.getByRole("heading", { level: 4, name: "2 Estimate lines" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Submit recommendation" }).className).toContain("btn-primary");
    expect(screen.getByRole("button", { name: "Save draft" }).className).not.toContain("btn-primary");
    expect(screen.getByText("Other clinical outcome")).toBeTruthy();
    expect(screen.queryByRole("radio", { name: /Request second opinion/ })).toBeNull();
    for (const outcome of ["Request additional information", "Return without recommendation", "Not clinically suitable"])
      expect(screen.getByRole("radio", { name: new RegExp(outcome) })).toBeTruthy();
  });

  it("keeps the catalogue price authoritative while issuing the proposal in the chosen currency", () => {
    const { mutate } = setup();
    fireEvent.change(recommendationField(), { target: { value: "Pacemaker implantation" } });
    const pacemaker = screen.getByRole("checkbox", { name: /Dual-chamber pacemaker implant/ });
    fireEvent.click(pacemaker);
    expect(within(pacemaker.closest("label")!).getByText("EGP 390,000")).toBeTruthy();

    // Choosing a proposal currency restates the value the patient will see; it never rewrites the catalogue.
    fireEvent.change(screen.getByLabelText("Proposal currency"), { target: { value: "USD" } });
    expect(summaryValue("Patient's proposal")).toMatch(/8,073/);
    expect(screen.getByText(/the patient's proposal is in US Dollar \(USD\) at today's rate/)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Submit recommendation" }));
    expect(mutate).toHaveBeenCalledWith("/doctor/cases/case-1/review-decision", expect.objectContaining({
      decision: "ACCEPT",
      proposalCurrency: "USD",
      // Line amounts still travel at the approved EGP base: the server converts and snapshots the rate.
      costEstimates: [{ serviceDescription: "Dual-chamber pacemaker implant", estimatedCost: 390000, currency: "EGP", catalogServiceId: "svc-1" }],
    }));
  });

  it("carries the chosen proposal currency into a saved draft and back out again", () => {
    const { mutate } = setup();
    fireEvent.change(recommendationField(), { target: { value: "Pacemaker implantation" } });
    fireEvent.change(screen.getByLabelText("Proposal currency"), { target: { value: "USD" } });
    fireEvent.click(screen.getByRole("button", { name: "Save draft" }));
    expect(mutate).toHaveBeenCalledWith("/doctor/cases/case-1/reviews", expect.objectContaining({ proposalCurrency: "USD" }));

    cleanup();
    setup({ draft: { id: "draft-1", recommendedTreatment: "Pacemaker implantation", proposalCurrency: "USD", costEstimates: [] } });
    expect((screen.getByLabelText("Proposal currency") as HTMLSelectElement).value).toBe("USD");
  });

  it("refuses at the control: a missing recommendation at its field, missing lines at the lines", () => {
    const { mutate } = setup();
    const field = recommendationField();
    // Required said to assistive technology; refused here in the page's language, never by the browser's own bubble.
    expect(field.required).toBe(false);
    expect(field.getAttribute("aria-required")).toBe("true");
    expect(field.getAttribute("dir")).toBe("auto");
    fireEvent.click(screen.getByRole("button", { name: "Submit recommendation" }));
    const error = screen.getByRole("alert");
    expect(error.textContent).toBe("Record your clinical recommendation first.");
    expect(field.getAttribute("aria-invalid")).toBe("true");
    expect(field.getAttribute("aria-describedby")).toContain(error.id);
    expect(document.activeElement).toBe(field);
    expect(mutate).not.toHaveBeenCalled();

    fireEvent.change(field, { target: { value: "Pacemaker implantation" } });
    expect(field.getAttribute("aria-invalid")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Submit recommendation" }));
    // Said inside "2 Estimate lines", next to the list it is about.
    const lines = screen.getByRole("region", { name: "2 Estimate lines" });
    expect(within(lines).getByRole("alert").textContent).toBe("Choose at least one estimate line.");
    expect(mutate).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("checkbox", { name: /Echocardiogram/ }));
    // Fixed, the refusal goes.
    expect(within(lines).queryByRole("alert")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Submit recommendation" }));
    expect(mutate).toHaveBeenCalledTimes(1);
  });

  it("marks an off-list line with a clock and words, never as approved", () => {
    const { mutate } = setup();
    fireEvent.change(recommendationField(), { target: { value: "Lead extraction" } });
    fireEvent.change(screen.getByLabelText("Service"), { target: { value: "Bespoke lead extraction" } });
    fireEvent.change(screen.getByLabelText("Estimated amount (EGP)"), { target: { value: "50000" } });
    // P1-19: an off-list line says whose it is (default: someone else).
    expect((screen.getByLabelText("Paid to") as HTMLSelectElement).value).toBe("OTHER");
    fireEvent.change(screen.getByLabelText("Paid to"), { target: { value: "FACILITY" } });
    fireEvent.click(screen.getByRole("button", { name: "Add line" }));

    expect(screen.getByText("Needs Finance approval")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Remove Bespoke lead extraction" })).toBeTruthy();
    expect(screen.getByText("Paid to: The hospital")).toBeTruthy();
    // QA #8: the summary never calls an off-list amount "approved".
    // Nothing picked from the approved list: no "EGP 0" line.
    expect(within(screen.getByRole("region", { name: "Before you send" })).queryByText("Your approved list")).toBeNull();
    expect(summaryValue("Outside your list, needs Finance")).toMatch(/50,000/);
    fireEvent.click(screen.getByRole("button", { name: "Submit recommendation" }));
    expect(mutate).toHaveBeenCalledWith("/doctor/cases/case-1/review-decision", expect.objectContaining({
      costEstimates: [{ serviceDescription: "Bespoke lead extraction", estimatedCost: 50000, currency: "EGP", payee: "FACILITY" }],
    }));
  });

  it("says an incomplete off-list line at its fields, moves there, and reads Arabic-Indic digits", () => {
    const { mutate } = setup();
    fireEvent.change(screen.getByLabelText("Service"), { target: { value: "Bespoke lead extraction" } });
    fireEvent.click(screen.getByRole("button", { name: "Add line" }));
    expect(screen.getByRole("alert").textContent).toBe("Enter a service and an amount greater than zero.");
    const amount = screen.getByLabelText("Estimated amount (EGP)");
    expect(amount.getAttribute("aria-invalid")).toBe("true");
    expect(document.activeElement).toBe(amount);
    fireEvent.change(amount, { target: { value: "٥٠٬٠٠٠" } });
    expect(screen.queryByRole("alert")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Add line" }));
    // Removing the only line moves the focus to the disclosure, never to the page body.
    const remove = screen.getByRole("button", { name: "Remove Bespoke lead extraction" });
    remove.focus();
    fireEvent.click(remove);
    fireEvent.change(recommendationField(), { target: { value: "Lead extraction" } });
    expect(mutate).not.toHaveBeenCalled();
  });

  it("prices a Finance-approved facility package inside its range as an approved line (P0-5)", () => {
    const { mutate } = setup({ facilities: [{ id: "f1", name: "Nile Heart Hospital", city: "Cairo", kind: "HOSPITAL", accreditationStatus: "CURRENT",
      packages: [{ id: "pkg-1", procedureCode: "CABG", name: "Bypass package", careCategory: "cardiology", minEgp: 150000, maxEgp: 200000 }] }] });
    fireEvent.change(recommendationField(), { target: { value: "Bypass" } });
    fireEvent.click(screen.getByRole("checkbox", { name: /Bypass package/ }));
    expect(screen.queryByText("Needs Finance approval")).toBeNull();
    fireEvent.change(screen.getByLabelText("Expected (EGP)"), { target: { value: "180000" } });
    expect(summaryValue("Facility packages")).toMatch(/180,000/);
    fireEvent.click(screen.getByRole("button", { name: "Submit recommendation" }));
    expect(mutate).toHaveBeenCalledWith("/doctor/cases/case-1/review-decision", expect.objectContaining({
      costEstimates: [{ serviceDescription: "Bypass package — Nile Heart Hospital", estimatedCost: 180000, currency: "EGP", facilityPackageId: "pkg-1" }],
    }));
    // Once the decision was sent, a figure outside its range is said at once, at the figure.
    const figure = screen.getByLabelText("Expected (EGP)");
    fireEvent.change(figure, { target: { value: "250000" } });
    expect(screen.getByText("Outside the approved range")).toBeTruthy();
    expect(figure.getAttribute("aria-invalid")).toBe("true");
    mutate.mockClear();
    fireEvent.click(screen.getByRole("button", { name: "Submit recommendation" }));
    expect(mutate).not.toHaveBeenCalled();
    expect(screen.getByRole("alert").textContent).toBe("Set each package's expected figure inside its approved range.");
    // A cleared figure stays empty while retyping (it is not put back to 0).
    fireEvent.change(figure, { target: { value: "" } });
    expect((figure as HTMLInputElement).value).toBe("");
  });

  it("announces a package's range at its figure and says a wrong figure when the field is left, not while typing", () => {
    setup({ facilities: [{ id: "f1", name: "Nile Heart Hospital", city: "Cairo", kind: "HOSPITAL", accreditationStatus: "CURRENT",
      packages: [{ id: "pkg-1", procedureCode: "CABG", name: "Bypass package", careCategory: "cardiology", minEgp: 150000, maxEgp: 200000 }] }] });
    fireEvent.click(screen.getByRole("checkbox", { name: /Bypass package/ }));
    const figure = screen.getByLabelText("Expected (EGP)");
    expect(figure.getAttribute("aria-describedby")).toMatch(/-range$/);
    fireEvent.change(figure, { target: { value: "25" } });
    expect(screen.queryByText("Outside the approved range")).toBeNull();
    fireEvent.blur(figure);
    expect(screen.getByText("Outside the approved range")).toBeTruthy();
    expect(figure.getAttribute("aria-invalid")).toBe("true");
    // Arabic-Indic digits are read as the figure.
    fireEvent.change(figure, { target: { value: "١٨٠٠٠٠" } });
    expect(screen.queryByText("Outside the approved range")).toBeNull();
  });

  it("adds the converted lines, each rounded to the cent, as the proposal does (QA #12)", () => {
    // Two lines of EGP 1,000.25 at 0.02: each is $20.01, so the proposal shows $40.02 — the EGP total converted at once would be $40.01.
    setup({ catalog: [
      { id: "a", serviceCode: "A", serviceName: "Line A", category: "Procedure", priceEgp: 1000.25, active: true },
      { id: "b", serviceCode: "B", serviceName: "Line B", category: "Procedure", priceEgp: 1000.25, active: true },
    ], fxRates: [{ currency: "USD", rate: 0.02, rateDate: "2026-10-14", source: "CBE" }] });
    fireEvent.click(screen.getByRole("checkbox", { name: /Line A/ }));
    fireEvent.click(screen.getByRole("checkbox", { name: /Line B/ }));
    fireEvent.change(screen.getByLabelText("Proposal currency"), { target: { value: "USD" } });
    expect(summaryValue("Patient's proposal")).toMatch(/40\.02/);
  });

  it("keeps a draft's currency on the control when its rate is gone, and says so", () => {
    setup({ draft: { id: "draft-1", recommendedTreatment: "x", proposalCurrency: "GBP", costEstimates: [] } });
    expect((screen.getByLabelText("Proposal currency") as HTMLSelectElement).value).toBe("GBP");
    expect(screen.getByText(/No current exchange rate for/)).toBeTruthy();
  });

  it("keeps a draft's catalogue lines even when the catalogue arrives after the form", () => {
    const mutate = vi.fn().mockResolvedValue({ status: "SAVED" });
    const draft = { id: "draft-1", recommendedTreatment: "Pacemaker implantation",
      costEstimates: [{ serviceDescription: "Dual-chamber pacemaker implant", estimatedCost: 390000, currency: "EGP", catalogServiceId: "svc-1" }] };
    const panel = (list: CatalogService[]) => <ClinicalReviewPanel locale="en" caseId="case-1" busy={false} catalog={list} fxRates={fxRates} documentsOnFile={0} draft={draft} mutate={mutate} payees={getDictionary("en").portalProposal.price.payees}/>;
    const { rerender } = renderWithWork(panel([]));
    rerender(panel(catalog));
    expect(screen.getByRole("checkbox", { name: /Dual-chamber pacemaker implant/ })).toHaveProperty("checked", true);
    fireEvent.click(screen.getByRole("button", { name: "Save draft" }));
    expect(mutate).toHaveBeenCalledWith("/doctor/cases/case-1/reviews", expect.objectContaining({
      costEstimates: [{ serviceDescription: "Dual-chamber pacemaker implant", estimatedCost: 390000, currency: "EGP", catalogServiceId: "svc-1" }] }));
  });

  it("leads the summary with the clinical text and counts documents on file", () => {
    setup();
    fireEvent.change(recommendationField(), { target: { value: "Pacemaker implantation" } });
    fireEvent.click(screen.getByRole("checkbox", { name: /Dual-chamber pacemaker implant/ }));
    fireEvent.click(screen.getByRole("checkbox", { name: /Echocardiogram/ }));
    const summary = screen.getByRole("region", { name: "Before you send" });
    const terms = within(summary).getAllByRole("term").map(term => term.textContent);
    expect(terms[0]).toBe("Recommendation");
    expect(within(summary).getByText("Pacemaker implantation")).toBeTruthy();
    expect(summaryValue("Estimate lines")).toBe("2 lines");
    expect(summaryValue("Your approved list")).toMatch(/^EGP\s398,500$/);
    expect(summaryValue("Documents on file")).toBe("2");
    expect(within(summary).queryByText(/reviewed/i)).toBeNull();
  });

  it("saves a draft without submitting anything", () => {
    const { mutate } = setup();
    fireEvent.change(recommendationField(), { target: { value: "Pacemaker implantation" } });
    fireEvent.click(screen.getByRole("button", { name: "Save draft" }));
    expect(mutate).toHaveBeenCalledWith("/doctor/cases/case-1/reviews", expect.objectContaining({ recommendedTreatment: "Pacemaker implantation" }));
    expect(mutate).not.toHaveBeenCalledWith("/doctor/cases/case-1/review-decision", expect.anything());
  });

  it("resumes a saved draft, selections included", () => {
    setup({ draft: { id: "draft-1", recommendedTreatment: "Pacemaker implantation", risksAndLimitations: "Frailty",
                     costEstimates: [{ serviceDescription: "Dual-chamber pacemaker implant", estimatedCost: 390000, currency: "EGP", catalogServiceId: "svc-1" }] } });
    expect(recommendationField().value).toBe("Pacemaker implantation");
    expect((screen.getByLabelText("Risks, limitations and clinical considerations") as HTMLTextAreaElement).value).toBe("Frailty");
    expect((screen.getByRole("checkbox", { name: /Dual-chamber pacemaker implant/ }) as HTMLInputElement).checked).toBe(true);
  });

  it("requires a clinical reason before an exit is confirmed", () => {
    const { mutate } = setup();
    fireEvent.click(screen.getByRole("radio", { name: /Return without recommendation/ }));
    fireEvent.click(screen.getByRole("button", { name: "Return to coordinator" }));
    expect(screen.getByRole("alert").textContent).toBe("Add the clinical reason before you continue.");
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(mutate).not.toHaveBeenCalled();
  });

  it("confirms every exit in the native dialog, worded for that exit", () => {
    const confirmSpy = vi.spyOn(window, "confirm");
    const { mutate } = setup();
    fireEvent.click(screen.getByRole("radio", { name: /Not clinically suitable/ }));
    fireEvent.change(screen.getByLabelText("Clinical reason"), { target: { value: "Comorbidities preclude surgery" } });
    fireEvent.click(screen.getByRole("button", { name: "Record not clinically suitable" }));
    const dialog = screen.getByRole("alertdialog", { name: "Record this case as not clinically suitable?" });
    expect(dialog.tagName).toBe("DIALOG");
    // Keeping on reviewing sends nothing.
    fireEvent.click(within(dialog).getByRole("button", { name: "Keep reviewing" }));
    expect(mutate).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Record not clinically suitable" }));
    fireEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Record not clinically suitable" }));
    expect(mutate).toHaveBeenCalledWith("/doctor/cases/case-1/review-decision", { decision: "NOT_SUITABLE", risksAndLimitations: "Comorbidities preclude surgery" });
    expect(confirmSpy).not.toHaveBeenCalled();
    confirmSpy.mockRestore();
  });

  it("confirms a return to the coordinator before sending it", () => {
    const { mutate } = setup();
    fireEvent.click(screen.getByRole("radio", { name: /Return without recommendation/ }));
    fireEvent.change(screen.getByLabelText("Clinical reason"), { target: { value: "Needs a different care pathway" } });
    fireEvent.click(screen.getByRole("button", { name: "Return to coordinator" }));
    fireEvent.click(within(screen.getByRole("alertdialog", { name: "Return the case without a recommendation?" })).getByRole("button", { name: "Return to coordinator" }));
    expect(mutate).toHaveBeenCalledWith("/doctor/cases/case-1/review-decision", { decision: "RETURN_TO_COORDINATOR", risksAndLimitations: "Needs a different care pathway" });
  });
});

describe("CaseEvidence", () => {
  afterEach(cleanup);
  const documents = [
    { documentId: "d1", fileName: "Medical report.pdf", status: "CLEAN" },
    { documentId: "d2", fileName: "ECG.jpg", status: "PENDING" },
  ];

  it("opens with the intake summary in the writer's direction and the documents on file, in reach", () => {
    const viewDoc = vi.fn();
    renderWithWork(<CaseEvidence locale="en" intakeSummary="Chest pain on exertion." documents={documents} viewDoc={viewDoc} downloadDoc={vi.fn()}/>);
    expect(screen.getByText("Chest pain on exertion.").getAttribute("dir")).toBe("auto");
    expect(screen.getByRole("heading", { name: /Documents on file/ })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /^Preview ?Medical report\.pdf$/ }));
    expect(viewDoc).toHaveBeenCalledWith("d1");
    expect(screen.getByText("Security scan in progress")).toBeTruthy();
  });

  it("shows the preliminary recommendation, its lines and the patient's currency at the final assessment", () => {
    renderWithWork(<CaseEvidence locale="en" intakeSummary="" documents={[]} viewDoc={vi.fn()} downloadDoc={vi.fn()}
      preliminary={{ recommendedTreatment: "Angioplasty with one stent.", proposalCurrency: "USD", costEstimates: [{ serviceDescription: "Angioplasty", estimatedCost: 45000, currency: "EGP" }] }}
/>);
    expect(screen.getByRole("heading", { name: "Your preliminary recommendation" })).toBeTruthy();
    expect(screen.getByText("Angioplasty with one stent.")).toBeTruthy();
    expect(screen.getByText("Patient's proposal currency: US Dollar (USD)")).toBeTruthy();
    expect(screen.getByText("No intake summary was written.")).toBeTruthy();
  });
});
