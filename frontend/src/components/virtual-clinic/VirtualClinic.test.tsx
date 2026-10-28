import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";

import { getDictionary } from "@/lib/dictionary";
import { ClinicWorkspace } from "./VirtualClinic";
import type { Clinic } from "./virtual-clinic-model";

function clinic(overrides: Partial<Clinic> = {}): Clinic {
  return {
    practitionerId: "p1", relation: "OWNER", permissions: ["PROFILE", "SCHEDULE", "SERVICES"],
    professional: { displayName: "Dr Ahmed", specialty: "Cardiology", subspecialty: "Interventional", careArea: "cardiology", careAreaEn: "Cardiology", careAreaAr: "أمراض القلب",
      credentialingStatus: "VERIFIED", credentialsCurrent: true, capabilities: [{ type: "PROCEDURE", code: "pci", label: "PCI" }], languages: "English, Arabic",
      availabilityStatus: "AVAILABLE", expectedReviewHours: 48, assignable: true, practitionerVersion: 3 },
    publicProfile: {}, draft: null, managerChangesRequireApproval: true,
    services: [{ id: "s1", serviceCode: "VID-30", serviceName: "Video consultation", serviceKind: "VIDEO_CONSULTATION", currency: "EGP", priceEgp: 2500, effectiveFrom: "2026-09-01", active: true, approvalStatus: "CONSULTANT_APPROVED", revision: 1 }],
    pendingChanges: [{ id: "c1", serviceId: null, changeType: "CREATE", serviceCode: "FU", serviceName: "Follow-up consultation", serviceKind: "FOLLOW_UP_CONSULTATION", currency: "EGP",
      priceEgp: 1500, effectiveFrom: "2026-10-01", status: "PENDING_APPROVAL", proposedByName: "Mona PM", proposedByRole: "PRACTICE_MANAGER", proposedAt: "2026-09-25T10:00:00Z", version: 0 }],
    slots: [], managers: [], version: 4, ...overrides,
  };
}

const words = (locale: "en" | "ar") => getDictionary(locale).portalWork;

function setup(value: Clinic, locale: "en" | "ar" = "en") {
  const call = vi.fn().mockResolvedValue([]);
  const reload = vi.fn();
  render(<ClinicWorkspace locale={locale} copy={words(locale).virtualClinic} clinic={value} call={call} reload={reload} affiliationsCopy={words(locale).affiliations}/>);
  return { call, reload };
}

describe("Virtual clinic", () => {
  // jsdom has no <dialog> methods; the confirmations are native dialogs.
  beforeAll(() => {
    HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
    HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); this.dispatchEvent(new Event("close")); };
  });
  afterEach(cleanup);

  it("gives the consultant every section and the approval of prepared price changes", () => {
    const { call } = setup(clinic());
    for (const tab of ["Overview", "Services & prices", "Schedule", "Practice managers", "Affiliations", "Change history"])
      expect(screen.getByRole("tab", { name: tab })).toBeTruthy();
    expect(screen.getByRole("region", { name: "Availability for new cases" })).toBeTruthy();
    expect(screen.getByText("Eligible for new case assignments")).toBeTruthy();

    fireEvent.click(screen.getByRole("tab", { name: "Services & prices" }));
    expect(screen.getByText(/Proposed by Mona PM/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Approve the change to Follow-up consultation" }));
    expect(call).toHaveBeenCalledWith("/clinics/p1/service-changes/c1/approve", "POST", { expectedVersion: 0 });
  });

  it("never says Verified: the credentials were reviewed, and whether they are current", () => {
    setup(clinic());
    expect(screen.getByText("Credentials reviewed · current")).toBeTruthy();
    expect(screen.queryByText(/Verified/)).toBeNull();
  });

  it("moves between sections with the arrow keys, Home and End, mirrored in Arabic", () => {
    setup(clinic());
    const overview = screen.getByRole("tab", { name: "Overview" });
    expect(overview.getAttribute("tabindex")).toBe("0");
    fireEvent.keyDown(overview, { key: "ArrowRight" });
    expect(screen.getByRole("tab", { name: "Services & prices" }).getAttribute("aria-selected")).toBe("true");
    fireEvent.keyDown(screen.getByRole("tab", { name: "Services & prices" }), { key: "End" });
    expect(screen.getByRole("tab", { name: "Change history" }).getAttribute("aria-selected")).toBe("true");
    expect(screen.getByRole("tabpanel").getAttribute("aria-labelledby")).toBe("clinic-tab-history");
    cleanup();
    setup(clinic(), "ar");
    fireEvent.keyDown(screen.getByRole("tab", { name: "نظرة عامة" }), { key: "ArrowLeft" });
    expect(screen.getByRole("tab", { name: "الخدمات والأسعار" }).getAttribute("aria-selected")).toBe("true");
  });

  it("shows a practice manager only what their permissions allow, says what they may do, and never offers an approval", () => {
    setup(clinic({ relation: "PRACTICE_MANAGER", permissions: ["SERVICES"] }));
    expect(screen.getByText("Dr Ahmed has allowed you to prepare services and prices.", { exact: false })).toBeTruthy();
    expect(screen.getByText(/wait for the Consultant's approval/)).toBeTruthy();
    expect(screen.queryByRole("tab", { name: "Schedule" })).toBeNull();
    expect(screen.queryByRole("tab", { name: "Practice managers" })).toBeNull();
    expect(screen.queryByRole("tab", { name: "Change history" })).toBeNull();
    // P1-19: the affiliation declaration is the Consultant's personal attestation, never a practice manager's.
    expect(screen.queryByRole("tab", { name: "Affiliations" })).toBeNull();
    expect(screen.queryByRole("region", { name: "Availability for new cases" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Edit the public profile" })).toBeNull();

    fireEvent.click(screen.getByRole("tab", { name: "Services & prices" }));
    expect(screen.queryByRole("button", { name: /^Approve/ })).toBeNull();
    expect(screen.getByRole("region", { name: "Changes waiting for the Consultant" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Add a service" }));
    expect(screen.getByRole("button", { name: "Send for approval" })).toBeTruthy();
  });

  it("confirms a retire before sending it as a governed change", () => {
    const { call } = setup(clinic({ pendingChanges: [] }));
    fireEvent.click(screen.getByRole("tab", { name: "Services & prices" }));
    fireEvent.click(screen.getByRole("button", { name: "Retire Video consultation" }));
    expect(call).not.toHaveBeenCalledWith("/clinics/p1/service-changes", "POST", expect.anything());
    const dialog = screen.getByRole("alertdialog", { name: "Retire Video consultation?" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Retire service" }));
    expect(call).toHaveBeenCalledWith("/clinics/p1/service-changes", "POST", { serviceId: "s1", changeType: "RETIRE" });
  });

  it("lists services with the price in Egyptian pounds and the date in words, one filled action at most", () => {
    setup(clinic({ pendingChanges: [] }));
    fireEvent.click(screen.getByRole("tab", { name: "Services & prices" }));
    const list = screen.getByRole("region", { name: "Your services" });
    expect(within(list).getByText(/EGP\s?2,500/)).toBeTruthy();
    expect(within(list).getByText(/From September 1, 2026/)).toBeTruthy();
    expect(document.querySelectorAll(".btn-primary")).toHaveLength(0);
  });

  it("invites a practice manager with explicit permissions only", () => {
    const { call } = setup(clinic());
    fireEvent.click(screen.getByRole("tab", { name: "Practice managers" }));
    expect(screen.getByText(/never see patients, cases, medical documents, messages or clinical decisions/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Full name"), { target: { value: "Mona PM" } });
    fireEvent.change(screen.getByLabelText("Work email"), { target: { value: "mona@example.test" } });
    fireEvent.click(screen.getByLabelText("Manage the schedule"));
    fireEvent.click(screen.getByRole("button", { name: "Send invitation" }));
    expect(call).toHaveBeenCalledWith("/clinics/p1/managers", "POST", { name: "Mona PM", email: "mona@example.test", permissions: ["SCHEDULE"], locale: "en" });
  });

  it("confirms revoking a practice manager's access", () => {
    const manager = { id: "m1", name: "Mona PM", email: "mona@example.test", status: "ACTIVE", permissions: ["SCHEDULE" as const], invitedAt: "2026-09-01T09:00:00Z", version: 2 };
    const { call } = setup(clinic({ managers: [manager] }));
    fireEvent.click(screen.getByRole("tab", { name: "Practice managers" }));
    fireEvent.click(screen.getByRole("button", { name: "Revoke access" }));
    fireEvent.click(within(screen.getByRole("alertdialog", { name: "Revoke Mona PM's access?" })).getByRole("button", { name: "Revoke access" }));
    expect(call).toHaveBeenCalledWith("/clinics/p1/managers/m1", "PUT", { permissions: [], active: false, expectedVersion: 2 });
  });

  it("refuses a review time outside 1 to 720 hours at the field", () => {
    const { call } = setup(clinic());
    fireEvent.change(screen.getByLabelText("Expected review time, in hours"), { target: { value: "900" } });
    fireEvent.click(screen.getByRole("button", { name: "Save availability" }));
    expect(screen.getByText("Enter a whole number of hours from 1 to 720.")).toBeTruthy();
    expect(call).not.toHaveBeenCalledWith("/clinics/p1/availability", "PUT", expect.anything());
  });

  it("words a version conflict and shows the latest clinic", async () => {
    const reload = vi.fn();
    const call = vi.fn().mockImplementation(async (path: string) => {
      if (path.endsWith("/settings")) throw Object.assign(new Error("stale"), { code: "CLINIC_VERSION_CONFLICT" });
      return [];
    });
    render(<ClinicWorkspace locale="en" copy={words("en").virtualClinic} clinic={clinic()} call={call} reload={reload} affiliationsCopy={words("en").affiliations}/>);
    fireEvent.click(screen.getByRole("checkbox", { name: /need my approval/ }));
    expect(await screen.findByText(/Someone changed this clinic a moment ago/)).toBeTruthy();
    expect(reload).toHaveBeenCalled();
  });

  it("P1-19: tells a Consultant who never declared why no case comes, and takes them to Affiliations", async () => {
    const none = { practitionerId: "p1", declarationCurrent: false, renewBy: null, attestationVersion: "affiliation-attestation-2026-10", current: null, history: [], flags: [] };
    const call = vi.fn().mockImplementation(async (path: string) => (path.endsWith("/affiliations") ? none : []));
    render(<ClinicWorkspace locale="en" copy={words("en").virtualClinic} clinic={clinic({ professional: { ...clinic().professional, assignable: false } })} call={call} reload={vi.fn()}
      affiliationsCopy={words("en").affiliations}/>);
    expect(await screen.findByText("Declare your hospital affiliations")).toBeTruthy();
    expect(screen.getByText("Not currently eligible for new cases: no current affiliation declaration")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Go to Affiliations" }));
    expect(screen.getByRole("tab", { name: "Affiliations" }).getAttribute("aria-selected")).toBe("true");
  });

  it("P1-19: reminds the Consultant a month before the declaration ends, and never asks a practice manager", async () => {
    const soon = new Date(Date.now() + 10 * 86_400_000).toISOString();
    const current = { id: "d1", practitionerId: "p1", declaredAt: "2025-10-26T09:00:00Z", validUntil: soon, current: true, attestationVersion: "a", lines: [] };
    const call = vi.fn().mockImplementation(async (path: string) => (path.endsWith("/affiliations")
      ? { practitionerId: "p1", declarationCurrent: true, renewBy: soon, attestationVersion: "a", current, history: [], flags: [] } : []));
    render(<ClinicWorkspace locale="en" copy={words("en").virtualClinic} clinic={clinic()} call={call} reload={vi.fn()} affiliationsCopy={words("en").affiliations}/>);
    expect(await screen.findByText(/Your affiliation declaration ends on/)).toBeTruthy();
    cleanup();
    const managerCall = vi.fn().mockResolvedValue([]);
    render(<ClinicWorkspace locale="en" copy={words("en").virtualClinic} clinic={clinic({ relation: "PRACTICE_MANAGER", permissions: ["SERVICES"] })} call={managerCall} reload={vi.fn()}
      affiliationsCopy={words("en").affiliations}/>);
    expect(managerCall).not.toHaveBeenCalledWith("/clinics/p1/affiliations");
  });

  it("renders in Arabic, with Latin digits and no English", () => {
    setup(clinic(), "ar");
    expect(screen.getByRole("tab", { name: "الخدمات والأسعار" })).toBeTruthy();
    expect(screen.getByText("مؤهل لإسناد حالات جديدة")).toBeTruthy();
    expect(screen.getByText("تمت مراجعة الاعتمادات · سارية")).toBeTruthy();
    fireEvent.click(screen.getByRole("tab", { name: "الخدمات والأسعار" }));
    expect(screen.getByText(/1 سبتمبر 2026/)).toBeTruthy();
  });
});
