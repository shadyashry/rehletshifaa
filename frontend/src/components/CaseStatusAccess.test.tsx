import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, configure, fireEvent, render, screen } from "@testing-library/react";

import { CaseStatusAccess } from "./CaseStatusAccess";
import en from "@/messages/en.json";
import ar from "@/messages/ar.json";

// The page navigates to the proposal with the App Router; vitest has no router context, so it is a spy.
const push = vi.fn();
const statusCopy = (d: typeof en) => ({ ...d.secureLink.status, workingDays: d.portalWork.plural.workingDays, stamp: d.portalWork.myCare.stamp, caseNumber: d.form.caseNumber });
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
// Each case walks the code step first; under a full parallel run the default 1s wait for the next page can run out.
configure({ asyncUtilTimeout: 3000 });

/**
 * The patient's no-login action page: verify a one-time code, see only what was actually requested,
 * answer it, and nothing else. No sign-in or registration step exists in this flow.
 */
const summary = { caseNumber: "RS-10281", destinationHint: "***0031" };

const action = {
  taskId: "t1", title: "Information required for your case", message: "Please confirm your current medication.",
  blocking: true, dueAt: null,
  items: [
    { id: "i1", kind: "INFORMATION", code: "CURRENT_MEDICATION", label: "Current medication", required: true, completed: false, response: null },
    { id: "i2", kind: "INFORMATION", code: "PREFERRED_DATES", label: "Preferred treatment dates", required: false, completed: false, response: null },
  ],
};
const status = { caseNumber: "RS-10281", statusEn: "In review", statusAr: "قيد المراجعة", actionRequired: true, action };

function json(body: unknown, ok = true, status = 200) {
  return Promise.resolve({ ok, status, json: () => Promise.resolve(body) } as Response);
}

function stub(routes: Record<string, () => Promise<Response>>) {
  return vi.fn((url: string, init?: RequestInit) => {
    const match = Object.keys(routes).find(suffix => String(url).endsWith(suffix));
    if (!match) throw new Error(`Unstubbed call: ${url} ${init?.method ?? "GET"}`);
    return routes[match]();
  });
}

async function reachAction(overrides: Record<string, () => Promise<Response>> = {}) {
  const fetchMock = stub({
    "/request-access": () => json(summary),
    "/verify": () => json({ grant: "grant-1" }),
    "/view": () => json(status),
    ...overrides,
    "/respond": overrides["/respond"] ?? (() => json("11111111-1111-1111-1111-111111111111")),
    "tok-1": () => json(summary),
  });
  vi.stubGlobal("fetch", fetchMock);
  render(<CaseStatusAccess locale="en" token="tok-1" copy={statusCopy(en)} journeyCopy={en.secureLink.journey}/>);
  fireEvent.click(await screen.findByRole("button", { name: /send verification code/i }));
  const code = await screen.findByLabelText(/verification code/i);
  fireEvent.change(code, { target: { value: "123456" } });
  fireEvent.click(screen.getByRole("button", { name: /verify and continue/i }));
  // The situation is stated once above the form ("We need something from you"); this heading names
  // the form itself, so the page no longer says the same thing twice.
  await screen.findByRole("heading", { name: /your response/i });
  return fetchMock;
}

describe("CaseStatusAccess", () => {
  beforeEach(() => vi.resetAllMocks());
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

  // A-02 (P0-3): the emergency instruction is on the page before and after verification, in the patient's language.
  it("tells the patient to seek local care in an emergency, in English and Arabic", async () => {
    vi.stubGlobal("fetch", stub({ "tok-1": () => json(summary) }));
    const { unmount } = render(<CaseStatusAccess locale="en" token="tok-1" emergency={en.common.emergencyNotice} copy={statusCopy(en)} journeyCopy={en.secureLink.journey}/>);
    await screen.findByRole("button", { name: /send verification code/i });
    const note = screen.getByRole("note", { name: en.common.emergencyNotice.title });
    expect(note.textContent).toContain(en.common.emergencyNotice.body);
    unmount();
    render(<CaseStatusAccess locale="ar" token="tok-1" emergency={ar.common.emergencyNotice} copy={statusCopy(ar)} journeyCopy={ar.secureLink.journey}/>);
    expect(await screen.findByRole("note", { name: ar.common.emergencyNotice.title })).toBeTruthy();
  });

  it("never shows case data before the one-time code is verified", async () => {
    vi.stubGlobal("fetch", stub({ "tok-1": () => json(summary) }));
    render(<CaseStatusAccess locale="en" token="tok-1" copy={statusCopy(en)} journeyCopy={en.secureLink.journey}/>);
    expect(await screen.findByRole("button", { name: /send verification code/i })).toBeTruthy();
    expect(screen.queryByText(/current medication/i)).toBeNull();
    // No sign-in or registration step exists on this page.
    expect(screen.queryByText(/sign in|register/i)).toBeNull();
  });

  it("shows only the requested items, marking what is required", async () => {
    await reachAction();
    expect(screen.getByLabelText(/current medication/i)).toBeTruthy();
    expect(screen.getByLabelText(/preferred treatment dates/i)).toBeTruthy();
    expect(screen.getByText(/please confirm your current medication/i)).toBeTruthy();
    // The optional item, and the free note beside requested items, say so.
    expect(screen.getAllByText(/\(optional\)/i)).toHaveLength(2);
  });

  it("blocks submission until the required item is answered", async () => {
    const fetchMock = await reachAction();
    fireEvent.click(screen.getByRole("button", { name: /send information/i }));
    expect(await screen.findByText(/please provide this information/i)).toBeTruthy();
    expect(fetchMock.mock.calls.some(call => String(call[0]).endsWith("/respond"))).toBe(false);
  });

  it("submits the answers against their requested items and confirms the handoff", async () => {
    const fetchMock = await reachAction();
    fireEvent.change(screen.getByLabelText(/current medication/i), { target: { value: "Aspirin 75mg" } });
    fireEvent.click(screen.getByRole("button", { name: /send information/i }));
    expect(await screen.findByText(/your information was sent/i)).toBeTruthy();
    const respond = fetchMock.mock.calls.find(call => String(call[0]).endsWith("/respond"))!;
    const body = JSON.parse((respond[1] as RequestInit).body as string);
    expect(body.items).toEqual([{ itemId: "i1", value: "Aspirin 75mg", documentId: null }]);
    expect(body.grant).toBe("grant-1");
  });

  it("renders backend field errors against the right item", async () => {
    await reachAction({
      "/respond": () => json({ code: "VALIDATION_FAILED", message: "Invalid",
        errors: [{ field: "item:i1", message: "Please provide this information." }] }, false, 400),
    });
    fireEvent.change(screen.getByLabelText(/current medication/i), { target: { value: "x" } });
    fireEvent.click(screen.getByRole("button", { name: /send information/i }));
    expect(await screen.findByText(/please provide this information/i)).toBeTruthy();
    // Nothing the patient typed is lost.
    expect((screen.getByLabelText(/current medication/i) as HTMLTextAreaElement).value).toBe("x");
  });

  it("reports an invalid or expired link without revealing anything, and says how to get a new one", async () => {
    vi.stubGlobal("fetch", stub({ "tok-1": () => json({ code: "CASE_LINK_INVALID" }, false, 404) }));
    render(<CaseStatusAccess locale="en" token="tok-1" copy={statusCopy(en)} journeyCopy={en.secureLink.journey}/>);
    expect(await screen.findByRole("heading", { name: /invalid or has expired/i })).toBeTruthy();
    expect(screen.getByRole("link", { name: en.secureLink.status.invalidAction }).getAttribute("href")).toBe("/en/track-case");
  });

  // ---- slice B: the sealed page, and failures in the patient's words ----

  it("seals the page: case number, where the code goes, that we never ask for it, one action", async () => {
    vi.stubGlobal("fetch", stub({ "tok-1": () => json(summary) }));
    render(<CaseStatusAccess locale="en" token="tok-1" copy={statusCopy(en)} journeyCopy={en.secureLink.journey}/>);
    const heading = await screen.findByRole("heading", { level: 1, name: en.secureLink.status.title });
    expect(screen.getByText("RS-10281")).toBeTruthy();
    expect(screen.getByText("***0031")).toBeTruthy();
    expect(screen.getByText(en.secureLink.status.neverAsk)).toBeTruthy();
    expect(screen.getAllByRole("button")).toHaveLength(1);
    // Arriving on the page leaves focus where the browser puts it; only the patient's own steps move it.
    expect(document.activeElement).not.toBe(heading);
  });

  it("names the channel the code goes to", async () => {
    vi.stubGlobal("fetch", stub({ "tok-1": () => json({ ...summary, channel: "WHATSAPP" }) }));
    render(<CaseStatusAccess locale="en" token="tok-1" copy={statusCopy(en)} journeyCopy={en.secureLink.journey}/>);
    expect(await screen.findByText(new RegExp(en.secureLink.status.sendToWhatsApp))).toBeTruthy();
  });

  it("keeps a code typed in Arabic-Indic digits, and says when digits are missing", async () => {
    const fetchMock = stub({
      "/request-access": () => json(summary),
      "/verify": () => json({ grant: "grant-1" }),
      "/view": () => json(status),
      "tok-1": () => json(summary),
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<CaseStatusAccess locale="ar" token="tok-1" copy={statusCopy(ar)} journeyCopy={ar.secureLink.journey}/>);
    fireEvent.click(await screen.findByRole("button", { name: ar.secureLink.status.send }));
    const field = await screen.findByLabelText(ar.secureLink.status.code) as HTMLInputElement;
    fireEvent.change(field, { target: { value: "١٢٣" } });
    expect(field.value).toBe("123");
    fireEvent.click(screen.getByRole("button", { name: ar.secureLink.status.verify }));
    expect(await screen.findByText(ar.secureLink.status.codeIncomplete)).toBeTruthy();
    fireEvent.change(field, { target: { value: "١٢٣٤٥٦" } });
    fireEvent.click(screen.getByRole("button", { name: ar.secureLink.status.verify }));
    await vi.waitFor(() => expect(fetchMock.mock.calls.some(call => String(call[0]).endsWith("/verify"))).toBe(true));
    const verify = fetchMock.mock.calls.find(call => String(call[0]).endsWith("/verify"))!;
    expect(JSON.parse((verify[1] as RequestInit).body as string)).toEqual({ code: "123456" });
  });

  it("says beside the file when its upload fails, and keeps the rest of the form", async () => {
    const docAction = { ...action, items: [{ id: "d1", kind: "DOCUMENT", code: "SCAN", label: "Latest scan", required: true, completed: false, response: null }] };
    const fetchMock = await reachAction({
      "/view": () => json({ ...status, action: docAction }),
      "/documents/presign": () => json({ documentId: "doc-1", uploadUrl: "https://files.example.test/put", requiredHeaders: {} }),
      "files.example.test/put": () => json({}, false, 500),
    });
    fireEvent.change(screen.getByLabelText(/latest scan/i), { target: { files: [new File(["x"], "scan.pdf", { type: "application/pdf" })] } });
    fireEvent.click(screen.getByRole("button", { name: /send information/i }));
    expect(await screen.findByText(en.secureLink.status.uploadFailed)).toBeTruthy();
    expect(fetchMock.mock.calls.some(call => String(call[0]).endsWith("/respond"))).toBe(false);
    expect(screen.getByText("scan.pdf")).toBeTruthy();
  });

  it("says a wrong code in its own words, beside the field, never the backend's message", async () => {
    vi.stubGlobal("fetch", stub({
      "/request-access": () => json(summary),
      "/verify": () => json({ code: "VERIFICATION_INVALID", message: "The verification code is invalid or has expired" }, false, 400),
      "tok-1": () => json(summary),
    }));
    render(<CaseStatusAccess locale="en" token="tok-1" copy={statusCopy(en)} journeyCopy={en.secureLink.journey}/>);
    fireEvent.click(await screen.findByRole("button", { name: /send verification code/i }));
    const field = await screen.findByLabelText(/verification code/i);
    fireEvent.change(field, { target: { value: "000000" } });
    fireEvent.click(screen.getByRole("button", { name: /verify and continue/i }));
    expect(await screen.findByText(en.secureLink.status.codeInvalid)).toBeTruthy();
    expect(screen.queryByText("The verification code is invalid or has expired")).toBeNull();
    expect(field.getAttribute("aria-invalid")).toBe("true");
  });

  it("says when too many codes were asked for", async () => {
    vi.stubGlobal("fetch", stub({
      "/request-access": () => json({ code: "TOO_MANY_REQUESTS", message: "Too many verification requests. Please try again later." }, false, 429),
      "tok-1": () => json(summary),
    }));
    render(<CaseStatusAccess locale="en" token="tok-1" copy={statusCopy(en)} journeyCopy={en.secureLink.journey}/>);
    fireEvent.click(await screen.findByRole("button", { name: /send verification code/i }));
    expect(await screen.findByText(en.secureLink.status.tooManyCodes)).toBeTruthy();
  });

  it("moves focus to the first field in error, and to the note when nothing was written", async () => {
    await reachAction();
    fireEvent.click(screen.getByRole("button", { name: /send information/i }));
    await screen.findByText(/please provide this information/i);
    const first = screen.getByLabelText(/current medication/i);
    await vi.waitFor(() => expect(document.activeElement).toBe(first));
    expect(first.getAttribute("aria-invalid")).toBe("true");
    expect(first.getAttribute("aria-describedby")).toBeTruthy();
  });

  it("checks a chosen file's type before sending it", async () => {
    const docAction = { ...action, items: [{ id: "d1", kind: "DOCUMENT", code: "SCAN", label: "Latest scan", required: true, completed: false, response: null }] };
    await reachAction({ "/view": () => json({ ...status, action: docAction }) });
    const input = screen.getByLabelText(/latest scan/i) as HTMLInputElement;
    fireEvent.change(input, { target: { files: [new File(["x"], "notes.docx", { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" })] } });
    expect(await screen.findByText(en.secureLink.status.fileType)).toBeTruthy();
  });

  it("shows an empty-response refusal beside the note, in the page's words", async () => {
    await reachAction({
      "/view": () => json({ ...status, action: { ...action, items: [] } }),
    });
    fireEvent.click(screen.getByRole("button", { name: /send information/i }));
    expect(await screen.findByText(en.secureLink.status.noteMissing)).toBeTruthy();
    await vi.waitFor(() => expect(document.activeElement?.id).toBe("status-note"));
  });

  it("thanks the patient on a page of the same file, with the case number and the heading focused", async () => {
    await reachAction();
    fireEvent.change(screen.getByLabelText(/current medication/i), { target: { value: "Aspirin 75mg" } });
    fireEvent.click(screen.getByRole("button", { name: /send information/i }));
    const heading = await screen.findByRole("heading", { level: 1, name: en.secureLink.status.doneTitle });
    expect(screen.getByText("RS-10281")).toBeTruthy();
    await vi.waitFor(() => expect(document.activeElement).toBe(heading));
    expect(screen.queryByText("✓")).toBeNull();
  });
});

describe("CaseStatusAccess journey", () => {
  beforeEach(() => vi.resetAllMocks());
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

  const consultantStatus = { caseNumber: "RS-10281", statusEn: "Under consultant review", statusAr: "قيد مراجعة الاستشاري",
    phase: "consultant", actionRequired: false, action: null };

  async function reachStatus(view: unknown) {
    vi.stubGlobal("fetch", stub({
      "/request-access": () => json(summary),
      "/verify": () => json({ grant: "grant-1" }),
      "/view": () => json(view),
      "tok-1": () => json(summary),
    }));
    render(<CaseStatusAccess locale="en" token="tok-1" copy={statusCopy(en)} journeyCopy={en.secureLink.journey}/>);
    fireEvent.click(await screen.findByRole("button", { name: /send verification code/i }));
    fireEvent.change(await screen.findByLabelText(/verification code/i), { target: { value: "123456" } });
    fireEvent.click(screen.getByRole("button", { name: /verify and continue/i }));
  }

  it("explains where the case is and shows the journey phases", async () => {
    await reachStatus(consultantStatus);
    expect(await screen.findByRole("heading", { name: /a consultant is reviewing your case/i })).toBeTruthy();
    expect(screen.getByText(/you will receive a recommendation/i)).toBeTruthy();
    expect(screen.getByText(/no action is required from you right now/i)).toBeTruthy();

    const tracker = screen.getByRole("list");
    const labels = [...tracker.querySelectorAll("li")].map(li => (li.textContent ?? "").trim());
    // One numbered journey; each step says its state in words for screen readers, and the current one is marked.
    expect(labels).toEqual(["1Case received (completed)", "2Coordinator review (completed)", "3Consultant review (current)", "4Your proposal", "5Coordination deposit", "6Treatment", "7Follow-up"]);
    expect(tracker.querySelector("[aria-current=step]")?.textContent).toContain("Consultant review");
    // The internal case status is never sent to this page, so it can never be rendered.
    expect(screen.queryByText(/CONSULTANT_REVIEW/)).toBeNull();
    // The status line repeated the heading; it is gone.
    expect(screen.queryByText(/current update/i)).toBeNull();
    expect(screen.queryByText(/under consultant review/i)).toBeNull();
  });

  // ---- D-1: the stamp, only on the three moments and only with the backend's date ----

  it("stamps the Consultant's phase In review with the date the backend recorded", async () => {
    await reachStatus({ ...consultantStatus, milestones: { receivedAt: "2026-03-01T08:00:00Z", consultantReviewAt: "2026-03-04T08:00:00Z", estimateReadyAt: null } });
    await screen.findByRole("heading", { name: /a consultant is reviewing your case/i });
    expect(screen.getByText("In review, Mar 4", { exact: false })).toBeTruthy();
    expect(screen.queryByText(/^Received/)).toBeNull();
  });

  it("stamps a received case Received, and prints no stamp without a date (never today)", async () => {
    await reachStatus({ ...consultantStatus, phase: "coordinator", milestones: { receivedAt: "2026-03-01T08:00:00Z" } });
    await screen.findByRole("heading", { name: /your coordinator is reviewing your case/i });
    expect(screen.getByText("Received, Mar 1", { exact: false })).toBeTruthy();
    cleanup(); vi.unstubAllGlobals();
    await reachStatus({ ...consultantStatus, milestones: null });
    await screen.findByRole("heading", { name: /a consultant is reviewing your case/i });
    expect(document.querySelector(".case-stamp")).toBeNull();
  });

  it("stamps a ready estimate from its release date when the milestone is absent; no stamp on a request for information", async () => {
    await reachStatus({ ...consultantStatus, phase: "proposal", proposal: { state: "READY", action: "REVIEW_PROPOSAL", versionNumber: 1, validUntil: null, decidedAt: null, documentType: "PRELIMINARY_ESTIMATE", releasedAt: "2026-03-09T10:00:00Z" } });
    await screen.findByRole("heading", { name: /your estimate is ready to review/i });
    expect(screen.getByText("Estimate ready, Mar 9", { exact: false })).toBeTruthy();
    cleanup(); vi.unstubAllGlobals();
    await reachStatus({ ...consultantStatus, phase: "coordinator", actionRequired: true, action, milestones: { receivedAt: "2026-03-01T08:00:00Z" } });
    await screen.findByRole("heading", { name: /we need something from you/i });
    expect(document.querySelector(".case-stamp")).toBeNull();
  });

  it("names a ready final quote as a quote, without the estimate stamp", async () => {
    await reachStatus({ ...consultantStatus, phase: "proposal", milestones: { estimateReadyAt: "2026-03-09T10:00:00Z" },
      proposal: { state: "READY", action: "REVIEW_PROPOSAL", versionNumber: 1, validUntil: null, decidedAt: null, documentType: "FINAL_TREATMENT_QUOTE", releasedAt: "2026-04-01T10:00:00Z" } });
    await screen.findByRole("heading", { name: en.secureLink.status.quoteReadyTitle });
    expect(screen.getByRole("button", { name: en.secureLink.status.quoteReview })).toBeTruthy();
    expect(document.querySelector(".case-stamp")).toBeNull();
  });

  it("says how long the team usually takes over the phase and what to do meanwhile (P1-6)", async () => {
    await reachStatus({ ...consultantStatus, expectedWorkingDays: 2 });
    expect(await screen.findByText("This usually takes up to 2 working days.")).toBeTruthy();
    expect(screen.getByText(/keep following your own doctor's advice/i)).toBeTruthy();
  });

  it("leads with the request when the patient has something to do", async () => {
    await reachStatus({ ...consultantStatus, phase: "coordinator", actionRequired: true, action });
    expect(await screen.findByRole("heading", { name: /we need something from you/i })).toBeTruthy();
    expect(screen.queryByText(/no action is required/i)).toBeNull();
    expect(screen.queryByText(/usually takes/i)).toBeNull();
    expect(screen.queryByText(/meanwhile/i)).toBeNull();
    expect(screen.getByLabelText(/current medication/i)).toBeTruthy();
  });

  // ---- the proposal, exactly as the backend says the patient may see it ----

  it("offers no proposal action while the proposal is still being prepared", async () => {
    await reachStatus({ ...consultantStatus, phase: "proposal", proposal: { state: "PREPARING", action: null, versionNumber: null, validUntil: null, decidedAt: null } });
    expect(await screen.findByRole("heading", { name: /we are preparing your proposal/i })).toBeTruthy();
    expect(screen.getAllByText(/your proposal is being prepared/i)).toHaveLength(1); // said once
    expect(screen.queryByRole("button", { name: /review (proposal|estimate)/i })).toBeNull();
    expect(screen.queryByRole("link", { name: /proposal/i })).toBeNull();
  });

  it("shows nothing about a proposal when there is none", async () => {
    await reachStatus({ ...consultantStatus, proposal: { state: "NONE", action: null, versionNumber: null, validUntil: null, decidedAt: null } });
    await screen.findByRole("heading", { name: /a consultant is reviewing your case/i });
    expect(document.getElementById("status-proposal")).toBeNull(); // the journey tracker still names the phase; no proposal section exists
  });

  it("opens the released proposal through the verified session, without a second code", async () => {
    push.mockClear();
    const ready = { ...consultantStatus, phase: "proposal", proposal: { state: "READY", action: "REVIEW_PROPOSAL", versionNumber: 2, validUntil: "2026-12-31T00:00:00Z", decidedAt: null } };
    const fetchMock = stub({
      "/request-access": () => json(summary),
      "/verify": () => json({ grant: "grant-1" }),
      "/view": () => json(ready),
      "/proposal-access": () => json({ token: "share-9", grant: "pgrant-9", expiresAt: "2099-01-01T00:00:00Z" }),
      "tok-1": () => json(summary),
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<CaseStatusAccess locale="en" token="tok-1" copy={statusCopy(en)} journeyCopy={en.secureLink.journey}/>);
    fireEvent.click(await screen.findByRole("button", { name: /send verification code/i }));
    fireEvent.change(await screen.findByLabelText(/verification code/i), { target: { value: "123456" } });
    fireEvent.click(screen.getByRole("button", { name: /verify and continue/i }));

    expect(await screen.findByRole("heading", { name: /your estimate is ready to review/i })).toBeTruthy();
    expect(screen.queryByText(/no action is required/i)).toBeNull(); // a decision is waiting
    // An updated document is said so in words; the technical version number is not patient-facing (UX-8).
    expect(screen.getByText(/Updated version/)).toBeTruthy();
    expect(screen.queryByText(/version 2/i)).toBeNull();
    const buttons = screen.getAllByRole("button", { name: /review estimate/i });
    expect(buttons).toHaveLength(1); // one action for one business outcome
    fireEvent.click(buttons[0]);
    await vi.waitFor(() => expect(push).toHaveBeenCalledWith("/en/proposal/share-9"));
    const access = fetchMock.mock.calls.find(call => String(call[0]).endsWith("/proposal-access"));
    expect(JSON.parse(String((access?.[1] as RequestInit).body))).toEqual({ grant: "grant-1" });
    // The grant travels through session storage for this token only — never through the URL.
    expect(JSON.parse(sessionStorage.getItem("rs-proposal-grant:share-9") ?? "{}").grant).toBe("pgrant-9");
    expect(push.mock.calls[0][0]).not.toContain("pgrant-9");
  });

  it("tells a patient who asked for changes what is happening, once, with no contradicting story", async () => {
    await reachStatus({ ...consultantStatus, phase: "proposal", proposal: { state: "REVISION_REQUESTED", action: null, versionNumber: 1, validUntil: null, decidedAt: "2026-09-10T10:00:00Z" } });
    expect(await screen.findByRole("heading", { level: 1, name: en.secureLink.status.revisionTitle })).toBeTruthy();
    expect(screen.getAllByText(en.secureLink.status.proposalRevision)).toHaveLength(1);
    expect(screen.queryByText(/being prepared, or are ready/i)).toBeNull();
  });

  it("keeps a decidable estimate reachable while the coordinator asks for something, without a second filled action", async () => {
    await reachStatus({ ...consultantStatus, phase: "proposal", actionRequired: true, action,
      proposal: { state: "READY", action: "REVIEW_PROPOSAL", versionNumber: 1, validUntil: null, decidedAt: null, documentType: "PRELIMINARY_ESTIMATE" } });
    await screen.findByRole("heading", { level: 1, name: /we need something from you/i });
    const review = screen.getByRole("button", { name: en.secureLink.status.proposalReview });
    expect(review.className).toContain("btn-secondary");
    expect(document.querySelectorAll(".btn-primary")).toHaveLength(1);
  });

  it("says when the estimate can no longer be opened, in the page's words", async () => {
    const ready = { ...consultantStatus, phase: "proposal", proposal: { state: "READY", action: "REVIEW_PROPOSAL", versionNumber: 1, validUntil: null, decidedAt: null } };
    vi.stubGlobal("fetch", stub({
      "/request-access": () => json(summary),
      "/verify": () => json({ grant: "grant-1" }),
      "/view": () => json(ready),
      "/proposal-access": () => json({ code: "PROPOSAL_NOT_AVAILABLE", message: "No proposal is available for review right now" }, false, 409),
      "tok-1": () => json(summary),
    }));
    render(<CaseStatusAccess locale="en" token="tok-1" copy={statusCopy(en)} journeyCopy={en.secureLink.journey}/>);
    fireEvent.click(await screen.findByRole("button", { name: /send verification code/i }));
    fireEvent.change(await screen.findByLabelText(/verification code/i), { target: { value: "123456" } });
    fireEvent.click(screen.getByRole("button", { name: /verify and continue/i }));
    fireEvent.click(await screen.findByRole("button", { name: en.secureLink.status.proposalReview }));
    expect(await screen.findByText(en.secureLink.status.proposalUnavailable)).toBeTruthy();
    expect(screen.queryByText(/No proposal is available/)).toBeNull();
  });

  it("tells the patient when an acknowledged proposal is read-only rather than faking a button", async () => {
    await reachStatus({ ...consultantStatus, phase: "deposit", proposal: { state: "ACCEPTED", action: "VIEW_PROPOSAL", versionNumber: 1, validUntil: null, decidedAt: "2026-09-10T10:00:00Z" } });
    expect(await screen.findByText(/you acknowledged your estimate/i)).toBeTruthy();
    // The deposit page names the next step; the note no longer says the coordinator is arranging it.
    expect(screen.queryByText(/arranging the next steps/i)).toBeNull();
    expect(screen.queryByRole("button", { name: /review (proposal|estimate)/i })).toBeNull();
  });

  // DEP-3: the deposit is the patient's to pay in My Care, and this link cannot tell whether it was paid.
  it("in the deposit phase says where and how to pay, and never that nothing is needed", async () => {
    await reachStatus({ ...consultantStatus, phase: "deposit", expectedWorkingDays: 1 });
    expect(await screen.findByRole("heading", { name: "Your coordination deposit" })).toBeTruthy();
    expect(screen.getByText(/sign in to My Care to pay it by bank transfer or through an agent/i)).toBeTruthy();
    expect(screen.queryByText(/no action is required/i)).toBeNull();
    expect(screen.queryByText(/coordinator will share the payment details/i)).toBeNull();
    expect(screen.queryByText(/usually takes/i)).toBeNull();
    expect(screen.getByRole("link", { name: "Sign in to pay" }).getAttribute("href")).toBe("/en/portal?signin=1");
  });
});
