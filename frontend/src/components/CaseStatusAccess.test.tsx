import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

import { CaseStatusAccess } from "./CaseStatusAccess";

// The page navigates to the proposal with the App Router; vitest has no router context, so it is a spy.
const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

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
  render(<CaseStatusAccess locale="en" token="tok-1"/>);
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

  it("never shows case data before the one-time code is verified", async () => {
    vi.stubGlobal("fetch", stub({ "tok-1": () => json(summary) }));
    render(<CaseStatusAccess locale="en" token="tok-1"/>);
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
    expect(screen.getByText(/\(optional\)/i)).toBeTruthy();
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

  it("reports an invalid or expired link without revealing anything", async () => {
    vi.stubGlobal("fetch", stub({ "tok-1": () => json({ code: "CASE_LINK_INVALID" }, false, 404) }));
    render(<CaseStatusAccess locale="en" token="tok-1"/>);
    expect(await screen.findByText(/invalid or has expired/i)).toBeTruthy();
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
    render(<CaseStatusAccess locale="en" token="tok-1"/>);
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
    expect(labels).toEqual(["Case received", "Coordinator review", "Consultant review", "Your proposal", "Deposit", "Treatment", "Follow-up"]);
    // The internal case status is never sent to this page, so it can never be rendered.
    expect(screen.queryByText(/CONSULTANT_REVIEW/)).toBeNull();
  });

  it("leads with the request when the patient has something to do", async () => {
    await reachStatus({ ...consultantStatus, phase: "coordinator", actionRequired: true, action });
    expect(await screen.findByRole("heading", { name: /we need something from you/i })).toBeTruthy();
    expect(screen.queryByText(/no action is required/i)).toBeNull();
    expect(screen.getByLabelText(/current medication/i)).toBeTruthy();
  });

  // ---- the proposal, exactly as the backend says the patient may see it ----

  it("offers no proposal action while the proposal is still being prepared", async () => {
    await reachStatus({ ...consultantStatus, phase: "proposal", proposal: { state: "PREPARING", action: null, versionNumber: null, validUntil: null, decidedAt: null } });
    expect(await screen.findByRole("heading", { name: /we are preparing your proposal/i })).toBeTruthy();
    expect(screen.getAllByText(/your proposal is being prepared/i)).toHaveLength(1); // said once
    expect(screen.queryByRole("button", { name: /review proposal/i })).toBeNull();
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
    render(<CaseStatusAccess locale="en" token="tok-1"/>);
    fireEvent.click(await screen.findByRole("button", { name: /send verification code/i }));
    fireEvent.change(await screen.findByLabelText(/verification code/i), { target: { value: "123456" } });
    fireEvent.click(screen.getByRole("button", { name: /verify and continue/i }));

    expect(await screen.findByRole("heading", { name: /your proposal is ready to review/i })).toBeTruthy();
    expect(screen.queryByText(/no action is required/i)).toBeNull(); // a decision is waiting
    expect(screen.getByText(/version 2/i)).toBeTruthy();
    const buttons = screen.getAllByRole("button", { name: /review proposal/i });
    expect(buttons).toHaveLength(1); // one action for one business outcome
    fireEvent.click(buttons[0]);
    await vi.waitFor(() => expect(push).toHaveBeenCalledWith("/en/proposal/share-9"));
    const access = fetchMock.mock.calls.find(call => String(call[0]).endsWith("/proposal-access"));
    expect(JSON.parse(String((access?.[1] as RequestInit).body))).toEqual({ grant: "grant-1" });
    // The grant travels through session storage for this token only — never through the URL.
    expect(JSON.parse(sessionStorage.getItem("rs-proposal-grant:share-9") ?? "{}").grant).toBe("pgrant-9");
    expect(push.mock.calls[0][0]).not.toContain("pgrant-9");
  });

  it("tells the patient when an acknowledged proposal is read-only rather than faking a button", async () => {
    await reachStatus({ ...consultantStatus, phase: "deposit", proposal: { state: "ACCEPTED", action: "VIEW_PROPOSAL", versionNumber: 1, validUntil: null, decidedAt: "2026-09-10T10:00:00Z" } });
    expect(await screen.findByText(/you acknowledged your estimate/i)).toBeTruthy();
    expect(screen.queryByRole("button", { name: /review proposal/i })).toBeNull();
  });
});
