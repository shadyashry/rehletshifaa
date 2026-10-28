import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  HTMLDialogElement.prototype.close = function () { this.open = false; this.dispatchEvent(new Event("close")); };
});

import { TravelPlanPanel } from "./TravelPlanPanel";
import { renderWithWork } from "./test-copy";

const facilities = [{ id: "f1", name: "Nile Heart Hospital", city: "Cairo", kind: "HOSPITAL", accreditationStatus: "CURRENT", packages: [] }];
const stored = { id: "t1", status: "PLANNING", plannedArrival: "2026-11-02T10:30:00Z", confirmedArrival: null, visaStatus: "Applied", flightDetails: "MS 912",
  airportReception: "Driver with a sign", accommodation: null, localTransport: null, companionDetails: "One adult", facilityId: "f1", facilityName: "Nile Heart Hospital",
  exceptions: "Wheelchair at the gate", updatedAt: "2026-10-28T08:00:00Z" };

/** UX 5-0: Operations' travel plan. The endpoint replaces the whole plan, so nothing stored may be lost on a save. */
describe("TravelPlanPanel", () => {
  afterEach(cleanup);

  it("picks the hospital from the directory and sends the whole plan", () => {
    const mutate = vi.fn().mockResolvedValue({ id: "t1" });
    renderWithWork(<TravelPlanPanel caseId="c1" plan={null} facilities={facilities} busy={false} mutate={mutate}/>);
    const picker = screen.getByLabelText("Hospital");
    expect(screen.getByRole("option", { name: /Nile Heart Hospital.*·.*Cairo/ })).toBeInTheDocument();
    fireEvent.change(picker, { target: { value: "f1" } });
    fireEvent.click(screen.getByRole("button", { name: "Save the travel plan" }));
    expect(mutate).toHaveBeenCalledWith("/operations/cases/c1/travel", expect.objectContaining({ facilityId: "f1", status: "PLANNING", confirmedArrival: null }), "PUT");
  });

  it("reopens on everything stored and sends back what the form does not show", () => {
    const mutate = vi.fn().mockResolvedValue({ id: "t1" });
    renderWithWork(<TravelPlanPanel caseId="c1" plan={stored} facilities={facilities} busy={false} mutate={mutate}/>);
    expect((screen.getByLabelText("Hospital") as HTMLSelectElement).value).toBe("f1");
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
    renderWithWork(<TravelPlanPanel caseId="c1" plan={null} facilities={facilities} busy={false} mutate={mutate}/>);
    fireEvent.click(screen.getByRole("radio", { name: "Booked and confirmed" }));
    fireEvent.click(screen.getByRole("button", { name: "Save the travel plan" }));
    expect(mutate).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent("Add the planned arrival before confirming the booking.");
    expect(screen.getByLabelText("Planned arrival")).toHaveAttribute("aria-invalid", "true");
  });

  it("records the arrival only after a confirmation, keeping the plan", () => {
    const mutate = vi.fn().mockResolvedValue({ id: "t1" });
    const { container } = renderWithWork(<TravelPlanPanel caseId="c1" plan={{ ...stored, status: "CONFIRMED" }} facilities={facilities} busy={false} mutate={mutate}/>);
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
    renderWithWork(<TravelPlanPanel caseId="c1" plan={{ ...stored, status: "CONFIRMED" }} facilities={facilities} busy={false} mutate={mutate}/>);
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

  it("keeps the stored hospital when the directory arrives after the case", () => {
    const mutate = vi.fn().mockResolvedValue({ id: "t1" });
    const { rerender } = renderWithWork(<TravelPlanPanel caseId="c1" plan={stored} facilities={[]} busy={false} mutate={mutate}/>);
    expect((screen.getByLabelText("Hospital") as HTMLSelectElement).value).toBe("f1");
    rerender(<TravelPlanPanel caseId="c1" plan={stored} facilities={facilities} busy={false} mutate={mutate}/>);
    expect((screen.getByLabelText("Hospital") as HTMLSelectElement).value).toBe("f1");
    fireEvent.click(screen.getByRole("button", { name: "Save the travel plan" }));
    expect(mutate).toHaveBeenCalledWith("/operations/cases/c1/travel", expect.objectContaining({ facilityId: "f1" }), "PUT");
  });

  it("re-seeds the fields from a newer stored plan", () => {
    const { rerender } = renderWithWork(<TravelPlanPanel caseId="c1" plan={stored} facilities={facilities} busy={false} mutate={vi.fn()}/>);
    rerender(<TravelPlanPanel caseId="c1" plan={{ ...stored, flightDetails: "MS 914", updatedAt: "2026-10-28T09:00:00Z" }} facilities={facilities} busy={false} mutate={vi.fn()}/>);
    expect((screen.getByLabelText("Flight") as HTMLInputElement).value).toBe("MS 914");
  });

  it("speaks Arabic from the messages", () => {
    renderWithWork(<TravelPlanPanel caseId="c1" plan={null} facilities={facilities} busy={false} mutate={vi.fn()}/>, "ar");
    expect(screen.getByRole("heading", { name: "السفر والوصول" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "حفظ خطة السفر" })).toHaveClass("btn-primary");
  });
});
