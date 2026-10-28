import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  HTMLDialogElement.prototype.close = function () { this.open = false; this.dispatchEvent(new Event("close")); };
});

import { TravelAct, TravelPlanPanel } from "./TravelPlanPanel";
import { renderWithWork } from "./test-copy";

const stored = { id: "t1", status: "PLANNING", plannedArrival: "2026-11-02T10:30:00Z", confirmedArrival: null, visaStatus: "Applied", flightDetails: "MS 912",
  airportReception: "Driver with a sign", accommodation: null, localTransport: null, companionDetails: "One adult", facilityId: "f1", facilityName: "Nile Heart Hospital",
  exceptions: "Wheelchair at the gate", updatedAt: "2026-10-28T08:00:00Z" };

/** UX 5-0: Operations' travel plan. The endpoint replaces the whole plan, so nothing stored may be lost on a save. */
describe("TravelPlanPanel", () => {
  afterEach(cleanup);

  it("has no hospital picker of its own and starts a plan with nothing chosen", () => {
    const mutate = vi.fn().mockResolvedValue({ id: "t1" });
    renderWithWork(<TravelPlanPanel caseId="c1" plan={null} busy={false} mutate={mutate}/>);
    expect(screen.queryByLabelText("Hospital")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Save the travel plan" }));
    expect(mutate).toHaveBeenCalledWith("/operations/cases/c1/travel", expect.objectContaining({ facilityId: null, status: "PLANNING", confirmedArrival: null }), "PUT");
  });

  it("reopens on everything stored and sends back what the form does not show", () => {
    const mutate = vi.fn().mockResolvedValue({ id: "t1" });
    renderWithWork(<TravelPlanPanel caseId="c1" plan={stored} busy={false} mutate={mutate}/>);
    expect((screen.getByLabelText("Flight") as HTMLInputElement).value).toBe("MS 912");
    expect((screen.getByLabelText("Visa") as HTMLInputElement).value).toBe("Applied");
    expect((screen.getByLabelText("Planned arrival") as HTMLInputElement).value).not.toBe("");
    expect(screen.getByRole("radio", { name: "Still planning" })).toBeChecked();
    fireEvent.click(screen.getByRole("button", { name: "Save the travel plan" }));
    expect(mutate).toHaveBeenCalledWith("/operations/cases/c1/travel", expect.objectContaining({
      plannedArrival: "2026-11-02T10:30:00.000Z", flightDetails: "MS 912", visaStatus: "Applied", airportReception: "Driver with a sign",
      companionDetails: "One adult", exceptions: "Wheelchair at the gate", facilityId: "f1" }), "PUT");
  });

  it("refuses to confirm a booking without a planned arrival, at the field", () => {
    const mutate = vi.fn();
    renderWithWork(<TravelPlanPanel caseId="c1" plan={null} busy={false} mutate={mutate}/>);
    fireEvent.click(screen.getByRole("radio", { name: "Booked and confirmed" }));
    fireEvent.click(screen.getByRole("button", { name: "Save the travel plan" }));
    expect(mutate).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent("Add the planned arrival before confirming the booking.");
    expect(screen.getByLabelText("Planned arrival")).toHaveAttribute("aria-invalid", "true");
  });

  it("records the arrival only after a confirmation, keeping the plan", () => {
    const mutate = vi.fn().mockResolvedValue({ id: "t1" });
    const { container } = renderWithWork(<TravelPlanPanel caseId="c1" plan={{ ...stored, status: "CONFIRMED" }} busy={false} mutate={mutate}/>);
    // Booked: the arrival is the next act and carries the panel's one filled button.
    expect(container.querySelectorAll(".btn-primary")).toHaveLength(1);
    expect(screen.getByRole("button", { name: "Record the arrival" })).toHaveClass("btn-primary");
    fireEvent.change(screen.getByLabelText("Arrived at"), { target: { value: "2026-10-20T12:00" } });
    fireEvent.click(screen.getByRole("button", { name: "Record the arrival" }));
    expect(mutate).not.toHaveBeenCalled();
    const dialog = screen.getByRole("alertdialog", { name: "Record the patient's arrival?" });
    expect(dialog).toHaveTextContent(/The patient arrived at .*2026/);
    fireEvent.click(dialog.querySelector(".btn-primary") as HTMLElement);
    expect(mutate).toHaveBeenCalledWith("/operations/cases/c1/travel", expect.objectContaining({ status: "ARRIVED", flightDetails: "MS 912", facilityId: "f1",
      confirmedArrival: new Date("2026-10-20T12:00").toISOString() }), "PUT");
  });

  it("never records the arrival when the confirmation is cancelled, and refuses an empty or future time in place", () => {
    const mutate = vi.fn();
    renderWithWork(<TravelPlanPanel caseId="c1" plan={{ ...stored, status: "CONFIRMED" }} busy={false} mutate={mutate}/>);
    fireEvent.click(screen.getByRole("button", { name: "Record the arrival" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Enter when the patient arrived.");
    expect(screen.getByLabelText("Arrived at")).toHaveAttribute("aria-invalid", "true");
    fireEvent.change(screen.getByLabelText("Arrived at"), { target: { value: "2099-01-01T08:00" } });
    fireEvent.click(screen.getByRole("button", { name: "Record the arrival" }));
    expect(screen.getByRole("alert")).toHaveTextContent("The arrival cannot be in the future.");
    fireEvent.change(screen.getByLabelText("Arrived at"), { target: { value: "2026-10-20T12:00" } });
    fireEvent.click(screen.getByRole("button", { name: "Record the arrival" }));
    const dialog = screen.getByRole("alertdialog", { name: "Record the patient's arrival?" });
    fireEvent.click(dialog.querySelector("button:not(.btn-primary)") as HTMLElement);
    expect(mutate).not.toHaveBeenCalled();
  });

  it("re-seeds the fields from a newer stored plan", () => {
    const { rerender } = renderWithWork(<TravelPlanPanel caseId="c1" plan={stored} busy={false} mutate={vi.fn()}/>);
    rerender(<TravelPlanPanel caseId="c1" plan={{ ...stored, flightDetails: "MS 914", updatedAt: "2026-10-28T09:00:00Z" }} busy={false} mutate={vi.fn()}/>);
    expect((screen.getByLabelText("Flight") as HTMLInputElement).value).toBe("MS 914");
  });

  it("keeps the arrangements closed once the officer closes them, through a re-seed", () => {
    const { rerender, container } = renderWithWork(<TravelPlanPanel caseId="c1" plan={stored} busy={false} mutate={vi.fn()}/>);
    const arrangements = () => container.querySelector("details:has(textarea[name=airportReception])") as HTMLDetailsElement;
    expect(arrangements().open).toBe(true);
    arrangements().open = false;
    fireEvent(arrangements(), new Event("toggle"));
    rerender(<TravelPlanPanel caseId="c1" plan={{ ...stored, updatedAt: "2026-10-28T09:00:00Z" }} busy={false} mutate={vi.fn()}/>);
    expect(arrangements().open).toBe(false);
  });

  it("says at the field when the arrival was not recorded", async () => {
    const mutate = vi.fn().mockResolvedValue(null);
    renderWithWork(<TravelPlanPanel caseId="c1" plan={{ ...stored, status: "CONFIRMED" }} busy={false} mutate={mutate}/>);
    fireEvent.change(screen.getByLabelText("Arrived at"), { target: { value: "2026-10-20T12:00" } });
    fireEvent.click(screen.getByRole("button", { name: "Record the arrival" }));
    fireEvent.click(screen.getByRole("alertdialog").querySelector(".btn-primary") as HTMLElement);
    expect(await screen.findByRole("alert")).toHaveTextContent("The arrival was not recorded. Read the message above, check the time, then try again.");
  });

  it("as a later act of the hospital file: one line, the forms behind disclosures, no filled button", () => {
    const { container } = renderWithWork(<TravelAct caseId="c1" plan={stored} current={false} busy={false} mutate={vi.fn()}/>);
    // UX 5-4: not the act now, it is one line of the file, like its other acts.
    expect(screen.queryByRole("heading")).toBeNull();
    expect(screen.getByText(/^Travel and arrival · Planning · Planned arrival: .*2026/)).toBeInTheDocument();
    expect(screen.getAllByText(/Planning/)).toHaveLength(1);
    expect(container.querySelectorAll(".btn-primary")).toHaveLength(0);
    expect(screen.getByText("Change the travel plan").closest("details")).not.toHaveAttribute("open");
  });

  it("as an act of the file, still resends the stored hospital with the plan", () => {
    const mutate = vi.fn().mockResolvedValue({ id: "t1" });
    renderWithWork(<TravelAct caseId="c1" plan={stored} current busy={false} mutate={mutate}/>);
    fireEvent.click(screen.getByRole("button", { name: "Save the travel plan" }));
    expect(mutate).toHaveBeenCalledWith("/operations/cases/c1/travel", expect.objectContaining({ facilityId: "f1", exceptions: "Wheelchair at the gate" }), "PUT");
  });

  it("as the current act with nothing planned: the form open with its one filled Save", () => {
    const { container } = renderWithWork(<TravelAct caseId="c1" plan={null} current busy={false} mutate={vi.fn()}/>);
    expect(container.querySelectorAll(".btn-primary")).toHaveLength(1);
    expect(screen.getByRole("button", { name: "Save the travel plan" })).toHaveClass("btn-primary");
  });

  it("speaks Arabic from the messages", () => {
    renderWithWork(<TravelPlanPanel caseId="c1" plan={null} busy={false} mutate={vi.fn()}/>, "ar");
    expect(screen.getByRole("heading", { name: "السفر والوصول" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "حفظ خطة السفر" })).toHaveClass("btn-primary");
  });
});
