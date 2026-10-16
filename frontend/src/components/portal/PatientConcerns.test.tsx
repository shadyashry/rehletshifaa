import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";

import { PatientConcerns, type Concern } from "./PatientConcerns";
import { renderWithWork } from "./test-copy";

/** P1-13 (A-06): "Raise a concern" is one quiet line on My Care that opens a short form in place. */
const received: Concern = { id: "i1", type: "COMPLAINT", status: "UNDER_REVIEW", raisedAt: "2026-10-12T09:00:00Z", resolvedAt: null };

function setup(rows: Concern[] = []) {
  const mutate = vi.fn().mockResolvedValue({ id: "i2", status: "OPEN" });
  const load = vi.fn().mockResolvedValue(rows) as unknown as <T>(path: string) => Promise<T>;
  renderWithWork(<PatientConcerns locale="en" caseId="c1" busy={false} mutate={mutate} load={load}/>);
  return { mutate, load };
}

describe("PatientConcerns", () => {
  afterEach(cleanup);

  it("is one quiet action, not a button styled as a call to action, until it is opened", async () => {
    setup();
    const action = await screen.findByRole("button", { name: "Raise a concern" });
    expect(action.className).not.toMatch(/btn-primary|btn-secondary/);
    expect(action.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByRole("textbox")).toBeNull();
  });

  it("asks what it is about and what happened, then sends it and reads the list again", async () => {
    const { mutate, load } = setup();
    fireEvent.click(await screen.findByRole("button", { name: "Raise a concern" }));
    fireEvent.click(screen.getByRole("button", { name: "Send concern" }));
    expect(screen.getByText("Choose what the concern is about.")).toBeTruthy();
    expect(screen.getByText("Tell us what happened.")).toBeTruthy();
    expect(mutate).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("radio", { name: "A health problem after treatment" }));
    fireEvent.change(screen.getByRole("textbox", { name: "What happened?" }), { target: { value: "  Swelling since Tuesday  " } });
    fireEvent.click(screen.getByRole("button", { name: "Send concern" }));
    await waitFor(() => expect(mutate).toHaveBeenCalledWith("/patient/cases/c1/concerns", { type: "ADVERSE_EVENT", summary: "Swelling since Tuesday" }));
    await waitFor(() => expect(load).toHaveBeenCalledTimes(2));
    expect(screen.getByRole("button", { name: "Raise a concern" })).toBeTruthy();
  });

  it("lists the patient's own concerns with their status in words", async () => {
    setup([received]);
    expect(await screen.findByRole("heading", { name: "Your concerns" })).toBeTruthy();
    expect(screen.getByText("Complaint")).toBeTruthy();
    expect(screen.getByText("Being reviewed")).toBeTruthy();
  });

  it("reads right-to-left copy in Arabic", async () => {
    const load = vi.fn().mockResolvedValue([]) as unknown as <T>(path: string) => Promise<T>;
    renderWithWork(<PatientConcerns locale="ar" caseId="c1" busy={false} mutate={vi.fn()} load={load}/>, "ar");
    expect(await screen.findByRole("button", { name: "تقديم ملاحظة أو شكوى" })).toBeTruthy();
  });
});
