import { describe, expect, it } from "vitest";

import { intlLocale } from "@/lib/i18n";
import en from "@/messages/en.json";
import ar from "@/messages/ar.json";

import { isStepItem } from "@/components/portal/CurrentAction";
import { careAreaLabel, coordinatorLabel, fillTemplate, plural, priorityLabel, tabKeyTarget, waitingLabel, waitingReasonText, workCopyText, workItemText } from "./portal-labels";

const keys = (value: unknown, prefix = ""): string[] =>
  value && typeof value === "object"
    ? Object.entries(value as Record<string, unknown>).flatMap(([key, child]) => keys(child, `${prefix}${key}.`))
    : [prefix.slice(0, -1)];

describe("portal copy parity", () => {
  it("has the same keys in English and Arabic (Arabic may add plural categories)", () => {
    for (const namespace of ["portalWork", "portalProposal", "secureLink"] as const) {
      const english = keys(en[namespace]).filter((key) => !key.startsWith("plural."));
      const arabic = keys(ar[namespace]).filter((key) => !key.startsWith("plural."));
      expect(arabic.sort()).toEqual(english.sort());
    }
    for (const form of Object.keys(en.portalWork.plural)) expect(Object.keys(ar.portalWork.plural[form as keyof typeof ar.portalWork.plural])).toContain("other");
  });
});

describe("portal labels", () => {
  it("counts in the locale's own plural forms", () => {
    expect(plural("en", 1, en.portalWork.plural.cases)).toBe("1 case");
    expect(plural("en", 3, en.portalWork.plural.cases)).toBe("3 cases");
    expect(plural("ar", 1, ar.portalWork.plural.cases)).toBe("حالة واحدة");
    // Western digits on Arabic pages (owner default until native review), for the few and many forms alike.
    expect(plural("ar", 3, ar.portalWork.plural.cases)).toBe("3 حالات");
    expect(plural("ar", 2, ar.portalWork.plural.services)).toBe("خدمتان");
    expect(plural("ar", 11, ar.portalWork.plural.services)).toBe("11 خدمة");
    expect(plural("en", 1, en.portalWork.plural.services)).toBe("1 service");
    expect(plural("ar", 11, ar.portalWork.plural.cases)).toBe("11 حالة");
    expect(plural("ar", 1250, ar.portalWork.plural.cases)).toMatch(/^1[,٬]250 حالة$/);
    expect(new Intl.DateTimeFormat(intlLocale("ar"), { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(new Date("2026-10-08T00:00:00Z"))).toMatch(/^8 .+ 2026$/);
    expect(plural("ar", 2, ar.portalWork.plural.cases)).toBe("حالتان");
    expect(plural("ar", 5, ar.portalWork.plural.cases)).toBe("5 حالات");
    expect(plural("ar", 11, ar.portalWork.plural.cases)).toBe("11 حالة");
  });

  it("says \"you\" only to the person really being waited on, and never shows the raw value", () => {
    const w = en.portalWork.waiting;
    expect(waitingLabel("CONSULTANT", w, { role: "doctor" })).toBe("you");
    expect(waitingLabel("CONSULTANT", w, { role: "coordinator" })).toBe("the Consultant");
    expect(waitingLabel("STAFF", w, { role: "coordinator", ownsCase: true })).toBe("you");
    expect(waitingLabel("STAFF", w, { role: "coordinator", ownsCase: false })).toBe("our team");
    expect(waitingLabel("STAFF", w, { role: "finance" })).toBe("our team");
    expect(waitingLabel("PATIENT", w, { role: "patient" })).toBe("you");
    expect(waitingLabel("SOMETHING_NEW", w)).toBe("another party");
    expect(waitingLabel("label", w)).toBe("another party");
  });

  it("follows the viewer's current action, so the header never contradicts it (QA #13, W-5, #11)", () => {
    const w = en.portalWork.waiting;
    const owner = { role: "coordinator", ownsCase: true };
    // #13: the owner waits for Finance — the stored value is our team, but the owner is not the one being waited on.
    expect(waitingLabel("STAFF", w, { ...owner, action: { code: "WAIT_INTERNAL_APPROVAL", kind: "WAIT" } })).toBe("internal sign-off");
    expect(waitingLabel("TRAVEL_TEAM", w, { ...owner, action: { code: "WAIT_OPERATIONS", kind: "WAIT" } })).toBe("Operations");
    // W-5: the coordinator owes the Arabic terms call while the stage still reads "patient decision".
    expect(waitingLabel("PATIENT", w, { ...owner, action: { code: "WORK_ITEM", kind: "FOCUS" } })).toBe("you");
    expect(waitingLabel("PATIENT", w, { ...owner, action: { code: "WAIT_PATIENT_DECISION", kind: "WAIT" } })).toBe("the patient");
    // Nothing for this viewer: never "you", whatever the stored value.
    expect(waitingLabel("STAFF", w, { ...owner, action: { code: "NONE", kind: "NONE" } })).toBe("our team");
    // A work item in My work is the viewer's own.
    expect(waitingLabel("STAFF", w, { role: "finance", holdsWork: true })).toBe("you");
    // #11: a Consultant reads our side as the care team.
    expect(waitingLabel("STAFF", w, { role: "doctor" })).toBe("the care team");
    expect(waitingLabel("STAFF", ar.portalWork.waiting, { role: "doctor" })).toBe("فريق الرعاية");
    expect(waitingLabel("CARE_TEAM", w)).toBe("another party");
  });

  it("moves tab focus with the reading direction", () => {
    expect(tabKeyTarget("ArrowRight", 0, 3, false)).toBe(1);
    expect(tabKeyTarget("ArrowLeft", 0, 3, true)).toBe(1);
    expect(tabKeyTarget("ArrowRight", 0, 3, true)).toBe(2);
    expect(tabKeyTarget("End", 0, 3, true)).toBe(2);
    expect(tabKeyTarget("Home", 2, 3, false)).toBe(0);
    expect(tabKeyTarget("Enter", 1, 3, false)).toBe(-1);
  });

  it("puts priorities and care areas into words", () => {
    expect(priorityLabel("NORMAL", en.portalWork.priority)).toBe("Normal");
    expect(priorityLabel("SOMETHING_NEW", en.portalWork.priority)).toBe("Priority not set");
    expect(careAreaLabel("cardiology", { cardiology: "Cardiology" })).toBe("Cardiology");
    expect(careAreaLabel("sleep-medicine", {})).toBe("Sleep medicine");
  });

  it("reads the coordinator from the viewer's side", () => {
    const copy = en.portalWork.queue;
    expect(coordinatorLabel({ coordinatorSubject: "me", coordinatorName: null }, "me", copy)).toBe("You");
    expect(coordinatorLabel({ coordinatorSubject: "other", coordinatorName: "Sara Ahmed" }, "me", copy)).toBe("Sara Ahmed");
    expect(coordinatorLabel({ coordinatorSubject: "other", coordinatorName: null }, "me", copy)).toBe("Coordinator (name not set)");
    expect(coordinatorLabel({ coordinatorSubject: null, coordinatorName: null }, "me", copy)).toBe("Unassigned");
  });
});

describe("workCopyText", () => {
  const iso = (value: string) => `\u2068${value}\u2069`;
  it("words a work item from its code in both locales, isolating names and the patient's words", () => {
    const copy = { code: "PROPOSAL_DECLINED", params: { said: "Too far to travel" } };
    expect(workCopyText(copy, en.portalWork.workCopy)).toEqual({ title: "Patient declined the proposal",
      context: `The patient declined this proposal. They said: “${iso("Too far to travel")}”` });
    expect(workCopyText(copy, ar.portalWork.workCopy)?.title).toBe("رفض المريض العرض");
    expect(workCopyText(copy, ar.portalWork.workCopy)?.context).toContain(`«${iso("Too far to travel")}»`);
    expect(workCopyText({ code: "RECOMMENDATION_READY", params: { consultant: "Dr Ahmed Alashry" } }, ar.portalWork.workCopy)?.context).toContain(iso("Dr Ahmed Alashry"));
  });
  it("falls back to a neutral name, and to the backend's English for an unknown code", () => {
    expect(workCopyText({ code: "ASSIGNMENT_DECLINED", params: {} }, en.portalWork.workCopy)?.context).toBe("The Consultant declined this assignment. Choose another Consultant.");
    expect(workCopyText({ code: "SOMETHING_NEW" }, en.portalWork.workCopy)).toBeNull();
    expect(workCopyText(null, en.portalWork.workCopy)).toBeNull();
  });
});

describe("waitingReasonText", () => {
  const enWork = { waitingReason: en.portalWork.waitingReason, workCopy: en.portalWork.workCopy };
  const arWork = { waitingReason: ar.portalWork.waitingReason, workCopy: ar.portalWork.workCopy };
  it("words a fixed reason, a work item and a patient step, and keeps the English for anything unknown", () => {
    expect(waitingReasonText({ waitingReasonCode: "DEFAULT_PATIENT", waitingReason: "Waiting for information requested from the patient" }, enWork, "en")).toBe("Waiting for the patient");
    expect(waitingReasonText({ waitingReasonCode: "WORK:PROPOSAL_CHANGES_REQUESTED" }, arWork, "ar")).toBe("طلب المريض تعديلات على العرض");
    const blockers = [{ code: "CONTACT_NOT_VERIFIED", labelEn: "Contact channel verification", labelAr: "تأكيد وسيلة التواصل" }];
    expect(waitingReasonText({ waitingReasonCode: "PATIENT_STEP:CONTACT_NOT_VERIFIED", blockers }, arWork, "ar")).toBe("بانتظار المريض: تأكيد وسيلة التواصل");
    expect(waitingReasonText({ waitingReasonCode: "SOMETHING_NEW", waitingReason: "Legacy English" }, arWork, "ar")).toBe("Legacy English");
    expect(waitingReasonText({ waitingReason: null }, enWork, "en")).toBeNull();
  });
  it("adds an optional sentence only when its parameter is present", () => {
    const base = { code: "CASE_OWNERSHIP_TRANSFERRED", params: { caseNumber: "RS-2026-000001" } };
    expect(workCopyText(base, en.portalWork.workCopy)?.context).not.toContain("Transferred by");
    expect(workCopyText({ ...base, params: { ...base.params, by: "Sara Ahmed" } }, en.portalWork.workCopy)?.context).toContain("Transferred by ⁨Sara Ahmed⁩.");
  });
});

// UX 5-3: "Also open on this case" never repeats the step, and words a step-named item in Arabic.
describe("the case's other open work", () => {
  const item = (id: string, type: string) => ({ id, type, title: "Record the receipt", context: null, copy: null });

  it("treats the step's own item as the step, by id when the step has one, else by its code or work type", () => {
    expect(isStepItem({ code: "WORK_ITEM", kind: "COMPLETE", workItemId: "w1", workType: "COUNTERSIGN_MILESTONE" }, item("w2", "COUNTERSIGN_MILESTONE"))).toBe(false);
    expect(isStepItem({ code: "WORK_ITEM", kind: "COMPLETE", workItemId: "w1" }, item("w1", "X"))).toBe(true);
    expect(isStepItem({ code: "RECORD_HOSPITAL_BALANCE", kind: "FOCUS" }, item("w3", "RECORD_HOSPITAL_BALANCE"))).toBe(true);
    expect(isStepItem({ code: "UPDATE_TRAVEL_PLAN", kind: "FOCUS", workType: "TRAVEL" }, item("w4", "TRAVEL"))).toBe(true);
    expect(isStepItem({ code: "RECORD_HOSPITAL_BALANCE", kind: "FOCUS" }, item("w5", "RECORD_ADMISSION_NUMBER"))).toBe(false);
    // A step that waits on someone else hides none of the viewer's work.
    expect(isStepItem({ code: "TRAVEL", kind: "WAIT" }, item("w6", "TRAVEL"))).toBe(false);
  });

  it("titles a step-named item with the step's own words in Arabic, and keeps the backend's English in English", () => {
    expect(workItemText(item("w3", "RECORD_HOSPITAL_BALANCE"), "ar", ar.portalWork).title).toBe(ar.portalWork.currentAction.states.RECORD_HOSPITAL_BALANCE.title);
    expect(workItemText(item("w3", "RECORD_HOSPITAL_BALANCE"), "en", en.portalWork).title).toBe("Record the receipt");
    expect(workItemText(item("w6", "CONFIRM_DEPARTURE"), "ar", ar.portalWork).title).toBe(ar.portalWork.workTitles.CONFIRM_DEPARTURE);
    // Never a waiting state's words.
    expect(workItemText(item("w7", "WAIT_OPERATIONS"), "ar", ar.portalWork).title).toBe("Record the receipt");
  });

  // UX 4-3: an item that came without a wording code reads its context from its work type in Arabic; English keeps the backend's.
  it("words an uncoded item's context from its work type in Arabic", () => {
    const finance = (type: string) => ({ id: "f", type, title: "Countersign the hospital receipt", context: "Operations recorded the cashier's receipt.", copy: null });
    expect(workItemText(finance("COUNTERSIGN_BALANCE"), "ar", ar.portalWork).context).toBe(ar.portalWork.workCopy.items.COUNTERSIGN_BALANCE.context);
    expect(workItemText(finance("DEPOSIT_RECORD"), "ar", ar.portalWork).context).toBe(ar.portalWork.workCopy.items.DEPOSIT_VERIFY_TRANSFER.context);
    expect(workItemText(finance("COUNTERSIGN_BALANCE"), "en", en.portalWork).context).toBe("Operations recorded the cashier's receipt.");
    // A type with no entry keeps the backend's sentence.
    expect(workItemText(finance("NOT_A_TYPE"), "ar", ar.portalWork).context).toBe("Operations recorded the cashier's receipt.");
  });
});

describe("fillTemplate isolation (UX X-1)", () => {
  it("isolates a case number, a rate and an amount left to right and a date by its first letter, in an Arabic sentence", () => {
    const text = fillTemplate("الحالة {caseNumber} بمبلغ {amount} في {date} بسعر {rate} لـ {name}",
      { caseNumber: "RS-2026-000123", amount: "1,200 ج.م.", date: "29 أكتوبر 2026", rate: "1 USD = 50 EGP", name: "Layla" });
    expect(text).toBe("الحالة \u2066RS-2026-000123\u2069 بمبلغ \u20661,200 ج.م.\u2069 في \u206829 أكتوبر 2026\u2069 بسعر \u20661 USD = 50 EGP\u2069 لـ Layla");
  });

  it("leaves an English sentence and an already isolated value as they are", () => {
    expect(fillTemplate("Case {caseNumber} for {amount}", { caseNumber: "RS-2026-000123", amount: "EGP 1,200" })).toBe("Case RS-2026-000123 for EGP 1,200");
    expect(fillTemplate("المبلغ {amount}", { amount: "\u2066EGP 5\u2069" })).toBe("المبلغ \u2066EGP 5\u2069");
    expect(fillTemplate("المبلغ {amount}", { amount: "" })).toBe("المبلغ ");
  });
});
