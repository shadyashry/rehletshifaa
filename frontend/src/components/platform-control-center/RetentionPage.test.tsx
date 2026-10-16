import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

import { getDictionary } from "@/lib/dictionary";
import type { Locale } from "@/lib/i18n";
import { ERASED_NAME, patientNameLabel } from "@/lib/portal-labels";
import { Retention, policyState, type ErasurePreview, type Policy, type PurgeLog } from "./RetentionPage";
import type { AdminApi } from "./admin-api";
import { ControlCenterError } from "./cc-ui";

/** P1-7 (E-03): Compliance and Care Coordination Managers read retention; only the manager erases a person (fresh sign-in). */
const copyOf = (locale: Locale) => { const w = getDictionary(locale).portalWork; return { ...w.retention, days: w.plural.retentionDays }; };
const AUDITOR = ["RETENTION_READ"];
const MANAGER = ["RETENTION_READ", "SUBJECT_ERASE"];
const can = (held: string[]) => (p: string) => held.includes(p);

const policies: Policy[] = [
  { recordClass: "DRAFT_INTAKE", retentionDays: 7, anchor: "CREATED", legalHold: false, enforced: true, basis: "Design 7.13: abandoned drafts after 7 days",
    lastPurgedAt: "2026-10-15T01:15:00Z", tables: ["medical_cases", "case_documents"] },
  { recordClass: "INTAKE_CONVERSATION", retentionDays: 90, anchor: "CLOSED", legalHold: false, enforced: false, basis: "P1-7: 90 days after close", tables: ["intake_conversations"] },
  { recordClass: "LEGAL_RECORD", retentionDays: null, anchor: "NONE", legalHold: true, enforced: false, basis: "Never purged", tables: ["audit_events", "retention_purges"] },
  { recordClass: "PERSONAL_IDENTITY", retentionDays: null, anchor: "CASE_CLOSED", legalHold: false, enforced: false, basis: "Term with counsel", tables: ["patient_profiles"] },
];
const log: PurgeLog = {
  from: "2026-09-16T00:00:00Z", to: "2026-10-16T00:00:00Z", truncated: true,
  totals: [
    { recordClass: "DRAFT_INTAKE", purges: 3, rowsAffected: 21, filesDeleted: 4, bytesDeleted: 2_621_440, lastPurgedAt: "2026-10-15T01:15:00Z" },
    { recordClass: "TRANSPORT_LOG", purges: 0, rowsAffected: 0, filesDeleted: 0, bytesDeleted: 0 },
  ],
  purges: [
    { id: "p2", recordClass: "PERSONAL_IDENTITY", subjectType: "PATIENT", subjectId: "pt1", cause: "ERASURE_REQUEST", rowsAffected: 9, filesDeleted: 0, bytesDeleted: 0,
      actor: "kc-manager", requestReference: "Email to support, 14 October 2026", purgedAt: "2026-10-15T10:00:00Z" },
    { id: "p1", recordClass: "DRAFT_INTAKE", subjectType: "DRAFT_CASE", subjectId: "c1", caseNumber: "RS-2026-000041", cause: "SCHEDULE", policyDays: 7,
      rowsAffected: 7, filesDeleted: 2, bytesDeleted: 1_048_576, actor: "SYSTEM", purgedAt: "2026-10-15T01:15:00Z" },
  ],
};
const clear: ErasurePreview = {
  patientId: "pt1", hasAccount: true, blockers: [],
  cases: [{ caseNumber: "RS-2026-000050", status: "CLOSED", draft: false, purged: false }, { caseNumber: "RS-2026-000051", status: "DRAFT", draft: true, purged: false }],
};

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

describe("Control Center › Retention", () => {
  afterEach(cleanup);

  it("words each policy: removed nightly, set but not removed yet, on legal hold, kept without an end date", async () => {
    const { api } = fakeApi({ "/compliance/retention/policies": policies });
    render(<Retention locale="en" copy={copyOf("en")} api={api} can={can(AUDITOR)} />);
    expect(screen.getAllByRole("tab").map((t) => t.textContent)).toEqual(["Policies", "Purge log"]);
    const draft = (await screen.findByText("Unsent case drafts")).closest("li")!;
    expect(within(draft).getByText("7 days")).toBeVisible();
    expect(within(draft).getByText("from when it was started")).toBeVisible();
    expect(within(draft).getByText("Removed nightly")).toBeVisible();
    const conversation = screen.getByText("WhatsApp intake conversations").closest("li")!;
    expect(within(conversation).getByText("Not removed yet")).toBeVisible();
    expect(within(conversation).getByText("The period is set; the nightly removal for this record is not built yet.")).toBeVisible();
    const legal = screen.getByText("Legal and financial records").closest("li")!;
    expect(within(legal).getByText("Never removed")).toBeVisible();
    expect(within(legal).getByText("On legal hold")).toBeVisible();
    const identity = screen.getByText("Personal identity").closest("li")!;
    expect(within(identity).getByText("No end date set")).toBeVisible();
    expect(within(identity).getByText("Kept")).toBeVisible();
    // The tables and the internal basis sit in a disclosure, the basis marked as English.
    fireEvent.click(within(legal).getByText("Where it is stored (2)"));
    expect(within(legal).getByText("retention_purges")).toBeVisible();
    expect(within(legal).getByText("Never purged")).toHaveAttribute("lang", "en");
  });

  it("shows the purge log: totals for classes with removals, rows as sent, the draft number, the request reference and the cap", async () => {
    const { api, calls } = fakeApi({ "/compliance/retention/purges": log });
    render(<Retention locale="en" copy={copyOf("en")} api={api} can={can(AUDITOR)} query={{ tab: "purges" }} />);
    const totals = await screen.findByRole("table");
    expect(within(totals).getAllByRole("row")).toHaveLength(2);
    expect(within(totals).getByRole("rowheader", { name: "Unsent case drafts" })).toBeVisible();
    expect(within(totals).getByText("2.5 MB")).toBeVisible();
    const rows = screen.getAllByRole("listitem").filter((li) => li.closest("ul")?.classList.contains("cc-list") && !li.classList.contains("cc-list-head"));
    expect(rows[0]).toHaveTextContent("A person, on their request");
    expect(rows[0]).toHaveTextContent("Request: ⁨Email to support, 14 October 2026⁩");
    expect(rows[0]).toHaveTextContent("Erasure request");
    expect(rows[0]).toHaveTextContent("Care Coordination Manager");
    expect(rows[1]).toHaveTextContent("Unsent draft ⁦RS-2026-000041⁩");
    expect(rows[1]).toHaveTextContent("Nightly clean-up");
    expect(rows[1]).toHaveTextContent("after 7 days");
    expect(rows[1]).toHaveTextContent("The platform");
    expect(screen.getByText("Showing the newest 2. Narrow the period or choose a record to see the rest.")).toBeVisible();

    fireEvent.change(screen.getByRole("combobox", { name: "Record" }), { target: { value: "DRAFT_INTAKE" } });
    fireEvent.change(screen.getByLabelText("From"), { target: { value: "2026-10-01" } });
    fireEvent.change(screen.getByLabelText("To"), { target: { value: "2026-10-10" } });
    await waitFor(() => expect(calls.at(-1)!.path).toMatch(/recordClass=DRAFT_INTAKE/));
    const query = new URLSearchParams(calls.at(-1)!.path.split("?")[1]);
    // The end day counts whole: `to` is the start of the next day.
    expect(new Date(query.get("to")!).getTime() - new Date(query.get("from")!).getTime()).toBe(10 * 24 * 3600 * 1000);
  });

  it("words the blockers as what to do first and offers no erasure while one holds", async () => {
    const { api, calls } = fakeApi({
      "/compliance/retention/erasures/preview": { ...clear, blockers: ["ERASURE_CASE_ACTIVE", "ERASURE_INCIDENT_OPEN"], cases: [{ caseNumber: "RS-2026-000050", status: "TREATMENT_IN_PROGRESS", draft: false, purged: false }] },
    });
    render(<Retention locale="en" copy={copyOf("en")} api={api} can={can(MANAGER)} query={{ tab: "erase" }} />);
    fireEvent.change(screen.getByRole("textbox", { name: /Case number/ }), { target: { value: " rs-2026-000050 " } });
    fireEvent.click(screen.getByRole("button", { name: "Show what would be erased" }));
    expect(await screen.findByText("This person cannot be erased yet")).toBeVisible();
    expect(calls[0].path).toBe("/compliance/retention/erasures/preview?caseNumber=RS-2026-000050");
    expect(screen.getByText("A case is still in care. Close or cancel it with the coordinator first.")).toBeVisible();
    expect(screen.getByText("An incident on one of their cases is not resolved. Resolve it in Incidents first.")).toBeVisible();
    expect(screen.getByText(/Treatment in progress/)).toBeVisible();
    expect(screen.queryByRole("button", { name: "Erase this person…" })).toBeNull();
    expect(screen.queryByRole("textbox", { name: /Request reference/ })).toBeNull();
  });

  it("erases a person: preview, a required reference, the irreversible confirmation, the result and the log", async () => {
    const result = { purgeId: "p9", patientId: "pt1", erasedAt: "2026-10-16T09:00:00Z", casesKept: 1, draftsPurged: 1, rowsAffected: 14, filesDeleted: 2, accountRemovalQueued: true };
    const { api, calls } = fakeApi({
      "/compliance/retention/erasures/preview": clear,
      "POST /compliance/retention/erasures": result,
      "/compliance/retention/purges": { ...log, truncated: false },
    });
    render(<Retention locale="en" copy={copyOf("en")} api={api} can={can(MANAGER)} query={{ tab: "erase", case: "RS-2026-000050" }} />);
    expect(await screen.findByRole("heading", { name: "The person behind ⁦RS-2026-000050⁩" })).toHaveFocus();
    expect(screen.getByText(/Sent case: kept under a pseudonym; the medical record stays/)).toBeVisible();
    expect(screen.getByText("Unsent draft: removed completely")).toBeVisible();
    expect(screen.getByText("Their sign-in account will be removed.")).toBeVisible();
    // One primary action on the step: looking up again is secondary once a case is shown.
    expect(screen.getByRole("button", { name: "Show what would be erased" })).toHaveClass("cc-secondary");
    fireEvent.click(screen.getByRole("button", { name: "Erase this person…" }));
    expect(screen.getByText("Write where and when the person asked.")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Erase permanently" })).toBeNull();
    fireEvent.change(screen.getByRole("textbox", { name: /Request reference/ }), { target: { value: "Email to support, 14 October 2026" } });
    fireEvent.click(screen.getByRole("button", { name: "Erase this person…" }));
    expect(screen.getByText("This cannot be undone.")).toBeVisible();
    expect(screen.getByText(/This needs a recent sign-in/)).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Erase permanently" }));
    expect(await screen.findByRole("heading", { name: "The person is erased" })).toBeVisible();
    expect(calls.find((c) => c.method === "POST")?.body).toEqual({ caseNumber: "RS-2026-000050", reference: "Email to support, 14 October 2026" });
    expect(screen.getByText("Removal queued")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "See it in the purge log" }));
    await waitFor(() => expect(calls.at(-1)!.path).toBe("/compliance/retention/purges?recordClass=PERSONAL_IDENTITY"));
    expect(screen.getByRole("tab", { name: "Purge log" })).toHaveAttribute("aria-selected", "true");
  });

  it("words refusals by code: an unknown case, and a blocker that arose since the preview", async () => {
    const { api } = fakeApi({
      "/compliance/retention/erasures/preview": (() => { let n = 0; return () => (n++ === 0 ? new ControlCenterError("Case was not found", "CASE_NOT_FOUND", 404) : clear); })(),
      "POST /compliance/retention/erasures": new ControlCenterError("This person cannot be erased now", "ERASURE_CONVERSATION_OPEN", 409),
    });
    render(<Retention locale="en" copy={copyOf("en")} api={api} can={can(MANAGER)} query={{ tab: "erase" }} />);
    fireEvent.change(screen.getByRole("textbox", { name: /Case number/ }), { target: { value: "RS-2026-999999" } });
    fireEvent.click(screen.getByRole("button", { name: "Show what would be erased" }));
    expect(await screen.findByText("No case has this number. Check it and try again.")).toBeVisible();
    fireEvent.change(screen.getByRole("textbox", { name: /Case number/ }), { target: { value: "RS-2026-000050" } });
    fireEvent.click(screen.getByRole("button", { name: "Show what would be erased" }));
    fireEvent.change(await screen.findByRole("textbox", { name: /Request reference/ }), { target: { value: "Phone call, 15 October 2026" } });
    fireEvent.click(screen.getByRole("button", { name: "Erase this person…" }));
    fireEvent.click(screen.getByRole("button", { name: "Erase permanently" }));
    expect(await screen.findByText("A WhatsApp intake conversation is still open, so nothing was changed.")).toBeVisible();
    expect(screen.getByText("ERASURE_CONVERSATION_OPEN")).toBeVisible();
  });

  it("reads in Arabic, with the day counts in Arabic plural forms", async () => {
    const { api } = fakeApi({ "/compliance/retention/policies": policies });
    render(<Retention locale="ar" copy={copyOf("ar")} api={api} can={can(MANAGER)} />);
    expect(screen.getAllByRole("tab").map((t) => t.textContent)).toEqual(["السياسات", "سجل الإزالة", "محو بيانات شخص"]);
    const draft = (await screen.findByText("مسودات حالات لم تُرسل")).closest("li")!;
    expect(within(draft).getByText("7 أيام")).toBeVisible();
    expect(within(draft).getByText("يُزال ليلًا")).toBeVisible();
  });

  it("classifies a policy's clean-up state, and staff screens word an erased person's name", () => {
    expect(policyState(policies[0])).toBe("NIGHTLY");
    expect(policyState(policies[1])).toBe("NOT_YET");
    expect(policyState(policies[2])).toBe("HOLD");
    expect(policyState(policies[3])).toBe("KEPT");
    expect(patientNameLabel(ERASED_NAME, getDictionary("en").portalWork)).toBe("Erased person");
    expect(patientNameLabel(ERASED_NAME, getDictionary("ar").portalWork)).toBe("شخص مُحيت بياناته");
    expect(patientNameLabel("Amira Hassan", getDictionary("en").portalWork)).toBe("Amira Hassan");
  });
});
