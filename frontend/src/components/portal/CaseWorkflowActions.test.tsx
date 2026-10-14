import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { CaseWorkflowActions } from "./CaseWorkflowActions";

const facilities = [{ id: "f1", name: "Nile Heart Hospital", city: "Cairo", kind: "HOSPITAL", accreditationStatus: "CURRENT", packages: [] }];

/** P0-5 session 3: the travel plan and the treatment record name a facility from the directory, never free text. */
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

  it("the treatment record requires a facility and says when none is set up yet", () => {
    const mutate = vi.fn().mockResolvedValue({ id: "e1" });
    render(<CaseWorkflowActions locale="en" role="doctor" caseSummary={{ id: "c1", status: "ARRIVAL_CONFIRMED", version: 1 }} mutate={mutate} facilities={[]}/>);
    const picker = screen.getByLabelText("Facility");
    expect(picker).toBeRequired();
    expect(screen.getByText(/No active facility is set up yet/)).toBeVisible();
    expect(screen.queryByPlaceholderText("Facility")).not.toBeInTheDocument();
  });
});
