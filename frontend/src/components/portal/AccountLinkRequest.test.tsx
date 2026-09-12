import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

import { AccountLinkRequest } from "./AccountLinkRequest";

/**
 * "Is this case for you?" — the owner of an already-registered email resolves a case explicitly.
 * The dialog must never pre-select an answer, must ask for the relationship only when acting for someone
 * else, and must post exactly the chosen resolution.
 */
const view = { caseNumber: "RS-2026-000123", patientDisplayName: "Layla Hassan", origin: "INTAKE", submittedAs: "PATIENT", relationship: null, resolution: null };

function apiStub(responses: Record<string, unknown>) {
  const calls: { path: string; init?: RequestInit }[] = [];
  const api = vi.fn(async (path: string, init?: RequestInit) => {
    calls.push({ path, init });
    const key = Object.keys(responses).find(k => path.endsWith(k));
    if (!key) throw new Error(`unstubbed ${path}`);
    const value = responses[key];
    if (value instanceof Error) throw value;
    return value;
  }) as unknown as <T,>(path: string, init?: RequestInit) => Promise<T>;
  return { api, calls };
}

describe("AccountLinkRequest", () => {
  afterEach(cleanup);

  it("shows the question with nothing pre-selected and requires an explicit answer", async () => {
    const { api } = apiStub({ "/link-requests/tok": view });
    render(<AccountLinkRequest locale="en" token="tok" api={api} onResolved={() => {}} />);
    expect(await screen.findByText(/case RS-2026-000123 was started for “Layla Hassan”/i)).toBeTruthy();
    for (const radio of screen.getAllByRole("radio")) expect((radio as HTMLInputElement).checked).toBe(false);
    expect((screen.getByRole("button", { name: /confirm/i }) as HTMLButtonElement).disabled).toBe(true);
    // No relationship is asked until "I'm helping this person" is chosen.
    expect(screen.queryByLabelText(/relationship/i)).toBeNull();
  });

  it("links as a representative with the chosen relationship and never as the patient", async () => {
    const { api, calls } = apiStub({ "/resolve": { ...view, resolution: "REPRESENTATIVE", relationship: "PARENT" }, "/link-requests/tok": view });
    const onResolved = vi.fn();
    render(<AccountLinkRequest locale="en" token="tok" api={api} onResolved={onResolved} />);
    fireEvent.click(await screen.findByRole("radio", { name: /helping this person/i }));
    expect((screen.getByRole("button", { name: /confirm/i }) as HTMLButtonElement).disabled).toBe(true); // relationship still missing
    fireEvent.change(screen.getByLabelText(/relationship/i), { target: { value: "PARENT" } });
    fireEvent.click(screen.getByRole("button", { name: /confirm/i }));
    expect(await screen.findByText(/linked as this patient's representative/i)).toBeTruthy();
    const resolve = calls.find(c => c.path.endsWith("/resolve"));
    expect(JSON.parse(String(resolve?.init?.body))).toEqual({ resolution: "REPRESENTATIVE", relationship: "PARENT" });
    fireEvent.click(screen.getByRole("button", { name: /continue/i }));
    expect(onResolved).toHaveBeenCalled();
  });

  it("confirms 'this is me' as SAME_PATIENT", async () => {
    const { api, calls } = apiStub({ "/resolve": { ...view, resolution: "SAME_PATIENT" }, "/link-requests/tok": view });
    render(<AccountLinkRequest locale="en" token="tok" api={api} onResolved={() => {}} />);
    fireEvent.click(await screen.findByRole("radio", { name: /yes, this is me/i }));
    fireEvent.click(screen.getByRole("button", { name: /confirm/i }));
    await waitFor(() => expect(screen.getByText(/now belongs to your profile/i)).toBeTruthy());
    expect(JSON.parse(String(calls.find(c => c.path.endsWith("/resolve"))?.init?.body))).toEqual({ resolution: "SAME_PATIENT", relationship: null });
  });

  it("tells a different account to sign in with the address that received the email", async () => {
    const { api } = apiStub({ "/link-requests/tok": new Error("Please sign in with the account that received this email") });
    render(<AccountLinkRequest locale="en" token="tok" api={api} onResolved={() => {}} />);
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(screen.getByText(/sign in with the account that received this email/i)).toBeTruthy();
    expect(screen.queryByRole("radio")).toBeNull();
  });
});
