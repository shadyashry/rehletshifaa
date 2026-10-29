import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen } from "@testing-library/react";

import { CaseMessages, MessageThreads } from "./CaseMessages";
import { renderWithWork } from "./test-copy";

afterEach(cleanup);
// jsdom does not lay out, so it has no scrollIntoView.
beforeAll(() => { Element.prototype.scrollIntoView = vi.fn(); });

const strip = (text: string | null | undefined) => (text ?? "").replace(/[⁨⁩]/g, "");
const base = { senderRole: "PATIENT", senderName: "Patient", direction: "INBOUND", createdAt: "2026-10-10T08:00:00Z", read: true, threadType: "PATIENT_COORDINATOR" };

describe("CaseMessages — WhatsApp messages", () => {
  it("marks a message that arrived on WhatsApp and says what happened to its file", () => {
    renderWithWork(<CaseMessages locale="en" role="coordinator" caseId="c1" canSend={false} busy={false} mutate={vi.fn()} messages={[
      { ...base, id: "m1", body: "My MRI", channel: "WHATSAPP", attachmentStatus: "CLEAN" },
      { ...base, id: "m2", body: "", channel: "WHATSAPP", attachmentStatus: "UNSUPPORTED_TYPE" },
      { ...base, id: "m3", body: "From the portal", channel: "PORTAL" },
    ]}/>);

    expect(screen.getAllByText("via WhatsApp")).toHaveLength(2);
    expect(screen.getByText("Attachment saved to the case documents.")).toBeTruthy();
    expect(screen.getByText("This attachment type is not kept. Please send files as PDF, JPG or PNG.")).toBeTruthy();
    // A file-only message shows no empty text block.
    expect(document.querySelectorAll("article p[dir='auto']")).toHaveLength(2);
  });

  it("words the channel and the file note in Arabic", () => {
    renderWithWork(<CaseMessages locale="ar" role="patient" caseId="c1" canSend={false} busy={false} mutate={vi.fn()} messages={[
      { ...base, id: "m1", body: "لدي تقارير", channel: "WHATSAPP", attachmentStatus: "EXPIRED", direction: "OUTBOUND" },
    ]}/>, "ar");

    expect(screen.getByText("عبر واتساب")).toBeTruthy();
    expect(screen.getByText("تعذّر استلام هذا المرفق. أرسله مرة أخرى.")).toBeTruthy();
  });

  it("lets only the patient's current voice reply, and says who covers", () => {
    const covered = { canReply: false, ownerName: "Sara Ahmed", coverName: "Omar Ali", coverEndsAt: "2026-10-12T16:00:00Z", viewerIsCover: false };
    renderWithWork(<CaseMessages locale="en" role="coordinator" caseId="c1" canSend busy={false} mutate={vi.fn()} patientReply={covered} messages={[]}/>);

    expect(screen.queryByRole("button", { name: "Send message" })).toBeNull();
    expect(strip(screen.getByRole("note").textContent)).toContain("Omar Ali is covering for Sara Ahmed");
  });

  it("lets the cover reply and tells them they are covering", () => {
    const covering = { canReply: true, ownerName: "Sara Ahmed", coverName: "Omar Ali", coverEndsAt: "2026-10-12T16:00:00Z", viewerIsCover: true };
    renderWithWork(<CaseMessages locale="en" role="coordinator" caseId="c1" canSend={false} busy={false} mutate={vi.fn()} patientReply={covering} messages={[]}/>);

    expect(screen.getByRole("button", { name: "Send message" })).toBeTruthy();
    expect(strip(screen.getByRole("note").textContent)).toContain("You are covering for Sara Ahmed");
  });
});

describe("MessageThreads — the coordinator's threads", () => {
  const canReply = { canReply: true, ownerName: "Sara Ahmed", coverName: null, coverEndsAt: null, viewerIsCover: false };
  const threads = [
    { ...base, id: "p1", body: "Patient note", read: true },
    { ...base, id: "d1", threadType: "COORDINATOR_DOCTOR", senderRole: "DOCTOR", senderName: "Dr. Example", body: "Can you send the echo?", read: false },
    { ...base, id: "d2", threadType: "COORDINATOR_DOCTOR", senderRole: "DOCTOR", senderName: "Dr. Example", body: "And the ECG.", read: false },
  ];

  it("names the threads as tabs, Consultant not Doctor, with unread counts, and opens where a reply is owed", () => {
    renderWithWork(<MessageThreads locale="en" role="coordinator" caseId="c1" canSend busy={false} mutate={vi.fn()} patientReply={canReply} messages={threads}/>);
    const tabs = screen.getAllByRole("tab");
    expect(tabs.map(tab => tab.textContent?.replace(/\(.*?\)/g, "").replace(/\s+/g, "").trim())).toEqual(["Patient", "Consultant2", "Operations", "Finance"]);
    expect(screen.queryByText(/Doctor/)).toBeNull();
    const consultant = screen.getByRole("tab", { name: /Consultant/ });
    expect(consultant.getAttribute("aria-selected")).toBe("true");
    expect(consultant.textContent).toContain("2 unread messages");
    expect(screen.getByText("Can you send the echo?")).toBeTruthy();
    expect(screen.queryByText("Patient note")).toBeNull();
    expect(screen.getByText("Internal: the patient does not see this conversation.")).toBeTruthy();
  });

  it("moves between threads with the arrow keys (mirrored in Arabic)", () => {
    renderWithWork(<MessageThreads locale="ar" role="coordinator" caseId="c1" canSend busy={false} mutate={vi.fn()} patientReply={canReply} messages={[]}/>, "ar");
    const patient = screen.getByRole("tab", { name: /المريض/ });
    expect(patient.getAttribute("aria-selected")).toBe("true");
    fireEvent.keyDown(patient, { key: "ArrowLeft" });
    const consultant = screen.getByRole("tab", { name: /الاستشاري/ });
    expect(consultant.getAttribute("aria-selected")).toBe("true");
    expect(document.activeElement).toBe(consultant);
  });

  it("opens on the patient's thread with the composer focused when asked to reply, and confirms the send", async () => {
    const mutate = vi.fn().mockResolvedValue({ id: "m9" });
    renderWithWork(<MessageThreads locale="en" role="coordinator" caseId="c1" canSend busy={false} mutate={mutate} patientReply={canReply} messages={threads} replyTo="PATIENT_COORDINATOR"/>);
    expect(screen.getByRole("tab", { name: /Patient/ }).getAttribute("aria-selected")).toBe("true");
    const composer = screen.getByLabelText("Your message");
    await vi.waitFor(() => expect(document.activeElement).toBe(composer));
    fireEvent.change(composer, { target: { value: "Thank you, received." } });
    fireEvent.click(screen.getByRole("button", { name: "Send message" }));
    await vi.waitFor(() => expect(mutate).toHaveBeenCalledWith("/coordinator/cases/c1/messages", { threadType: "PATIENT_COORDINATOR", body: "Thank you, received.", language: "en", internalOnly: false }));
    await vi.waitFor(() => expect(screen.getByRole("status").textContent).toBe("Message sent."));
  });
});
