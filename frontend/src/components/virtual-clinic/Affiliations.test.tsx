import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

import { getDictionary } from "@/lib/dictionary";
import { Affiliations, type AffiliationCall } from "./Affiliations";
import type { AffiliationsView, Declaration } from "./virtual-clinic-model";

/** P1-19 (D-H): the Consultant's yearly affiliation declaration on their Virtual Clinic. */
const directory = [
  { id: "f1", name: "Nile Heart Hospital", city: "Cairo", kind: "HOSPITAL", accreditationStatus: "CURRENT", packages: [] },
  { id: "f2", name: "Delta Day Surgery", city: "Tanta", kind: "DAY_SURGERY_CENTRE", accreditationStatus: "NONE", packages: [] },
];
const current: Declaration = {
  id: "d2", practitionerId: "p1", declaredAt: "2026-10-01T09:00:00Z", validUntil: "2027-10-01T09:00:00Z", current: true, attestationVersion: "affiliation-attestation-2026-10",
  lines: [{ facilityId: "f1", facilityName: "Nile Heart Hospital", kind: "PRIVILEGES" }, { facilityId: "f1", facilityName: "Nile Heart Hospital", kind: "FINANCIAL_INTEREST", note: "5% shareholding" }],
};
const none: AffiliationsView = { practitionerId: "p1", declarationCurrent: false, renewBy: null, attestationVersion: "affiliation-attestation-2026-10", current: null, history: [], flags: [] };

function fakeCall(routes: Record<string, unknown | ((body: unknown) => unknown)>) {
  const calls: { path: string; method: string; body?: unknown }[] = [];
  const call = (async (path: string, method = "GET", body?: unknown) => {
    calls.push({ path, method, body });
    const route = routes[`${method} ${path}`] ?? routes[path];
    const value = typeof route === "function" ? (route as (b: unknown) => unknown)(body) : route;
    if (value instanceof Error) throw value;
    return value;
  }) as AffiliationCall;
  return { call, calls };
}

describe("Virtual Clinic › Affiliations", () => {
  afterEach(cleanup);

  it("says plainly that without a current declaration no new case comes, then files one with the attestation", async () => {
    const onFiled = vi.fn();
    const filed: AffiliationsView = { ...none, declarationCurrent: true, renewBy: "2027-10-16T09:00:00Z", current: { ...current, id: "d3", lines: [{ facilityId: "f2", facilityName: "Delta Day Surgery", kind: "NONE_DECLARED" }] } };
    const { call, calls } = fakeCall({ "/clinics/p1/affiliations": none, "/facilities/directory": directory, "POST /clinics/p1/affiliations": filed });
    render(<Affiliations locale="en" copy={getDictionary("en").portalWork.affiliations} practitionerId="p1" call={call} onFiled={onFiled} />);
    expect(await screen.findByText("No current declaration: you cannot receive new cases.")).toBeVisible();
    expect(screen.getByText(/filing now declares that you use no facility/)).toBeVisible();

    fireEvent.change(screen.getByRole("combobox", { name: "Facility" }), { target: { value: "f2" } });
    fireEvent.click(screen.getByRole("button", { name: "Add facility" }));
    fireEvent.click(screen.getByRole("button", { name: "File declaration" }));
    expect(screen.getByText("Choose at least one relationship for each facility.")).toBeVisible();
    expect(screen.getByText("Confirm the declaration to file it.")).toBeVisible();
    expect(calls.some((c) => c.method === "POST")).toBe(false);

    // "No relationship" stands alone.
    fireEvent.click(screen.getByRole("checkbox", { name: "Admitting or practising privileges" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "I use it, with no relationship" }));
    expect(screen.getByRole("checkbox", { name: "Admitting or practising privileges" })).not.toBeChecked();
    fireEvent.click(screen.getByRole("checkbox", { name: /I declare that this list is complete and true/ }));
    fireEvent.click(screen.getByRole("button", { name: "File declaration" }));
    await waitFor(() => expect(calls.find((c) => c.method === "POST")?.body).toEqual({
      lines: [{ facilityId: "f2", kind: "NONE_DECLARED" }], attested: true, attestationVersion: "affiliation-attestation-2026-10",
    }));
    expect(await screen.findByText("Your declaration is filed. Compliance will review it.")).toBeVisible();
    expect(screen.getByText("Current declaration")).toBeVisible();
    expect(onFiled).toHaveBeenCalled();
  });

  it("asks for the note on a financial interest and words a refusal by its code", async () => {
    const { call, calls } = fakeCall({ "/clinics/p1/affiliations": none, "/facilities/directory": directory,
      "POST /clinics/p1/affiliations": Object.assign(new Error("Attestation changed"), { code: "AFFILIATION_ATTESTATION_OUTDATED" }) });
    render(<Affiliations locale="en" copy={getDictionary("en").portalWork.affiliations} practitionerId="p1" call={call} />);
    fireEvent.change(await screen.findByRole("combobox", { name: "Facility" }), { target: { value: "f1" } });
    fireEvent.click(screen.getByRole("button", { name: "Add facility" }));
    fireEvent.click(screen.getByRole("checkbox", { name: /A financial interest/ }));
    fireEvent.click(screen.getByRole("checkbox", { name: /I declare that this list is complete and true/ }));
    fireEvent.click(screen.getByRole("button", { name: "File declaration" }));
    expect(screen.getByText("Describe the financial interest.", { selector: "span" })).toBeVisible();
    fireEvent.change(screen.getByRole("textbox", { name: /Describe the financial interest/ }), { target: { value: "5% shareholding" } });
    fireEvent.click(screen.getByRole("button", { name: "File declaration" }));
    await waitFor(() => expect(calls.find((c) => c.method === "POST")?.body).toMatchObject({ lines: [{ facilityId: "f1", kind: "FINANCIAL_INTEREST", note: "5% shareholding" }] }));
    expect(await screen.findByRole("alert")).toHaveTextContent("The declaration's wording has changed. Reload the page and confirm it again.");
  });

  it("shows the current declaration, starts the renewal from it, and lists the facilities used before they were declared", async () => {
    const view: AffiliationsView = { ...none, declarationCurrent: true, renewBy: current.validUntil, current,
      history: [{ ...current, id: "d1", current: false, declaredAt: "2025-10-01T09:00:00Z", supersededAt: "2026-10-01T09:00:00Z", lines: [] }],
      flags: [{ id: "fl1", caseId: "c1", caseNumber: "RS-2026-000123", practitionerId: "p1", facilityId: "f2", facilityName: "Delta Day Surgery", code: "UNDECLARED_FACILITY", raisedAt: "2026-10-10T09:00:00Z" }] };
    const { call } = fakeCall({ "/clinics/p1/affiliations": view, "/facilities/directory": directory });
    render(<Affiliations locale="en" copy={getDictionary("en").portalWork.affiliations} practitionerId="p1" call={call} />);
    expect(await screen.findByText("Current declaration")).toBeVisible();
    expect(screen.getAllByText(/Privileges · Financial interest/)[0]).toBeVisible();
    expect(screen.getByRole("heading", { name: "File a new declaration" })).toBeVisible();
    expect(screen.getByRole("checkbox", { name: "Admitting or practising privileges" })).toBeChecked();
    expect(screen.getByRole("textbox", { name: /Describe the financial interest/ })).toHaveValue("5% shareholding");
    expect(screen.getByRole("heading", { name: "Facilities used before they were declared" })).toBeVisible();
    expect(screen.getByText("RS-2026-000123")).toBeVisible();
    expect(screen.getByText("Not declared yet")).toBeVisible();
    expect(screen.getByText("You declared that you use no facility and have no relationship with any.")).toBeVisible();
  });

  it("speaks Arabic", async () => {
    const { call } = fakeCall({ "/clinics/p1/affiliations": none, "/facilities/directory": directory });
    render(<Affiliations locale="ar" copy={getDictionary("ar").portalWork.affiliations} practitionerId="p1" call={call} />);
    expect(await screen.findByText("لا يوجد تصريح ساري: لا يمكنك استقبال حالات جديدة.")).toBeVisible();
    expect(screen.getByRole("button", { name: "تقديم التصريح" })).toBeVisible();
  });
});
