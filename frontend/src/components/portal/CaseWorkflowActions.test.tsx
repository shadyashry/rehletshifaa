import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { CaseWorkflowActions } from "./CaseWorkflowActions";
import { renderWithWork } from "./test-copy";

// jsdom implements <dialog> only partially.
beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  HTMLDialogElement.prototype.close = function () { this.open = false; this.dispatchEvent(new Event("close")); };
});

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

  it("the start of treatment requires a facility and says when none is set up yet", () => {
    renderWithWork(<CaseWorkflowActions locale="en" role="doctor" caseSummary={{ id: "c1", status: "ADMISSION_READY", version: 1 }} mutate={vi.fn()} facilities={[]}/>);
    const picker = screen.getByLabelText("Facility");
    expect(picker).toHaveAttribute("aria-required", "true");
    expect(picker).toHaveAccessibleDescription(/No active facility is set up yet/);
  });

  // P1-15: a cleared patient's first episode carries the hospital's admission number; the backend opens treatment from it.
  it("opens treatment for a cleared patient with the hospital admission number, and nothing the panels own", () => {
    const mutate = vi.fn().mockResolvedValue({ id: "e1" });
    renderWithWork(<CaseWorkflowActions locale="en" role="doctor" caseSummary={{ id: "c1", status: "ADMISSION_READY", version: 1 }} mutate={mutate} facilities={facilities}/>);
    expect(screen.getByRole("heading", { name: "Start treatment" })).toBeInTheDocument();
    // Milestones, complications and the discharge are recorded in their own panels (P1-16/17), never here.
    for (const gone of [/Milestones/, /Complications/, /Discharge/, /Procedures/]) expect(screen.queryByLabelText(gone)).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Facility"), { target: { value: "f1" } });
    fireEvent.change(screen.getByLabelText("Treatment starts"), { target: { value: "2026-10-20T09:00" } });
    fireEvent.change(screen.getByLabelText(/admission number/i), { target: { value: " ADM-5521 " } });
    fireEvent.click(screen.getByRole("button", { name: "Start treatment" }));
    // The case moves into treatment: confirmed first, naming the facility.
    const dialog = screen.getByRole("alertdialog", { name: "Start treatment at Nile Heart Hospital?" });
    expect(mutate).not.toHaveBeenCalled();
    fireEvent.click(within(dialog).getByRole("button", { name: "Start treatment" }));
    expect(mutate).toHaveBeenCalledWith("/doctor/cases/c1/treatment-episodes", expect.objectContaining({ facilityId: "f1", status: "IN_PROGRESS", endAt: null, admissionNumber: "ADM-5521" }));
  });

  it("says what is missing at the fields instead of the browser's own bubble", () => {
    renderWithWork(<CaseWorkflowActions locale="en" role="doctor" caseSummary={{ id: "c1", status: "ADMISSION_READY", version: 1 }} mutate={vi.fn()} facilities={facilities}/>);
    fireEvent.click(screen.getByRole("button", { name: "Start treatment" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Choose a facility and when treatment starts.");
    expect(screen.getByLabelText("Facility")).toHaveFocus();
  });

  it("waits for the patient's clearance before offering to start treatment at arrival", async () => {
    const load = vi.fn().mockResolvedValue({ admissionBlockers: ["BALANCE_NOT_EVIDENCED"] });
    renderWithWork(<CaseWorkflowActions locale="en" role="doctor" caseSummary={{ id: "c1", status: "ARRIVAL_CONFIRMED", version: 1 }} mutate={vi.fn()} facilities={facilities} load={load}/>);
    expect(await screen.findByText(/Opens once the patient is cleared for admission/)).toBeInTheDocument();
    expect(load).toHaveBeenCalledWith("/doctor/cases/c1/admission");
    expect(screen.queryByRole("button", { name: "Start treatment" })).not.toBeInTheDocument();
  });

  // UX 3-1: the legacy episode and follow-up forms duplicated P1-16..P1-18's panels; they are retired.
  it("offers the Consultant nothing here in treatment or after discharge", () => {
    for (const status of ["TREATMENT_IN_PROGRESS", "DISCHARGED", "FOLLOW_UP"]) {
      const { container } = renderWithWork(<CaseWorkflowActions locale="en" role="doctor" caseSummary={{ id: "c1", status, version: 1 }} mutate={vi.fn()} facilities={facilities}/>);
      expect(container).toBeEmptyDOMElement();
      cleanup();
    }
  });
});
