import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const auth = { user: { access_token: "t", profile: { sub: "manager-1" } } };
vi.mock("@/components/AuthProvider", () => ({ useAuth: () => auth }));

import { getDictionary } from "@/lib/dictionary";
import { Incidents, type Incident } from "./IncidentsPage";
import type { AdminApi } from "./admin-api";

/** P1-13 (A-06): managers work incidents; Compliance reads the same list and detail with no control. */
const copy = getDictionary("en").portalWork.safety.incidents;
const incident: Incident = {
  id: "i1", caseId: "c1", caseNumber: "RS-2026-000123", type: "ADVERSE_EVENT", severity: "HIGH", status: "OPEN", source: "PATIENT",
  caseStage: "FOLLOW_UP", summary: "Swelling since Tuesday", raisedAt: "2026-10-12T09:00:00Z", ownerSubject: "manager-1",
};

function fakeApi(routes: Record<string, unknown>) {
  const calls: { path: string; method: string; body?: unknown }[] = [];
  const api = (async (path: string, init?: { method?: string; body?: unknown }) => {
    const method = init?.method ?? "GET";
    calls.push({ path, method, body: init?.body });
    const key = `${method} ${path.split("?")[0]}`;
    return routes[key] ?? routes[path.split("?")[0]];
  }) as AdminApi;
  return { api, calls };
}

describe("Incidents", () => {
  afterEach(cleanup);

  it("lists incidents with severity and owner in words, and filters by status", async () => {
    const { api, calls } = fakeApi({ "/incidents": [incident, { ...incident, id: "i2", caseNumber: "RS-2026-000124", ownerSubject: null, severity: "CRITICAL" }] });
    render(<Incidents locale="en" copy={copy} api={api} canManage />);
    expect(await screen.findByText("RS-2026-000123")).toBeTruthy();
    expect(screen.getByText("You")).toBeTruthy();
    expect(screen.getByText("Not assigned")).toBeTruthy();
    expect(screen.getByText("Critical")).toBeTruthy();
    fireEvent.change(screen.getByRole("combobox", { name: "Status" }), { target: { value: "OPEN" } });
    await waitFor(() => expect(calls.some((c) => c.path === "/incidents?status=OPEN")).toBe(true));
  });

  it("lets the owner start the review and resolve with an outcome and a note", async () => {
    const { api, calls } = fakeApi({
      "/incidents": [incident], "/incidents/i1": incident,
      "POST /incidents/i1/review": { ...incident, status: "UNDER_REVIEW" },
      "POST /incidents/i1/resolve": { ...incident, status: "RESOLVED", resolution: "EXPLAINED_TO_PATIENT", resolutionNote: "Called the family", resolvedAt: "2026-10-13T09:00:00Z" },
    });
    render(<Incidents locale="en" copy={copy} api={api} canManage />);
    fireEvent.click(await screen.findByRole("button", { name: "Open incident RS-2026-000123" }));
    expect(await screen.findByText("Swelling since Tuesday")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Start review" }));
    await waitFor(() => expect(calls.some((c) => c.method === "POST" && c.path === "/incidents/i1/review")).toBe(true));
    fireEvent.click(await screen.findByRole("button", { name: "Resolve incident" }));
    expect(screen.getByText("Choose the outcome.")).toBeTruthy();
    expect(screen.getByText("Write what was done.")).toBeTruthy();
    fireEvent.change(screen.getByRole("combobox", { name: /Outcome/ }), { target: { value: "EXPLAINED_TO_PATIENT" } });
    fireEvent.change(screen.getByRole("textbox", { name: /Resolution note/ }), { target: { value: "Called the family" } });
    fireEvent.click(screen.getByRole("button", { name: "Resolve incident" }));
    await waitFor(() => expect(calls.find((c) => c.path === "/incidents/i1/resolve")?.body).toEqual({ resolution: "EXPLAINED_TO_PATIENT", note: "Called the family" }));
    expect(await screen.findByText("Explained to the patient")).toBeTruthy();
  });

  it("offers another manager's incident to be taken, not worked", async () => {
    const other = { ...incident, ownerSubject: "manager-2" };
    const { api, calls } = fakeApi({ "/incidents": [other], "/incidents/i1": other, "POST /incidents/i1/assign": incident });
    render(<Incidents locale="en" copy={copy} api={api} canManage />);
    fireEvent.click(await screen.findByRole("button", { name: "Open incident RS-2026-000123" }));
    expect(await screen.findByText("Another manager")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Resolve incident" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Take this incident" }));
    await waitFor(() => expect(calls.find((c) => c.path === "/incidents/i1/assign")?.body).toEqual({ ownerSubject: "manager-1" }));
  });

  it("is read-only for Compliance", async () => {
    const { api } = fakeApi({ "/incidents": [incident], "/incidents/i1": incident });
    render(<Incidents locale="en" copy={copy} api={api} canManage={false} />);
    expect(await screen.findByText(copy.readOnly)).toBeTruthy();
    expect(screen.queryByRole("checkbox", { name: "Only incidents I own" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Open incident RS-2026-000123" }));
    expect(await screen.findByText("Swelling since Tuesday")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Start review" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Resolve incident" })).toBeNull();
  });
});
