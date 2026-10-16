import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { CaseWorkspaceProvider, FinalAssessment } from "./StaffCaseView";
import { renderWithWork } from "./test-copy";
import type { DirectoryFacility } from "./portal-model";

const facilities: DirectoryFacility[] = [{ id: "f1", name: "Nile Heart Hospital", city: "Cairo", kind: "HOSPITAL", accreditationStatus: "CURRENT",
  packages: [{ id: "pkg-1", procedureCode: "CABG", name: "Bypass package", careCategory: "cardiology", minEgp: 150000, maxEgp: 200000 }] }];

function setup(mutate = vi.fn().mockResolvedValue({ id: "r1" })) {
  renderWithWork(<CaseWorkspaceProvider value={{ locale: "en", t: {} as never, role: "doctor", c: { id: "c1", status: "ARRIVAL_CONFIRMED", version: 1 } as never,
      busy: false, mutate, price: {} as never, fxRates: [], catalog: [], facilities, mySubject: "doctor-subject" }}><FinalAssessment/></CaseWorkspaceProvider>);
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
});
