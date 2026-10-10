import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

import { IntakeHistory } from "./IntakeHistory";

afterEach(cleanup);

const history = {
  summary: { id: "c1", name: "Layla", phoneHint: "•••• 0001", language: "en", windowOpen: false },
  status: "LINKED", coverName: null, canReply: false, canClaim: false, canReassign: false, canClose: false,
  messages: [
    { id: "m1", direction: "IN" as const, kind: "TEXT", body: "Can you help with my knee?", language: "en", fileName: "mri.pdf", createdAt: "2026-10-09T08:00:00Z" },
    { id: "m2", direction: "OUT" as const, kind: "TEMPLATE", senderName: null, body: "Hello, Omar Ali from RehletShifaa will be your coordinator…", language: "en", createdAt: "2026-10-09T09:00:00Z" },
  ],
};

function open() {
  const details = document.querySelector("details")!;
  details.open = true;
  fireEvent(details, new Event("toggle"));
}

describe("IntakeHistory", () => {
  it("loads the earlier conversation once, when opened", async () => {
    const load = vi.fn().mockResolvedValue(history);
    render(<IntakeHistory locale="en" caseId="case-1" load={load}/>);
    expect(load).not.toHaveBeenCalled();

    open();
    expect(await screen.findByText("Can you help with my knee?")).toBeTruthy();
    expect(screen.getByText("mri.pdf")).toBeTruthy();
    expect(screen.getByText("Template")).toBeTruthy();
    expect(load).toHaveBeenCalledTimes(1);
    expect(load).toHaveBeenCalledWith("case-1");
  });

  it("says so when the case did not start on WhatsApp", async () => {
    render(<IntakeHistory locale="ar" caseId="case-2" load={vi.fn().mockRejectedValue(new Error("NO_LINKED_CONVERSATION"))}/>);
    open();
    expect(await screen.findByText("لم تبدأ هذه الحالة من محادثة واتساب.")).toBeTruthy();
  });
});
