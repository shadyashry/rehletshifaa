import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";

import { ClinicalReviewPanel, type CatalogService, type FxRate, type ReviewDocument } from "./ClinicalReview";
import { getDictionary } from "@/lib/dictionary";

const catalog: CatalogService[] = [
  { id: "svc-1", serviceCode: "PACE-DUAL", serviceName: "Dual-chamber pacemaker implant", category: "Procedure", priceEgp: 390000, active: true },
  { id: "svc-2", serviceCode: "ECHO", serviceName: "Echocardiogram", category: "Diagnostic", priceEgp: 8500, active: true },
];
const fxRates: FxRate[] = [{ currency: "USD", rate: 0.0207, rateDate: "2026-09-10", source: "CBE" }];
const documents: ReviewDocument[] = [
  { documentId: "d1", fileName: "Medical report.pdf", status: "CLEAN" },
  { documentId: "d2", fileName: "Echo.pdf", status: "CLEAN" },
];

function setup(overrides: Partial<Parameters<typeof ClinicalReviewPanel>[0]> = {}) {
  const mutate = vi.fn().mockResolvedValue({ status: "SAVED" });
  const viewDoc = vi.fn();
  render(<ClinicalReviewPanel locale="en" caseId="case-1" busy={false} catalog={catalog} fxRates={fxRates}
                              documents={documents} viewDoc={viewDoc} downloadDoc={vi.fn()} mutate={mutate} payees={getDictionary("en").portalProposal.price.payees} {...overrides}/>);
  return { mutate, viewDoc };
}

/**
 * The consultant screen has exactly one normal completion. Everything below verifies that promise and
 * the two rules the domain depends on: catalogue prices stay authoritative in EGP, and the currency the
 * consultant selects is the one the patient proposal is issued in.
 */
describe("ClinicalReviewPanel", () => {
  afterEach(cleanup);

  it("offers one primary completion and keeps exceptional outcomes behind a single disclosure", () => {
    setup();
    expect(screen.getByRole("button", { name: "Submit recommendation" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Save draft" })).toBeTruthy();
    // The old competing CTAs are gone from the page surface.
    for (const gone of ["Accept", "Complete Task", "Start Review", "Return to coordinator"])
      expect(screen.queryByRole("button", { name: gone })).toBeNull();
    // The three exceptional outcomes exist, but only as options inside one disclosure. Referrals have their own flow.
    expect(screen.getByText("Other clinical outcome")).toBeTruthy();
    expect(screen.queryByRole("radio", { name: /Request second opinion/ })).toBeNull();
    for (const outcome of ["Request additional information", "Return without recommendation", "Not clinically suitable"])
      expect(screen.getByRole("radio", { name: new RegExp(outcome) })).toBeTruthy();
  });

  it("keeps the documents in reach without leaving the page", () => {
    const { viewDoc } = setup();
    // Repeated Preview / Download name the file they act on.
    fireEvent.click(screen.getByRole("button", { name: /^Preview ?Medical report\.pdf$/ }));
    expect(screen.getByRole("button", { name: /^Download ?Medical report\.pdf$/ })).toBeTruthy();
    expect(viewDoc).toHaveBeenCalledWith("d1");
  });

  it("keeps the catalogue price authoritative while issuing the proposal in the chosen currency", () => {
    const { mutate } = setup();
    fireEvent.change(screen.getByLabelText("Clinical recommendation"), { target: { value: "Pacemaker implantation" } });
    const pacemaker = screen.getByRole("checkbox", { name: /Dual-chamber pacemaker implant/ });
    fireEvent.click(pacemaker);
    const row = () => within(pacemaker.closest("label")!);
    expect(row().getByText("EGP 390,000")).toBeTruthy();

    // Choosing a proposal currency restates the value the patient will see; it never rewrites the catalogue.
    fireEvent.change(screen.getByLabelText("Proposal currency"), { target: { value: "USD" } });
    expect(row().getByText(/8,073/)).toBeTruthy();

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
    fireEvent.change(screen.getByLabelText("Clinical recommendation"), { target: { value: "Pacemaker implantation" } });
    fireEvent.change(screen.getByLabelText("Proposal currency"), { target: { value: "USD" } });
    fireEvent.click(screen.getByRole("button", { name: "Save draft" }));
    expect(mutate).toHaveBeenCalledWith("/doctor/cases/case-1/reviews", expect.objectContaining({ proposalCurrency: "USD" }));

    cleanup();
    setup({ draft: { id: "draft-1", recommendedTreatment: "Pacemaker implantation", proposalCurrency: "USD", costEstimates: [] } });
    expect((screen.getByLabelText("Proposal currency") as HTMLSelectElement).value).toBe("USD");
  });

  it("marks the clinical recommendation as required and explains a missing one next to the field", () => {
    const { mutate } = setup();
    const field = screen.getByLabelText("Clinical recommendation") as HTMLTextAreaElement;
    // Required before submission, and said so accessibly — not only with an asterisk.
    expect(field.required).toBe(true);
    expect(field.getAttribute("aria-required")).toBe("true");
    expect(screen.getByText("(* Required before submitting)")).toBeTruthy();
    // Submitting empty explains at the field, moves focus there, and never reaches the API.
    fireEvent.click(screen.getByRole("button", { name: "Submit recommendation" }));
    const error = screen.getByRole("alert");
    expect(error.textContent).toContain("Record your clinical recommendation before submitting.");
    expect(field.getAttribute("aria-invalid")).toBe("true");
    expect(field.getAttribute("aria-describedby")).toContain(error.id);
    expect(document.activeElement).toBe(field);
    expect(mutate).not.toHaveBeenCalled();
    // Typing clears the field error; a missing service is still reported, still without an API call.
    fireEvent.change(field, { target: { value: "Pacemaker implantation" } });
    expect(field.getAttribute("aria-invalid")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Submit recommendation" }));
    expect(screen.getByRole("alert").textContent).toContain("Select at least one recommended service before submitting.");
    expect(mutate).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("checkbox", { name: /Echocardiogram/ }));
    fireEvent.click(screen.getByRole("button", { name: "Submit recommendation" }));
    expect(mutate).toHaveBeenCalledTimes(1);
  });

  it("treats an off-list service as an exception that Finance must approve", () => {
    const { mutate } = setup();
    fireEvent.change(screen.getByLabelText("Clinical recommendation"), { target: { value: "Lead extraction" } });
    fireEvent.change(screen.getByLabelText("Service name"), { target: { value: "Bespoke lead extraction" } });
    fireEvent.change(screen.getByLabelText("Estimated amount (EGP)"), { target: { value: "50000" } });
    // P1-19: an off-list line says whose it is (default: someone else).
    expect((screen.getByLabelText("Paid to") as HTMLSelectElement).value).toBe("OTHER");
    fireEvent.change(screen.getByLabelText("Paid to"), { target: { value: "FACILITY" } });
    fireEvent.click(screen.getByRole("button", { name: "Add service" }));

    expect(screen.getByText("Requires Finance approval")).toBeTruthy();
    expect(screen.getByText("Paid to: The hospital")).toBeTruthy();
    // QA #8: the summary never calls an off-list amount "approved".
    const summary = (label: string) => screen.getByText(label).nextElementSibling?.textContent;
    expect(summary("Approved catalogue price")).toMatch(/^EGP\s?0/);
    expect(summary("Outside your list — needs Finance approval")).toMatch(/50,000/);
    expect(summary("Estimate total")).toMatch(/50,000/);
    fireEvent.click(screen.getByRole("button", { name: "Submit recommendation" }));
    expect(mutate).toHaveBeenCalledWith("/doctor/cases/case-1/review-decision", expect.objectContaining({
      costEstimates: [{ serviceDescription: "Bespoke lead extraction", estimatedCost: 50000, currency: "EGP", payee: "FACILITY" }],
    }));
  });

  it("prices a Finance-approved facility package inside its range as an approved line (P0-5)", () => {
    const { mutate } = setup({ facilities: [{ id: "f1", name: "Nile Heart Hospital", city: "Cairo", kind: "HOSPITAL", accreditationStatus: "CURRENT",
      packages: [{ id: "pkg-1", procedureCode: "CABG", name: "Bypass package", careCategory: "cardiology", minEgp: 150000, maxEgp: 200000 }] }] });
    fireEvent.change(screen.getByLabelText("Clinical recommendation"), { target: { value: "Bypass" } });
    fireEvent.click(screen.getByRole("checkbox", { name: /Bypass package/ }));
    expect(screen.queryByText("Requires Finance approval")).toBeNull();
    fireEvent.change(screen.getByLabelText("Expected (EGP)"), { target: { value: "180000" } });
    const summary = (label: string) => screen.getByText(label).nextElementSibling?.textContent;
    expect(summary("Approved facility packages")).toMatch(/180,000/);
    fireEvent.click(screen.getByRole("button", { name: "Submit recommendation" }));
    expect(mutate).toHaveBeenCalledWith("/doctor/cases/case-1/review-decision", expect.objectContaining({
      costEstimates: [{ serviceDescription: "Bypass package — Nile Heart Hospital", estimatedCost: 180000, currency: "EGP", facilityPackageId: "pkg-1" }],
    }));
    // Outside the approved range the line is flagged and the submit is held back, as the server would refuse it.
    fireEvent.change(screen.getByLabelText("Expected (EGP)"), { target: { value: "250000" } });
    expect(screen.getByText("Outside the approved range")).toBeTruthy();
    mutate.mockClear();
    fireEvent.click(screen.getByRole("button", { name: "Submit recommendation" }));
    expect(mutate).not.toHaveBeenCalled();
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
    expect(screen.getByText("Proposal value").nextElementSibling?.textContent).toMatch(/40\.02/);
  });

  it("summarises the recommendation before it is submitted", () => {
    setup();
    fireEvent.change(screen.getByLabelText("Clinical recommendation"), { target: { value: "Pacemaker implantation" } });
    fireEvent.click(screen.getByRole("checkbox", { name: /Dual-chamber pacemaker implant/ }));
    fireEvent.click(screen.getByRole("checkbox", { name: /Echocardiogram/ }));
    const summary = screen.getByLabelText("Recommendation summary");
    expect(within(summary).getByText("2 selected")).toBeTruthy();
    expect(within(summary).getByText("EGP 398,500")).toBeTruthy();
    expect(within(summary).getByText("2")).toBeTruthy(); // documents reviewed
  });

  it("saves a draft without submitting anything", () => {
    const { mutate } = setup();
    fireEvent.change(screen.getByLabelText("Clinical recommendation"), { target: { value: "Pacemaker implantation" } });
    fireEvent.click(screen.getByRole("button", { name: "Save draft" }));
    expect(mutate).toHaveBeenCalledWith("/doctor/cases/case-1/reviews", expect.objectContaining({
      recommendedTreatment: "Pacemaker implantation",
    }));
    expect(mutate).not.toHaveBeenCalledWith("/doctor/cases/case-1/review-decision", expect.anything());
  });

  it("resumes a saved draft, selections included", () => {
    setup({ draft: { id: "draft-1", recommendedTreatment: "Pacemaker implantation", risksAndLimitations: "Frailty",
                     costEstimates: [{ serviceDescription: "Dual-chamber pacemaker implant", estimatedCost: 390000, currency: "EGP", catalogServiceId: "svc-1" }] } });
    expect((screen.getByLabelText("Clinical recommendation") as HTMLTextAreaElement).value).toBe("Pacemaker implantation");
    expect((screen.getByLabelText("Risks, limitations & clinical considerations") as HTMLTextAreaElement).value).toBe("Frailty");
    expect((screen.getByRole("checkbox", { name: /Dual-chamber pacemaker implant/ }) as HTMLInputElement).checked).toBe(true);
  });

  it("requires a clinical reason before an exceptional outcome is sent", () => {
    const { mutate } = setup();
    fireEvent.click(screen.getByRole("radio", { name: /Return without recommendation/ }));
    const confirm = screen.getByRole("button", { name: "Return to coordinator" });
    expect(confirm.hasAttribute("disabled")).toBe(true);

    fireEvent.change(screen.getByLabelText("Clinical reason"), { target: { value: "Needs a different care pathway" } });
    fireEvent.click(screen.getByRole("button", { name: "Return to coordinator" }));
    expect(mutate).toHaveBeenCalledWith("/doctor/cases/case-1/review-decision", {
      decision: "RETURN_TO_COORDINATOR", risksAndLimitations: "Needs a different care pathway",
    });
  });

  it("confirms before recording a case as not clinically suitable", () => {
    const { mutate } = setup();
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
    fireEvent.click(screen.getByRole("radio", { name: /Not clinically suitable/ }));
    fireEvent.change(screen.getByLabelText("Clinical reason"), { target: { value: "Comorbidities preclude surgery" } });
    fireEvent.click(screen.getByRole("button", { name: "Confirm not clinically suitable" }));
    expect(confirmSpy).toHaveBeenCalled();
    expect(mutate).not.toHaveBeenCalled();

    confirmSpy.mockReturnValue(true);
    fireEvent.click(screen.getByRole("button", { name: "Confirm not clinically suitable" }));
    expect(mutate).toHaveBeenCalledWith("/doctor/cases/case-1/review-decision", {
      decision: "NOT_SUITABLE", risksAndLimitations: "Comorbidities preclude surgery",
    });
    confirmSpy.mockRestore();
  });
});
