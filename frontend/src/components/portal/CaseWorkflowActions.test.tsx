import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { CaseWorkflowActions } from "./CaseWorkflowActions";
import { renderWithWork } from "./test-copy";

const facilities = [{ id: "f1", name: "Nile Heart Hospital", city: "Cairo", kind: "HOSPITAL", accreditationStatus: "CURRENT", packages: [] }];

/** P0-5 session 3: the travel plan names a facility from the directory, never free text. */
describe("CaseWorkflowActions facility pickers", () => {
  afterEach(cleanup);

  it("Operations picks the travel destination from the facility directory and sends its id", () => {
    const mutate = vi.fn().mockResolvedValue({ id: "t1" });
    render(<CaseWorkflowActions locale="en" role="operations" caseSummary={{ id: "c1", status: "ACCEPTED", version: 1 }}
                                availableActions={["UPDATE_TRAVEL_PLAN"]} mutate={mutate} facilities={facilities}/>);
    const picker = screen.getByLabelText("Facility");
    expect(picker.tagName).toBe("SELECT");
    expect(screen.getByRole("option", { name: "Nile Heart Hospital · Cairo" })).toBeInTheDocument();
    fireEvent.change(picker, { target: { value: "f1" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(mutate).toHaveBeenCalledWith("/operations/cases/c1/travel", expect.objectContaining({ facilityId: "f1", status: "PLANNING" }), "PUT");
  });

  it("reopens the travel form on the facility and status already stored", () => {
    render(<CaseWorkflowActions locale="en" role="operations" caseSummary={{ id: "c1", status: "TRAVEL_COORDINATION", version: 1 }}
                                availableActions={["UPDATE_TRAVEL_PLAN"]} mutate={vi.fn()} facilities={facilities} travelPlan={{ facilityId: "f1", status: "CONFIRMED" }}/>);
    expect((screen.getByLabelText("Facility") as HTMLSelectElement).value).toBe("f1");
    expect((screen.getByLabelText("Status") as HTMLSelectElement).value).toBe("CONFIRMED");
  });

  // UX 3-1 retired the legacy episode and follow-up forms; B-3-1b the start of treatment (it starts on the admission number).
  it("offers the Consultant nothing here, from arrival to after discharge", () => {
    for (const status of ["ARRIVAL_CONFIRMED", "ADMISSION_READY", "TREATMENT_IN_PROGRESS", "DISCHARGED", "FOLLOW_UP"]) {
      const { container } = renderWithWork(<CaseWorkflowActions locale="en" role="doctor" caseSummary={{ id: "c1", status, version: 1 }} mutate={vi.fn()} facilities={facilities}/>);
      expect(container).toBeEmptyDOMElement();
      cleanup();
    }
  });
});
