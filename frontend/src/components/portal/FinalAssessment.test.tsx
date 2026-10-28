import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen, within } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { CaseWorkspaceProvider, FinalAssessment } from "./StaffCaseView";
import { renderWithWork } from "./test-copy";
import type { CatalogService, DirectoryFacility, Review } from "./portal-model";
import { getDictionary } from "@/lib/dictionary";

const facilities: DirectoryFacility[] = [{ id: "f1", name: "Nile Heart Hospital", city: "Cairo", kind: "HOSPITAL", accreditationStatus: "CURRENT",
  packages: [{ id: "pkg-1", procedureCode: "CABG", name: "Bypass package", careCategory: "cardiology", minEgp: 150000, maxEgp: 200000 }] }];
const catalog: CatalogService[] = [{ id: "s2", serviceCode: "CARD-PCI", serviceName: "Coronary angioplasty (Consultant fee)", category: "Procedure", priceEgp: 45000, active: true }];
const preliminary: Review = { id: "r1", versionNumber: 1, status: "APPROVED", recommendedTreatment: "Angioplasty with one stent.", risksAndLimitations: "Subject to a repeat angiogram.",
  createdAt: "2026-10-01T10:00:00Z", proposalCurrency: "USD",
  costEstimates: [{ serviceDescription: "Coronary angioplasty (Consultant fee)", estimatedCost: 45000, currency: "EGP", catalogServiceId: "s2" }] };

function setup({ mutate = vi.fn().mockResolvedValue({ id: "r2" }), seed = null as Review | null, savedAt = null as string | null } = {}) {
  renderWithWork(<CaseWorkspaceProvider value={{ locale: "en", t: {} as never, role: "doctor", c: { id: "c1", status: "ARRIVAL_CONFIRMED", version: 1 } as never,
      busy: false, mutate, price: getDictionary("en").portalProposal.price, fxRates: [{ currency: "USD", rate: 0.02, rateDate: "2026-10-15", source: "CBE" }], catalog, facilities, mySubject: "doctor-subject" }}><FinalAssessment seed={seed} savedAt={savedAt} documentsOnFile={3}/></CaseWorkspaceProvider>);
  return mutate;
}
const recommendation = () => screen.getByLabelText("Clinical recommendation") as HTMLTextAreaElement;

/** UX 3-1: the final in-person assessment is the review's grammar, starting from the Consultant's preliminary recommendation. */
describe("FinalAssessment", () => {
  afterEach(cleanup);

  it("starts from the preliminary recommendation and its lines, and names the patient's currency", () => {
    const mutate = setup({ seed: preliminary });
    expect(screen.getByRole("heading", { level: 3, name: "Final assessment" })).toBeVisible();
    expect(recommendation().value).toBe("Angioplasty with one stent.");
    expect(screen.getByRole("checkbox", { name: /Coronary angioplasty/ })).toBeChecked();
    expect(screen.getByText(/The patient's final quote is prepared in US Dollar \(USD\)/)).toBeVisible();
    // The same money as the review: what the lines come to in the patient's currency.
    expect(within(screen.getByRole("region", { name: "Before you save" })).getByText("Patient's proposal").nextElementSibling).toHaveTextContent("$900");
    // No display-currency control: the currency is the preliminary estimate's, carried by the backend.
    expect(screen.queryByRole("combobox", { name: /currency/i })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Save final assessment" }));
    expect(mutate).toHaveBeenCalledWith("/doctor/cases/c1/final-assessment", {
      recommendedTreatment: "Angioplasty with one stent.", risksAndLimitations: "Subject to a repeat angiogram.",
      costEstimates: [{ serviceDescription: "Coronary angioplasty (Consultant fee)", estimatedCost: 45000, currency: "EGP", catalogServiceId: "s2" }],
    });
  });

  it("says when it was saved, beside the button that saves a new version", () => {
    setup({ seed: preliminary, savedAt: "2026-10-16T09:00:00Z" });
    expect(screen.getByText(/^Saved on .*The coordinator prepares the final quote from it\.$/)).toBeVisible();
    expect(screen.getByRole("button", { name: "Save a new version" })).toBeVisible();
  });

  it("names no currency when there is no preliminary estimate to carry one", () => {
    setup();
    expect(screen.getByText("The patient's final quote is prepared in the currency the coordinator chooses. Your lines stay in EGP.")).toBeVisible();
  });

  it("refuses an empty save at the control instead of doing nothing", () => {
    const mutate = setup();
    fireEvent.click(screen.getByRole("button", { name: "Save final assessment" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Record your clinical recommendation first.");
    expect(recommendation()).toHaveFocus();
    fireEvent.change(recommendation(), { target: { value: "Angioplasty" } });
    fireEvent.click(screen.getByRole("button", { name: "Save final assessment" }));
    const lines = screen.getByRole("region", { name: "2 Estimate lines" });
    expect(within(lines).getByRole("alert")).toHaveTextContent("Choose at least one estimate line.");
    expect(mutate).not.toHaveBeenCalled();
  });

  it("keeps what was typed when a save fails, and says so in place", async () => {
    const mutate = setup({ mutate: vi.fn().mockResolvedValue(undefined), seed: preliminary });
    fireEvent.change(recommendation(), { target: { value: "Angioplasty with two stents." } });
    fireEvent.click(screen.getByRole("button", { name: "Save final assessment" }));
    await vi.waitFor(() => expect(mutate).toHaveBeenCalled());
    expect(await screen.findByRole("alert")).toHaveTextContent("Not saved. What you entered is still here; try again.");
    expect(recommendation().value).toBe("Angioplasty with two stents.");
    expect(screen.getByRole("checkbox", { name: /Coronary angioplasty/ })).toBeChecked();
  });

  it("G-2: saves a draft without the final assessment's checks, and keeps it on a failed save", async () => {
    const mutate = setup({ mutate: vi.fn().mockResolvedValue(undefined) });
    fireEvent.change(recommendation(), { target: { value: "Angioplasty, scope to confirm" } });
    fireEvent.click(screen.getByRole("button", { name: "Save draft" }));
    expect(mutate).toHaveBeenCalledWith("/doctor/cases/c1/final-assessment/draft", { recommendedTreatment: "Angioplasty, scope to confirm", risksAndLimitations: undefined, costEstimates: [] });
    expect(await screen.findByRole("alert")).toHaveTextContent("Not saved.");
    expect(recommendation().value).toBe("Angioplasty, scope to confirm");
  });

  it("G-2: refuses an empty draft at the button", () => {
    const mutate = setup();
    fireEvent.click(screen.getByRole("button", { name: "Save draft" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Add a recommendation or a line before saving a draft.");
    expect(mutate).not.toHaveBeenCalled();
  });

  it("G-2: reopens on the draft and says it is not saved yet", () => {
    setup({ seed: { ...preliminary, id: "r3", versionNumber: 3, status: "DRAFT", recommendedTreatment: "Two stents, pending the angiogram.", createdAt: "2026-10-17T09:00:00Z" } });
    expect(recommendation().value).toBe("Two stents, pending the angiogram.");
    expect(screen.getByText(/^Draft saved on .*It is not your final assessment until you save it\.$/)).toBeVisible();
    expect(screen.getByRole("button", { name: "Save final assessment" })).toBeVisible();
  });

  it("sends a Finance-approved package with the expected figure inside its range as an approved line", () => {
    const mutate = setup();
    fireEvent.change(recommendation(), { target: { value: "Bypass" } });
    fireEvent.click(screen.getByRole("checkbox", { name: /Bypass package/ }));
    fireEvent.change(screen.getByLabelText("Expected (EGP)"), { target: { value: "180000" } });
    fireEvent.click(screen.getByRole("button", { name: "Save final assessment" }));
    expect(mutate).toHaveBeenCalledWith("/doctor/cases/c1/final-assessment", expect.objectContaining({
      costEstimates: [{ serviceDescription: "Bypass package — Nile Heart Hospital", estimatedCost: 180000, currency: "EGP", facilityPackageId: "pkg-1" }],
    }));
  });

  it("holds the save while a package figure is outside its approved range, and says why at the lines", () => {
    const mutate = setup();
    fireEvent.change(recommendation(), { target: { value: "Bypass" } });
    fireEvent.click(screen.getByRole("checkbox", { name: /Bypass package/ }));
    fireEvent.change(screen.getByLabelText("Expected (EGP)"), { target: { value: "250000" } });
    fireEvent.click(screen.getByRole("button", { name: "Save final assessment" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Set each package's expected figure inside its approved range.");
    expect(screen.getByText("Outside the approved range")).toBeVisible();
    expect(mutate).not.toHaveBeenCalled();
  });

  it("P1-19: a manual line says whose it is, the hospital's here; it defaults to someone else", () => {
    const mutate = setup();
    fireEvent.change(recommendation(), { target: { value: "Angioplasty" } });
    fireEvent.change(screen.getByLabelText("Service"), { target: { value: "Hospital stay and cath lab" } });
    fireEvent.change(screen.getByLabelText("Estimated amount (EGP)"), { target: { value: "20000" } });
    const payee = screen.getByRole("combobox", { name: "Paid to" });
    expect(payee).toHaveValue("OTHER");
    fireEvent.change(payee, { target: { value: "FACILITY" } });
    fireEvent.click(screen.getByRole("button", { name: "Add line" }));
    expect(screen.getByText("Paid to: The hospital")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Save final assessment" }));
    expect(mutate).toHaveBeenCalledWith("/doctor/cases/c1/final-assessment", expect.objectContaining({
      costEstimates: [{ serviceDescription: "Hospital stay and cath lab", estimatedCost: 20000, currency: "EGP", payee: "FACILITY" }],
    }));
  });
});
