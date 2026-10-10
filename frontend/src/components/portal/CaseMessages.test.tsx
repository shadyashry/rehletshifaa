import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, screen } from "@testing-library/react";

import { CaseMessages } from "./CaseMessages";
import { renderWithWork } from "./test-copy";

afterEach(cleanup);

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
    expect(screen.getByText("تعذّر استلام هذا المرفق. يُرجى إرساله مرة أخرى.")).toBeTruthy();
  });
});
