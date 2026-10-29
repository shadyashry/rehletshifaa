import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, screen, waitFor } from "@testing-library/react";

import { CaseDocumentUpload, type Send } from "./CaseDocumentUpload";
import { renderWithWork } from "./test-copy";
import { putWithProgress } from "@/lib/upload";

vi.mock("@/lib/upload", () => ({ putWithProgress: vi.fn() }));

/** The Documents tab's upload: presign, the bytes, confirm (the scan); the case's list reloads once the file is clean. */
describe("CaseDocumentUpload", () => {
  afterEach(() => { cleanup(); vi.mocked(putWithProgress).mockReset(); });
  const presigned = { documentId: "d7", uploadUrl: "https://upload.test/put/d7", requiredHeaders: { "Content-Type": "image/png" } };

  function setup(confirm: () => Promise<unknown>, stored = true) {
    const put = vi.mocked(putWithProgress).mockResolvedValue(stored);
    const send = vi.fn((path: string) => path.endsWith("/presign") ? Promise.resolve(presigned) : confirm());
    const onUploaded = vi.fn();
    renderWithWork(<CaseDocumentUpload caseId="c1" send={send as unknown as Send} onUploaded={onUploaded}/>);
    return { send, put, onUploaded };
  }
  const png = () => new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], "lab-results.png", { type: "image/png" });

  it("uploads to the patient's own case and hands on the clean document", async () => {
    const { send, onUploaded } = setup(() => Promise.resolve({ documentId: "d7", status: "CLEAN" }));
    fireEvent.change(screen.getByLabelText("Choose a file"), { target: { files: [png()] } });
    expect(await screen.findByText("lab-results.png passed the check and is now in your documents.")).toBeTruthy();
    expect(send.mock.calls.map(([path]) => path)).toEqual(["/patient/cases/c1/documents/presign", "/patient/cases/c1/documents/confirm"]);
    expect(onUploaded).toHaveBeenCalledWith(expect.objectContaining({ documentId: "d7", fileName: "lab-results.png", status: "CLEAN" }));
  });

  it("files the case team's paperwork through the work endpoint (D-10)", async () => {
    vi.mocked(putWithProgress).mockResolvedValue(true);
    const send = vi.fn((path: string) => path.endsWith("/presign") ? Promise.resolve(presigned) : Promise.resolve({ documentId: "d7", status: "CLEAN" }));
    renderWithWork(<CaseDocumentUpload caseId="c1" send={send as unknown as Send} base="/work/cases/c1/documents"
      ready="{name} passed the check and is now in this case's documents." onUploaded={vi.fn()}/>);
    fireEvent.change(screen.getByLabelText("Choose a file"), { target: { files: [png()] } });
    expect(await screen.findByText("lab-results.png passed the check and is now in this case's documents.")).toBeTruthy();
    expect(send.mock.calls.map(([path]) => path)).toEqual(["/work/cases/c1/documents/presign", "/work/cases/c1/documents/confirm"]);
  });

  it("shows how much of the file has gone while it uploads", async () => {
    let report: (fraction: number) => void = () => {};
    let done: (stored: boolean) => void = () => {};
    setup(() => Promise.resolve({ documentId: "d7", status: "CLEAN" }));
    vi.mocked(putWithProgress).mockImplementation((_url, _headers, _file, onProgress) => { report = onProgress; return new Promise(resolve => { done = resolve; }); });
    fireEvent.change(screen.getByLabelText("Choose a file"), { target: { files: [png()] } });
    const bar = await screen.findByRole("progressbar", { name: "Uploading lab-results.png…" });
    expect(bar.getAttribute("aria-valuenow")).toBe("0");
    act(() => report(0.42));
    expect(bar.getAttribute("aria-valuenow")).toBe("42");
    await act(async () => done(true));
    expect(await screen.findByText("lab-results.png passed the check and is now in your documents.")).toBeTruthy();
    expect(screen.queryByRole("progressbar")).toBeNull();
  });

  it("says when the storage refused the bytes, and when the case is full, without confirming anything", async () => {
    const { send, onUploaded } = setup(() => Promise.resolve({}), false);
    fireEvent.change(screen.getByLabelText("Choose a file"), { target: { files: [png()] } });
    expect(await screen.findByText("The file could not be uploaded. Try again, or message your coordinator.")).toBeTruthy();
    expect(send).toHaveBeenCalledTimes(1);
    send.mockImplementationOnce(() => Promise.reject(Object.assign(new Error("full"), { code: "CASE_FILE_LIMIT_REACHED" })));
    fireEvent.change(screen.getByLabelText("Choose a file"), { target: { files: [png()] } });
    expect(await screen.findByText("This case holds as many files as it can. Message your coordinator.")).toBeTruthy();
    expect(onUploaded).not.toHaveBeenCalled();
  });

  it("refuses a file over 15 MB before sending it", async () => {
    const { send } = setup(() => Promise.resolve({}));
    const big = new File(["x"], "scan.pdf", { type: "application/pdf" });
    Object.defineProperty(big, "size", { value: 16 * 1024 * 1024 });
    fireEvent.change(screen.getByLabelText("Choose a file"), { target: { files: [big] } });
    await waitFor(() => expect(screen.getByText(/This file is over 15 MB/)).toBeTruthy());
    expect(send).not.toHaveBeenCalled();
  });
});
