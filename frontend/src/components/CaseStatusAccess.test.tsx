import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

import { CaseStatusAccess } from "./CaseStatusAccess";

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
  await screen.findByRole("heading", { name: /information required/i });
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
