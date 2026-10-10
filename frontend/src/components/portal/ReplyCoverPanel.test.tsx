import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

import { ReplyCoverPanel, type ReplyCover } from "./ReplyCoverPanel";

afterEach(cleanup);

const staff = [
  { subject: "me", name: "Sara Ahmed", role: "COORDINATOR" },
  { subject: "omar", name: "Omar Ali", role: "COORDINATOR" },
  { subject: "fin", name: "Finance Person", role: "FINANCE" },
];
const cover: ReplyCover = { id: "c1", ownerSubject: "me", ownerName: "Sara Ahmed", coverSubject: "omar", coverName: "Omar Ali",
  startsAt: "2026-10-10T08:00:00Z", endsAt: "2026-10-12T16:00:00Z", active: true, canRevoke: true };

describe("ReplyCoverPanel", () => {
  it("says who answers my patients and lets me end the cover", () => {
    const mutate = vi.fn().mockResolvedValue({ status: "SAVED" });
    render(<ReplyCoverPanel locale="en" mySubject="me" covers={[cover]} staff={staff} busy={false} mutate={mutate}/>);

    expect(screen.getByText("Omar Ali answers your patients")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "End cover" }));
    expect(mutate).toHaveBeenCalledWith("/coordinator/reply-covers/c1/revoke");
  });

  it("offers only other coordinators and saves the period", async () => {
    const mutate = vi.fn().mockResolvedValue({ status: "SAVED" });
    render(<ReplyCoverPanel locale="en" mySubject="me" covers={[]} staff={staff} busy={false} mutate={mutate}/>);

    const select = screen.getByLabelText("Who answers your patients") as HTMLSelectElement;
    expect(Array.from(select.options).map(o => o.textContent)).toEqual(["Choose a coordinator", "Omar Ali"]);
    fireEvent.change(select, { target: { value: "omar" } });
    fireEvent.change(screen.getByLabelText("From"), { target: { value: "2026-10-11T09:00" } });
    fireEvent.change(screen.getByLabelText("Until"), { target: { value: "2026-10-12T17:00" } });
    fireEvent.click(screen.getByRole("button", { name: "Save cover" }));

    await vi.waitFor(() => expect(mutate).toHaveBeenCalledWith("/coordinator/reply-covers",
      expect.objectContaining({ coverSubject: "omar", startsAt: new Date("2026-10-11T09:00").toISOString() })));
  });

  it("speaks Arabic", () => {
    render(<ReplyCoverPanel locale="ar" mySubject="omar" covers={[cover]} staff={staff} busy={false} mutate={vi.fn()}/>);
    expect(screen.getByText("أنت تردّ على مرضى Sara Ahmed")).toBeTruthy();
  });
});
