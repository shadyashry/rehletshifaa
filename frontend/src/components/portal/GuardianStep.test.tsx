import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";

import { GuardianStep } from "./GuardianStep";
import { putWithProgress } from "@/lib/upload";
import { MyCare } from "./MyCare";
import { renderWithWork, workCopyFor } from "./test-copy";
import type { CaseActions } from "./CurrentAction";
import { GUARDIAN_CONSENT_VERSION } from "@/lib/guardian";

vi.mock("@/lib/upload", () => ({ putWithProgress: vi.fn() }));

/** P1-13 (A-05): the guardian's step in My Care — legal basis, a document already on the case, and the guardian consent. */
const clean = { documentId: "d1", fileName: "birth-certificate.pdf", status: "CLEAN", createdAt: "2026-10-10T09:00:00Z" };
const scanning = { documentId: "d2", fileName: "scan-pending.pdf", status: "PENDING", createdAt: "2026-10-11T09:00:00Z" };

function setup(blockerCode: string, documents = [clean, scanning], onboarding: unknown = { version: 3, subjectType: "GUARDIAN", completedConsentTypes: [] }) {
  const mutate = vi.fn().mockResolvedValue({ status: "SAVED" });
  const load = vi.fn().mockResolvedValue(onboarding) as unknown as <T>(path: string) => Promise<T>;
  renderWithWork(<GuardianStep locale="en" caseId="c1" blockerCode={blockerCode} documents={documents} busy={false} mutate={mutate} load={load}/>);
  return { mutate, load };
}

describe("GuardianStep", () => {
  afterEach(cleanup);

  it("asks the basis and the consent before sending, and offers only scanned documents", async () => {
    const { mutate } = setup("GUARDIAN_AUTH_MISSING");
    await screen.findByRole("group", { name: "You are the patient's" });
    expect(screen.getByRole("radio", { name: /birth-certificate\.pdf/ })).toBeTruthy();
    expect(screen.queryByRole("radio", { name: /scan-pending\.pdf/ })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));
    expect(await screen.findByText("Choose how you are related to the patient.")).toBeTruthy();
    expect(screen.getByText("Confirm the statement to continue.")).toBeTruthy();
    expect(mutate).not.toHaveBeenCalled();
  });

  it("records the consent in the message-file words, then the guardian with basis and document", async () => {
    const { mutate } = setup("MINOR_REQUIRES_GUARDIAN");
    fireEvent.click(await screen.findByRole("radio", { name: "Legal guardian" }));
    fireEvent.click(screen.getByRole("radio", { name: /birth-certificate\.pdf/ }));
    fireEvent.click(screen.getByRole("checkbox", { name: workCopyFor("en").guardianConsent }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));
    await waitFor(() => expect(mutate).toHaveBeenCalledTimes(2));
    expect(mutate.mock.calls[0]).toEqual(["/patient/cases/c1/onboarding/consents",
      { consentType: "GUARDIAN_AUTHORIZATION", exactText: workCopyFor("en").guardianConsent, policyVersion: GUARDIAN_CONSENT_VERSION, language: "en" }]);
    expect(mutate.mock.calls[1]).toEqual(["/patient/cases/c1/onboarding/subject",
      { subjectType: "GUARDIAN", relationship: "GUARDIAN", legalBasis: "LEGAL_GUARDIAN", expectedVersion: 3, evidenceDocumentId: "d1" }, "PUT"]);
  });

  it("on the evidence step attaches the chosen document, and does not re-ask a consent already given", async () => {
    const { mutate } = setup("GUARDIAN_EVIDENCE_MISSING", [clean], { version: 4, completedConsentTypes: ["GUARDIAN_AUTHORIZATION"] });
    fireEvent.click(await screen.findByRole("radio", { name: /birth-certificate\.pdf/ }));
    expect(screen.queryByRole("checkbox")).toBeNull();
    expect(screen.queryByRole("group", { name: "You are the patient's" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Use this document" }));
    await waitFor(() => expect(mutate).toHaveBeenCalledWith("/patient/cases/c1/onboarding/guardian-evidence", { documentId: "d1" }, "PUT"));
  });

  it("without a scanned document, sends the guardian to their coordinator and offers nothing to submit", async () => {
    setup("GUARDIAN_EVIDENCE_MISSING", [scanning], { version: 4, completedConsentTypes: ["GUARDIAN_AUTHORIZATION"] });
    expect(await screen.findByText(/Message your coordinator and they will send you a secure link/)).toBeTruthy();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("in Arabic, reads the consent from the Arabic message file", async () => {
    const load = vi.fn().mockResolvedValue({ version: 1, completedConsentTypes: [] }) as unknown as <T>(path: string) => Promise<T>;
    renderWithWork(<GuardianStep locale="ar" caseId="c1" blockerCode="GUARDIAN_AUTH_MISSING" documents={[clean]} busy={false} mutate={vi.fn()} load={load}/>, "ar");
    expect(await screen.findByRole("checkbox", { name: workCopyFor("ar").guardianConsent })).toBeTruthy();
    expect(screen.getByRole("radio", { name: "أحد الوالدين" })).toBeTruthy();
  });
});

describe("GuardianStep upload", () => {
  afterEach(() => { cleanup(); vi.mocked(putWithProgress).mockReset(); });
  const consented = { version: 4, completedConsentTypes: ["GUARDIAN_AUTHORIZATION"] };
  const pdf = () => new File(["%PDF-1.7"], "guardianship.pdf", { type: "application/pdf" });
  const presigned = { documentId: "d9", uploadUrl: "https://upload.test/put/d9", requiredHeaders: { "Content-Type": "application/pdf" } };

  function setupUpload(confirm: () => Promise<unknown>, documents = [scanning]) {
    const put = vi.mocked(putWithProgress).mockResolvedValue(true);
    const send = vi.fn((path: string) => path.endsWith("/presign") ? Promise.resolve(presigned) : confirm());
    const mutate = vi.fn().mockResolvedValue({ status: "SAVED" });
    const load = vi.fn().mockResolvedValue(consented) as unknown as <T>(path: string) => Promise<T>;
    renderWithWork(<GuardianStep locale="en" caseId="c1" blockerCode="GUARDIAN_EVIDENCE_MISSING" documents={documents} busy={false} mutate={mutate} load={load}
      send={send as unknown as <T>(path: string, init: RequestInit) => Promise<T>}/>);
    return { send, put, mutate };
  }

  it("with no scanned document, uploads one, shows the check, then selects it and attaches it as the evidence", async () => {
    let finish: (value: unknown) => void = () => {};
    const { send, put, mutate } = setupUpload(() => new Promise(resolve => { finish = resolve; }));
    expect(await screen.findByText(/No document on this case has passed the virus check yet/)).toBeTruthy();
    expect(screen.queryByText(/secure link/)).toBeNull();
    fireEvent.change(screen.getByLabelText("Choose a file"), { target: { files: [pdf()] } });
    expect(await screen.findByText("Checking guardianship.pdf for viruses…")).toBeTruthy();
    expect(send).toHaveBeenCalledWith("/patient/cases/c1/documents/presign",
      { method: "POST", body: JSON.stringify({ originalFileName: "guardianship.pdf", contentType: "application/pdf", sizeBytes: 8 }) });
    expect(put).toHaveBeenCalledWith("https://upload.test/put/d9", presigned.requiredHeaders, expect.any(File), expect.any(Function));
    expect(send).toHaveBeenLastCalledWith("/patient/cases/c1/documents/confirm", { method: "POST", body: JSON.stringify({ documentId: "d9" }) });
    finish({ documentId: "d9", status: "CLEAN" });
    const radio = await screen.findByRole("radio", { name: /guardianship\.pdf/ }) as HTMLInputElement;
    expect(radio.checked).toBe(true);
    await waitFor(() => expect(document.activeElement).toBe(radio));
    expect(screen.getByText("guardianship.pdf passed the check and is selected.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Use this document" }));
    await waitFor(() => expect(mutate).toHaveBeenCalledWith("/patient/cases/c1/onboarding/guardian-evidence", { documentId: "d9" }, "PUT"));
  });

  it("when the scanner is down keeps the upload and checks the same file again", async () => {
    const confirm = vi.fn()
      .mockRejectedValueOnce(Object.assign(new Error("down"), { code: "DOCUMENT_SCAN_UNAVAILABLE" }))
      .mockResolvedValueOnce({ documentId: "d9", status: "CLEAN" });
    const { send } = setupUpload(confirm);
    fireEvent.change(await screen.findByLabelText("Choose a file"), { target: { files: [pdf()] } });
    expect(await screen.findByText(/The virus check is not available right now/)).toBeTruthy();
    expect(screen.queryByRole("radio")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Check again" }));
    expect(await screen.findByRole("radio", { name: /guardianship\.pdf/ })).toBeTruthy();
    expect(send.mock.calls.filter(([path]) => path.endsWith("/presign"))).toHaveLength(1);
  });

  it("refuses a file of the wrong type before sending it, and says when the scanner condemns one", async () => {
    const { send } = setupUpload(() => Promise.reject(Object.assign(new Error("bad"), { code: "DOCUMENT_INSPECTION_FAILED" })));
    const input = await screen.findByLabelText("Choose a file");
    fireEvent.change(input, { target: { files: [new File(["x"], "notes.docx", { type: "application/msword" })] } });
    expect(await screen.findByText("Choose a PDF, JPG or PNG file.")).toBeTruthy();
    expect(send).not.toHaveBeenCalled();
    fireEvent.change(input, { target: { files: [pdf()] } });
    expect(await screen.findByText("guardianship.pdf did not pass the virus check and was removed. Choose another file.")).toBeTruthy();
    expect(screen.queryByRole("radio")).toBeNull();
  });

  it("lists files still being checked without letting them be chosen", async () => {
    setupUpload(() => Promise.resolve({}), [scanning, { ...scanning, documentId: "d3", fileName: "stuck.pdf", status: "QUARANTINED" }]);
    expect(await screen.findByText(/Still being checked for viruses/)).toBeTruthy();
    expect(screen.getByText("scan-pending.pdf")).toBeTruthy();
    expect(screen.getByText("stuck.pdf")).toBeTruthy();
    expect(screen.getAllByText("Being checked")).toHaveLength(2);
    expect(screen.queryByRole("radio")).toBeNull();
  });

  it("with documents already on the case, still offers the upload below the list", async () => {
    setupUpload(() => Promise.resolve({}), [clean]);
    expect(await screen.findByRole("radio", { name: /birth-certificate\.pdf/ })).toBeTruthy();
    expect(screen.getByText("Not in the list? Upload it here.")).toBeTruthy();
    expect(screen.getByLabelText("Choose a file")).toBeTruthy();
  });

  it("in Arabic, offers the upload in Arabic", async () => {
    const load = vi.fn().mockResolvedValue(consented) as unknown as <T>(path: string) => Promise<T>;
    renderWithWork(<GuardianStep locale="ar" caseId="c1" blockerCode="GUARDIAN_EVIDENCE_MISSING" documents={[]} busy={false} mutate={vi.fn()} load={load} send={vi.fn()}/>, "ar");
    expect(await screen.findByLabelText("اختر ملفًا")).toBeTruthy();
  });
});

describe("MyCare with a guardian step", () => {
  afterEach(cleanup);
  const base = { id: "c1", caseNumber: "RS-2026-000081", status: "ACCEPTED", careCategory: "cardiology", coordinatorName: "Sara Ahmed", updatedAt: "2026-09-12T09:00:00Z" };
  const actions = (blockerCode: string): CaseActions => ({ journeyStage: "ACCEPTED", waitingOn: "PATIENT", availableActions: ["MESSAGE_COORDINATOR"],
    blockers: [{ code: blockerCode, labelEn: "Guardian details required", labelAr: "", owner: "PATIENT", gating: true }],
    currentAction: { code: "COMPLETE_PROFILE", kind: "FOCUS", blockerCode } });

  it("names the guardian step in words and shows its form instead of the blocker list", () => {
    renderWithWork(<MyCare locale="en" caseSummary={base} actions={actions("GUARDIAN_AUTH_MISSING")} documents={[]} unreadMessages={0} cases={[base]}
      view="care" onView={vi.fn()} onOpenCase={vi.fn()} onOpenProposal={vi.fn()} messagesPanel={null} guardianStep={<p>guardian form</p>}/>);
    expect(screen.getByRole("heading", { name: "Confirm you act for the patient" })).toBeTruthy();
    expect(screen.getByText("guardian form")).toBeTruthy();
    expect(screen.queryByText("Guardian details required")).toBeNull();
  });

  it("says which document is needed on the evidence step", () => {
    renderWithWork(<MyCare locale="en" caseSummary={base} actions={actions("GUARDIAN_EVIDENCE_MISSING")} documents={[]} unreadMessages={0} cases={[base]}
      view="care" onView={vi.fn()} onOpenCase={vi.fn()} onOpenProposal={vi.fn()} messagesPanel={null} guardianStep={<p>guardian form</p>}/>);
    expect(screen.getByRole("heading", { name: "We need the document that shows you are the guardian" })).toBeTruthy();
  });
});
