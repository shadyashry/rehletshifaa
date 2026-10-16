import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  HTMLDialogElement.prototype.close = function () { this.open = false; this.dispatchEvent(new Event("close")); };
});

import { GuardianReview, type GuardianView } from "./GuardianReview";
import { ReopenCase } from "./ReopenCase";
import { renderWithWork } from "./test-copy";

/** P1-13: the coordinator's age band and guardian evidence decision, and reopening a closed case. */
const waiting: GuardianView = { caseId: "c1", ageBand: "AGE_12_17", minor: true, state: "EVIDENCE_UNVERIFIED", legalBasis: "PARENT", relationship: "PARENT", evidenceDocumentId: "d9" };

function setup(props: { ageBand?: string | null; canEdit?: boolean; guardian?: GuardianView } = {}) {
  const mutate = vi.fn().mockResolvedValue({ status: "SAVED" });
  const load = vi.fn().mockResolvedValue(props.guardian ?? waiting) as unknown as <T>(path: string) => Promise<T>;
  const viewDoc = vi.fn();
  renderWithWork(<GuardianReview locale="en" caseId="c1" ageBand={"ageBand" in props ? props.ageBand : "AGE_12_17"} canEdit={props.canEdit ?? true} busy={false} mutate={mutate} load={load} viewDoc={viewDoc}/>);
  return { mutate, load, viewDoc };
}

describe("GuardianReview", () => {
  afterEach(cleanup);

  it("records a corrected age band", async () => {
    const { mutate, load } = setup({ ageBand: null });
    expect(screen.getByText("Not stated")).toBeTruthy();
    expect(load).not.toHaveBeenCalled(); // an adult (or unstated) band has no guardian to read
    fireEvent.click(screen.getByRole("button", { name: "Change age" }));
    fireEvent.change(screen.getByRole("combobox", { name: "Age" }), { target: { value: "UNDER_12" } });
    fireEvent.click(screen.getByRole("button", { name: "Save age" }));
    await waitFor(() => expect(mutate).toHaveBeenCalledWith("/coordinator/cases/c1/age-band", { ageBand: "UNDER_12" }, "PUT"));
  });

  it("for a minor, shows the guardian and verifies the evidence", async () => {
    const { mutate, viewDoc } = setup();
    expect(await screen.findByText("Document waiting for your check")).toBeTruthy();
    expect(screen.getByText("Parent")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "View the document" }));
    expect(viewDoc).toHaveBeenCalledWith("d9");
    fireEvent.click(screen.getByRole("button", { name: "Verify" }));
    await waitFor(() => expect(mutate).toHaveBeenCalledWith("/coordinator/cases/c1/guardian/evidence-decision", { decision: "VERIFY" }));
  });

  it("refuses only after a confirmation", async () => {
    const { mutate } = setup();
    fireEvent.click(await screen.findByRole("button", { name: "Refuse" }));
    expect(mutate).not.toHaveBeenCalled();
    const dialog = screen.getByRole("alertdialog", { name: "Refuse this document?" });
    fireEvent.click(dialog.querySelector(".btn-primary") as HTMLElement);
    await waitFor(() => expect(mutate).toHaveBeenCalledWith("/coordinator/cases/c1/guardian/evidence-decision", { decision: "REJECT" }));
  });

  it("is read-only for a coordinator who does not own the case", async () => {
    setup({ canEdit: false });
    expect(await screen.findByText("Document waiting for your check")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Verify" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Change age" })).toBeNull();
  });
});

describe("ReopenCase", () => {
  afterEach(cleanup);

  it("asks a reason, offers the case's incidents to a manager and reopens through the manager's path", async () => {
    const mutate = vi.fn().mockResolvedValue({ id: "c1", status: "FOLLOW_UP" });
    const load = vi.fn().mockResolvedValue([{ id: "i1", type: "ADVERSE_EVENT", severity: "HIGH", status: "UNDER_REVIEW", raisedAt: "2026-10-12T09:00:00Z" }]) as unknown as <T>(path: string) => Promise<T>;
    renderWithWork(<ReopenCase locale="en" caseId="c1" side="coordinator" busy={false} mutate={mutate} load={load}/>);
    fireEvent.click(screen.getByRole("button", { name: "Reopen case" }));
    const dialog = screen.getByRole("dialog", { name: "Reopen this case?" });
    fireEvent.click(dialog.querySelector("button[type=submit]") as HTMLElement);
    expect(screen.getByText("Choose why the case is reopened.")).toBeTruthy();
    fireEvent.click(screen.getByRole("radio", { name: "A complication was reported" }));
    fireEvent.change(await screen.findByRole("combobox", { name: "Related incident (optional)" }), { target: { value: "i1" } });
    fireEvent.change(screen.getByRole("textbox", { name: "Note for the care team (optional)" }), { target: { value: "Fever after discharge" } });
    fireEvent.click(dialog.querySelector("button[type=submit]") as HTMLElement);
    await waitFor(() => expect(mutate).toHaveBeenCalledWith("/coordinator/cases/c1/reopen", { reason: "COMPLICATION_REPORTED", incidentId: "i1", note: "Fever after discharge" }));
  });

  it("for the case's Consultant uses the doctor path and never reads incidents", async () => {
    const mutate = vi.fn().mockResolvedValue({ id: "c1", status: "FOLLOW_UP" });
    const load = vi.fn() as unknown as <T>(path: string) => Promise<T>;
    renderWithWork(<ReopenCase locale="en" caseId="c1" side="doctor" busy={false} mutate={mutate} load={load}/>);
    fireEvent.click(screen.getByRole("button", { name: "Reopen case" }));
    fireEvent.click(screen.getByRole("radio", { name: "Clinical follow-up is needed" }));
    fireEvent.click(screen.getByRole("dialog").querySelector("button[type=submit]") as HTMLElement);
    await waitFor(() => expect(mutate).toHaveBeenCalledWith("/doctor/cases/c1/reopen", { reason: "CLINICAL_FOLLOW_UP_NEEDED", incidentId: null, note: null }));
    expect(load).not.toHaveBeenCalled();
  });
});
