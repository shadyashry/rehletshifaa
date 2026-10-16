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

  // P1-15: a cleared patient's first episode carries the hospital's admission number (pay to admit; the backend refuses without it).
  it("records the treatment episode of a cleared patient with the hospital admission number", async () => {
    const mutate = vi.fn().mockResolvedValue({ id: "e1" });
    render(<CaseWorkflowActions locale="en" role="doctor" caseSummary={{ id: "c1", status: "ADMISSION_READY", version: 1 }} mutate={mutate} facilities={facilities}
                                admissionNumberCopy={{ label: "Hospital admission number", hint: "Needed before treatment starts." }}/>);
    fireEvent.change(screen.getByLabelText("Facility"), { target: { value: "f1" } });
    fireEvent.change(screen.getByLabelText("Treatment starts"), { target: { value: "2026-10-20T09:00" } });
    const number = screen.getByLabelText(/Hospital admission number/);
    expect(number).toHaveAccessibleDescription("Needed before treatment starts.");
    fireEvent.change(number, { target: { value: " ADM-5521 " } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(mutate).toHaveBeenCalledWith("/doctor/cases/c1/treatment-episodes", expect.objectContaining({ facilityId: "f1", admissionNumber: "ADM-5521" }));
  });
});
