import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

import { getDictionary } from "@/lib/dictionary";
import type { Locale } from "@/lib/i18n";
import { Compliance, type Scorecard, type SampleView } from "./CompliancePage";
import type { AdminApi } from "./admin-api";
import { ControlCenterError } from "./cc-ui";

/** P1-19 (design §7): Compliance reviews declarations and samples; Consultant Operations read declarations, flags and scorecards. */
const copyOf = (locale: Locale) => { const w = getDictionary(locale).portalWork; return { ...w.compliance, kinds: w.affiliations.kindsShort }; };
const COMPLIANCE = ["AFFILIATION_READ", "SCORECARD_READ", "AUDIT_SAMPLE_READ", "COMPLIANCE_REVIEW"];
const CONSULTANT_OPS = ["AFFILIATION_READ", "SCORECARD_READ"];
const can = (held: string[]) => (p: string) => held.includes(p);

const declaration = {
  id: "d1", practitionerId: "p1", consultantName: "Dr Ahmed Saleh", declaredAt: "2026-10-01T09:00:00Z", validUntil: "2027-10-01T09:00:00Z", current: true,
  attestationVersion: "affiliation-attestation-2026-10", reviewStatus: "PENDING",
  lines: [{ facilityId: "f1", facilityName: "Nile Heart Hospital", kind: "FINANCIAL_INTEREST", note: "5% shareholding" }],
};
const cleared = { ...declaration, id: "d0", consultantName: "Dr Mona Fathy", reviewStatus: "CLEARED", reviewedAt: "2026-10-05T09:00:00Z" };

function fakeApi(routes: Record<string, unknown | ((body: unknown) => unknown)>) {
  const calls: { path: string; method: string; body?: unknown }[] = [];
  const api = (async (path: string, init?: { method?: string; body?: unknown }) => {
    const method = init?.method ?? "GET";
    calls.push({ path, method, body: init?.body });
    const route = routes[`${method} ${path}`] ?? routes[`${method} ${path.split("?")[0]}`] ?? routes[path] ?? routes[path.split("?")[0]];
    const value = typeof route === "function" ? (route as (b: unknown) => unknown)(init?.body) : route;
    if (value instanceof Error) throw value;
    return value;
  }) as AdminApi;
  return { api, calls };
}

describe("Control Center › Compliance", () => {
  afterEach(cleanup);

  it("puts waiting declarations first and lets Compliance record a finding with a required note", async () => {
    const { api, calls } = fakeApi({
      "/compliance/affiliations/declarations": [cleared, declaration],
      "POST /compliance/affiliations/declarations/d1/review": { ...declaration, reviewStatus: "FINDING", reviewedAt: "2026-10-16T09:00:00Z", reviewNote: "Shareholding not on the agreement" },
    });
    render(<Compliance locale="en" copy={copyOf("en")} api={api} can={can(COMPLIANCE)} />);
    const rows = await screen.findAllByRole("button", { name: /^Open .*'s declaration$/ });
    expect(rows[0]).toHaveAccessibleName("Open Dr Ahmed Saleh's declaration");
    expect(screen.getAllByRole("tab").map((t) => t.textContent)).toEqual(["Declarations", "Undeclared facilities", "Scorecards", "Audit samples"]);
    fireEvent.click(rows[0]);
    expect(await screen.findByText("Financial interest")).toBeVisible();
    expect(screen.getByText("5% shareholding")).toBeVisible();
    expect(screen.getByText("A review never changes whether the Consultant can receive cases.")).toBeVisible();
    fireEvent.click(screen.getByRole("radio", { name: /Finding: Consultant Operations follow it up/ }));
    fireEvent.click(screen.getByRole("button", { name: "Record review" }));
    expect(screen.getByText("Write what you found.")).toBeVisible();
    fireEvent.change(screen.getByRole("textbox", { name: /Note/ }), { target: { value: "Shareholding not on the agreement" } });
    fireEvent.click(screen.getByRole("button", { name: "Record review" }));
    await waitFor(() => expect(calls.find((c) => c.method === "POST")?.body).toEqual({ outcome: "FINDING", note: "Shareholding not on the agreement" }));
    expect(await screen.findByText("Shareholding not on the agreement")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Record review" })).toBeNull();
  });

  it("is read-only for Consultant Operations: no samples tab and no review form", async () => {
    const { api } = fakeApi({ "/compliance/affiliations/declarations": [declaration] });
    render(<Compliance locale="en" copy={copyOf("en")} api={api} can={can(CONSULTANT_OPS)} />);
    expect(screen.getByText("You can read this. Only Compliance records reviews.")).toBeVisible();
    expect(screen.getAllByRole("tab").map((t) => t.textContent)).toEqual(["Declarations", "Undeclared facilities", "Scorecards"]);
    fireEvent.click(await screen.findByRole("button", { name: "Open Dr Ahmed Saleh's declaration" }));
    expect(await screen.findByText("Nile Heart Hospital")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Record review" })).toBeNull();
  });

  it("lists undeclared-facility flags, open ones by default", async () => {
    const flag = { id: "fl1", caseId: "c1", caseNumber: "RS-2026-000123", practitionerId: "p1", consultantName: "Dr Ahmed Saleh", facilityId: "f2", facilityName: "Delta Day Surgery", code: "UNDECLARED_FACILITY", raisedAt: "2026-10-10T09:00:00Z" };
    const { api, calls } = fakeApi({ "/compliance/affiliations/flags": [flag], "/compliance/affiliations/declarations": [] });
    render(<Compliance locale="en" copy={copyOf("en")} api={api} can={can(COMPLIANCE)} />);
    fireEvent.click(screen.getByRole("tab", { name: "Undeclared facilities" }));
    expect(await screen.findByText("RS-2026-000123")).toBeVisible();
    expect(screen.getByText("Delta Day Surgery")).toBeVisible();
    fireEvent.click(screen.getByRole("checkbox", { name: "Only open flags" }));
    await waitFor(() => expect(calls.some((c) => c.path === "/compliance/affiliations/flags?openOnly=false")).toBe(true));
  });

  it("shows a scorecard as counts and averages, explains a withheld average and the answers given for the patient", async () => {
    const card: Scorecard = {
      subject: "CONSULTANT", subjectId: "p1", name: "Dr Ahmed Saleh", from: "2026-07-18", to: "2026-10-16", cases: 3, smallCohort: true,
      quotes: { finalQuotesAccepted: 3, comparable: 2, averageFinalToEstimateMaximum: 0.9512, aboveEstimateMaximum: 0 },
      changeOrders: { casesWithChangeOrders: 1, changeOrders: 1, emergency: 0 },
      reconciliation: { reconciled: 3, withVariance: 1, disputed: 0, unapprovedExtraCases: 1, unapprovedExtraLines: 2, unapprovedExtrasEgp: 4500, billingErrorLines: 0 },
      safety: { complicationsReported: 1, adverseEventCases: 0, reopenedCases: 0, patientConcerns: 1, chargeDisputes: 1 },
      followUp: { contactsHeld: 4, contactsMissed: 1, completionRate: 0.8 },
      outcomes: [{ point: "D30", asked: 3, answered: 3, byRepresentative: 1, complications: 1, suppressed: true, averagePain: null, averageFunction: null, averageSatisfaction: null }],
      undeclaredFacilityFlags: 1, packagesSuspended: null, patientRating: "NOT_COLLECTED",
    };
    const { api, calls } = fakeApi({ "/compliance/affiliations/declarations": [], "/admin/practitioners": [{ id: "p1", displayName: "Dr Ahmed Saleh" }], "/compliance/scorecards/consultants/p1": card });
    render(<Compliance locale="en" copy={copyOf("en")} api={api} can={can(CONSULTANT_OPS)} />);
    fireEvent.click(screen.getByRole("tab", { name: "Scorecards" }));
    const select = await screen.findByRole("combobox", { name: "Consultant" });
    await waitFor(() => expect(within(select).getAllByRole("option")).toHaveLength(2));
    fireEvent.change(select, { target: { value: "p1" } });
    fireEvent.change(screen.getByLabelText("From"), { target: { value: "2026-07-18" } });
    fireEvent.click(screen.getByRole("button", { name: "Show scorecard" }));
    await waitFor(() => expect(calls.some((c) => c.path === "/compliance/scorecards/consultants/p1?from=2026-07-18")).toBe(true));
    expect(await screen.findByText("Fewer than 5 cases: too few to compare with others.")).toBeVisible();
    expect(screen.getByText("95.1%")).toBeVisible();
    expect(screen.getByText("1 answered by someone for the patient")).toBeVisible();
    expect(screen.getByText("Averages withheld: fewer than 5 answers, too few to keep anyone anonymous.")).toBeVisible();
    expect(screen.queryByText("Pain")).toBeNull();
    expect(screen.getByText("Not collected yet: the closing review is a message.")).toBeVisible();
    expect(screen.queryByText("Packages suspended now")).toBeNull();
  });

  it("draws a sample on demand and records a finding on a sampled case, with its mismatches in words", async () => {
    const sample: SampleView = {
      sample: { id: "s1", month: "2026-09", kind: "ON_DEMAND", requestedSize: 3, candidates: 4, cases: 1, pending: 1, drawnAt: "2026-10-16T09:00:00Z" },
      cases: [{ caseId: "c1", caseNumber: "RS-2026-000123", closedAt: "2026-09-20T09:00:00Z", consultantName: "Dr Ahmed Saleh", facilityName: "Nile Heart Hospital",
        record: { statementNumber: "ST-2026-0007", statementTotalChargedEgp: "120000.00" }, mismatches: ["FINAL_INVOICE_MISSING", "UNAPPROVED_EXTRA"], reviewStatus: "PENDING" }],
    };
    const reviewed: SampleView = { ...sample, cases: [{ ...sample.cases[0], reviewStatus: "FINDING", reviewedAt: "2026-10-16T10:00:00Z", findingNote: "Extra of EGP 4,500 billed", incidentId: "i9" }] };
    const { api, calls } = fakeApi({ "/compliance/affiliations/declarations": [], "/compliance/audit-samples": [], "POST /compliance/audit-samples": sample,
      "POST /compliance/audit-samples/s1/cases/c1/review": reviewed });
    render(<Compliance locale="en" copy={copyOf("en")} api={api} can={can(COMPLIANCE)} />);
    fireEvent.click(screen.getByRole("tab", { name: "Audit samples" }));
    expect(await screen.findByText("No samples yet.")).toBeVisible();
    fireEvent.change(screen.getByLabelText("Month"), { target: { value: "2026-09" } });
    fireEvent.change(screen.getByLabelText("Cases"), { target: { value: "3" } });
    fireEvent.click(screen.getByRole("button", { name: "Draw sample" }));
    await waitFor(() => expect(calls.find((c) => c.path === "/compliance/audit-samples" && c.method === "POST")?.body).toEqual({ month: "2026-09", size: 3 }));
    expect(await screen.findByText("The hospital's final invoice is not on file.")).toBeVisible();
    expect(screen.getByText("The hospital billed an extra nobody approved.")).toBeVisible();
    expect(screen.getByText("ST-2026-0007")).toBeVisible();
    expect(screen.getByText(/EGP\s?120,000\.00/)).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Review RS-2026-000123" }));
    fireEvent.click(screen.getByRole("radio", { name: /Finding: it becomes an incident/ }));
    fireEvent.change(screen.getByRole("textbox", { name: /What was found/ }), { target: { value: "Extra of EGP 4,500 billed" } });
    fireEvent.click(screen.getByRole("button", { name: "Record review" }));
    await waitFor(() => expect(calls.find((c) => c.path.endsWith("/review"))?.body).toEqual({ outcome: "FINDING", note: "Extra of EGP 4,500 billed" }));
    expect(await screen.findByText("An incident was opened for this finding.")).toBeVisible();
  });

  it("words a compliance refusal in its own words with the support code", async () => {
    const { api } = fakeApi({ "/compliance/affiliations/declarations": [declaration],
      "POST /compliance/affiliations/declarations/d1/review": new ControlCenterError("already", "DECLARATION_ALREADY_REVIEWED", 409) });
    render(<Compliance locale="en" copy={copyOf("en")} api={api} can={can(COMPLIANCE)} />);
    fireEvent.click(await screen.findByRole("button", { name: "Open Dr Ahmed Saleh's declaration" }));
    fireEvent.click(await screen.findByRole("radio", { name: /Cleared: nothing to follow up/ }));
    fireEvent.click(screen.getByRole("button", { name: "Record review" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("This declaration was already reviewed.");
    expect(screen.getByText("DECLARATION_ALREADY_REVIEWED")).toBeVisible();
  });

  it("opens on the tab and filters in the link, and keeps the link in step", async () => {
    window.history.replaceState({}, "", "/en/portal/control-center/compliance?tab=declarations&review=PENDING");
    const { api, calls } = fakeApi({ "/compliance/affiliations/declarations": [declaration], "/compliance/affiliations/flags": [] });
    render(<Compliance locale="en" copy={copyOf("en")} api={api} can={can(COMPLIANCE)} query={{ tab: "declarations", review: "PENDING" }} />);
    await waitFor(() => expect(calls.some((c) => c.path === "/compliance/affiliations/declarations?reviewStatus=PENDING")).toBe(true));
    expect(screen.getByRole("combobox", { name: "Review" })).toHaveValue("PENDING");
    fireEvent.change(screen.getByRole("combobox", { name: "Review" }), { target: { value: "" } });
    expect(window.location.search).toBe("?tab=declarations");
    fireEvent.click(screen.getByRole("tab", { name: "Undeclared facilities" }));
    fireEvent.click(await screen.findByRole("checkbox", { name: "Only open flags" }));
    expect(new URLSearchParams(window.location.search).get("tab")).toBe("flags");
    expect(new URLSearchParams(window.location.search).get("flags")).toBe("all");
    window.history.replaceState({}, "", "/");
  });

  it("speaks Arabic", async () => {
    const { api } = fakeApi({ "/compliance/affiliations/declarations": [declaration] });
    render(<Compliance locale="ar" copy={copyOf("ar")} api={api} can={can(COMPLIANCE)} />);
    expect(await screen.findByText("بانتظار المراجعة")).toBeVisible();
    expect(screen.getByRole("tab", { name: "عينات التدقيق" })).toBeVisible();
  });
});
