import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { CaseWorkspaceProvider, FinalAssessment } from "./StaffCaseView";
import type { DirectoryFacility } from "./portal-model";
import { getDictionary } from "@/lib/dictionary";

const facilities: DirectoryFacility[] = [{ id: "f1", name: "Nile Heart Hospital", city: "Cairo", kind: "HOSPITAL", accreditationStatus: "CURRENT",
  packages: [{ id: "pkg-1", procedureCode: "CABG", name: "Bypass package", careCategory: "cardiology", minEgp: 150000, maxEgp: 200000 }] }];

function setup(mutate = vi.fn().mockResolvedValue({ id: "r1" })) {
  render(<CaseWorkspaceProvider value={{ locale: "en", t: {} as never, role: "doctor", c: { id: "c1", status: "ARRIVAL_CONFIRMED", version: 1 } as never,
      busy: false, mutate, price: getDictionary("en").portalProposal.price, fxRates: [], catalog: [], facilities, mySubject: "doctor-subject" }}><FinalAssessment/></CaseWorkspaceProvider>);
  return mutate;
}

/** P0-5 (B-02): the final in-person assessment prices facility packages the same way the clinical review does. */
describe("FinalAssessment facility package line", () => {
  afterEach(cleanup);

  it("sends a Finance-approved package with the expected figure inside its range as an approved line", () => {
    const mutate = setup();
    fireEvent.click(screen.getByRole("checkbox", { name: /Bypass package/ }));
    fireEvent.change(screen.getByLabelText("Expected (EGP)"), { target: { value: "180000" } });
    fireEvent.click(screen.getByRole("button", { name: "Save final assessment" }));
    expect(mutate).toHaveBeenCalledWith("/doctor/cases/c1/final-assessment", expect.objectContaining({
      costEstimates: [{ serviceDescription: "Bypass package — Nile Heart Hospital", estimatedCost: 180000, currency: "EGP", facilityPackageId: "pkg-1" }],
    }));
  });

  it("holds the save while a package figure is outside its approved range", () => {
    const mutate = setup();
    fireEvent.click(screen.getByRole("checkbox", { name: /Bypass package/ }));
    fireEvent.change(screen.getByLabelText("Expected (EGP)"), { target: { value: "250000" } });
    expect(screen.getByText("Outside the approved range")).toBeVisible();
    expect(screen.getByRole("button", { name: "Save final assessment" })).toBeDisabled();
    expect(mutate).not.toHaveBeenCalled();
  });

  it("P1-19: a manual line says whose it is, the hospital's here; it defaults to someone else", () => {
    const mutate = setup();
    fireEvent.change(screen.getAllByLabelText("Service")[0], { target: { value: "Hospital stay and cath lab" } });
    fireEvent.change(screen.getAllByLabelText("Amount")[0], { target: { value: "20000" } });
    const payee = screen.getByRole("combobox", { name: "Paid to" });
    expect(payee).toHaveValue("OTHER");
    fireEvent.change(payee, { target: { value: "FACILITY" } });
    fireEvent.click(screen.getByRole("button", { name: "Save final assessment" }));
    expect(mutate).toHaveBeenCalledWith("/doctor/cases/c1/final-assessment", expect.objectContaining({
      costEstimates: [{ serviceDescription: "Hospital stay and cath lab", estimatedCost: 20000, currency: "EGP", payee: "FACILITY" }],
    }));
  });
});
