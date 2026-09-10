import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";

import { ClinicalReviewPanel, type CatalogService, type FxRate, type ReviewDocument } from "./ClinicalReview";

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
                              documents={documents} viewDoc={viewDoc} downloadDoc={vi.fn()} mutate={mutate} {...overrides}/>);
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
    // The four exceptional outcomes exist, but only as options inside one disclosure.
    expect(screen.getByText("Other clinical outcome")).toBeTruthy();
    for (const outcome of ["Request additional information", "Request second opinion", "Return without recommendation", "Not clinically suitable"])
      expect(screen.getByRole("radio", { name: new RegExp(outcome) })).toBeTruthy();
  });

  it("keeps the documents in reach without leaving the page", () => {
    const { viewDoc } = setup();
    fireEvent.click(within(screen.getByText("Medical report.pdf").closest("li")!).getByRole("button", { name: "Preview" }));
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

  it("will not submit without a recommendation and at least one service", () => {
    const { mutate } = setup();
    expect(screen.getByRole("button", { name: "Submit recommendation" }).hasAttribute("disabled")).toBe(true);
    fireEvent.change(screen.getByLabelText("Clinical recommendation"), { target: { value: "Pacemaker implantation" } });
    expect(screen.getByRole("button", { name: "Submit recommendation" }).hasAttribute("disabled")).toBe(true);
    fireEvent.click(screen.getByRole("checkbox", { name: /Echocardiogram/ }));
    expect(screen.getByRole("button", { name: "Submit recommendation" }).hasAttribute("disabled")).toBe(false);
    expect(mutate).not.toHaveBeenCalled();
  });

  it("treats an off-list service as an exception that Finance must approve", () => {
    const { mutate } = setup();
    fireEvent.change(screen.getByLabelText("Clinical recommendation"), { target: { value: "Lead extraction" } });
    fireEvent.change(screen.getByLabelText("Service name"), { target: { value: "Bespoke lead extraction" } });
    fireEvent.change(screen.getByLabelText("Estimated amount (EGP)"), { target: { value: "50000" } });
    fireEvent.click(screen.getByRole("button", { name: "Add service" }));

    expect(screen.getByText("Requires Finance approval")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Submit recommendation" }));
    expect(mutate).toHaveBeenCalledWith("/doctor/cases/case-1/review-decision", expect.objectContaining({
      costEstimates: [{ serviceDescription: "Bespoke lead extraction", estimatedCost: 50000, currency: "EGP" }],
    }));
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
    fireEvent.click(screen.getByRole("radio", { name: /Request second opinion/ }));
    const confirm = screen.getByRole("button", { name: "Request second opinion" });
    expect(confirm.hasAttribute("disabled")).toBe(true);

    fireEvent.change(screen.getByLabelText("Clinical reason"), { target: { value: "Electrophysiology opinion needed" } });
    fireEvent.click(screen.getByRole("button", { name: "Request second opinion" }));
    expect(mutate).toHaveBeenCalledWith("/doctor/cases/case-1/review-decision", {
      decision: "REASSIGN", risksAndLimitations: "Electrophysiology opinion needed",
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
