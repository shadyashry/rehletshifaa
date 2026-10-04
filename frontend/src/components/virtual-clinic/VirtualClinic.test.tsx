import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

import { ClinicWorkspace } from "./VirtualClinic";
import type { Clinic } from "./virtual-clinic-model";

function clinic(overrides: Partial<Clinic> = {}): Clinic {
  return {
    practitionerId: "p1", relation: "OWNER", permissions: ["PROFILE", "SCHEDULE", "SERVICES"],
    professional: { displayName: "Dr Ahmed", specialty: "Cardiology", subspecialty: "Interventional", careArea: "cardiology", careAreaEn: "Cardiology", careAreaAr: "أمراض القلب",
      credentialingStatus: "VERIFIED", credentialsCurrent: true, capabilities: [{ type: "PROCEDURE", code: "pci", label: "PCI" }], languages: "English, Arabic",
      availabilityStatus: "AVAILABLE", expectedReviewHours: 48, assignable: true, practitionerVersion: 3 },
    publicProfile: {}, draft: null, managerChangesRequireApproval: true,
    services: [{ id: "s1", serviceCode: "VID-30", serviceName: "Video consultation", serviceKind: "VIDEO_CONSULTATION", currency: "EGP", priceEgp: 2500, active: true, approvalStatus: "CONSULTANT_APPROVED", revision: 1 }],
    pendingChanges: [{ id: "c1", serviceId: null, changeType: "CREATE", serviceCode: "FU", serviceName: "Follow-up consultation", serviceKind: "FOLLOW_UP_CONSULTATION", currency: "EGP",
      priceEgp: 1500, effectiveFrom: "2026-10-01", status: "PENDING_APPROVAL", proposedByName: "Mona PM", proposedByRole: "PRACTICE_MANAGER", proposedAt: "2026-09-25T10:00:00Z", version: 0 }],
    slots: [], managers: [], version: 4, ...overrides,
  };
}

function setup(value: Clinic, locale: "en" | "ar" = "en") {
  const call = vi.fn().mockResolvedValue([]);
  const reload = vi.fn();
  render(<ClinicWorkspace locale={locale} clinic={value} call={call} reload={reload}/>);
  return { call, reload };
}

describe("Virtual clinic", () => {
  afterEach(cleanup);

  it("gives the consultant every section and the approval of prepared price changes", async () => {
    const { call } = setup(clinic());
    for (const tab of ["Overview", "Services & prices", "Schedule", "Practice managers", "Change history"])
      expect(screen.getByRole("tab", { name: tab })).toBeTruthy();
    expect(screen.getByRole("region", { name: "Availability for new cases" })).toBeTruthy();
    expect(screen.getByText("Eligible for new case assignments")).toBeTruthy();

    fireEvent.click(screen.getByRole("tab", { name: "Services & prices" }));
    expect(screen.getByText(/by Mona PM/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Approve" }));
    expect(call).toHaveBeenCalledWith("/clinics/p1/service-changes/c1/approve", "POST", { expectedVersion: 0 });
  });

  it("shows a practice manager only what their permissions allow, and never an approval", () => {
    setup(clinic({ relation: "PRACTICE_MANAGER", permissions: ["SERVICES"] }));
    expect(screen.getByText(/never see patients, cases, medical documents or clinical decisions/)).toBeTruthy();
    expect(screen.queryByRole("tab", { name: "Schedule" })).toBeNull();
    expect(screen.queryByRole("tab", { name: "Practice managers" })).toBeNull();
    expect(screen.queryByRole("tab", { name: "Change history" })).toBeNull();
    expect(screen.queryByRole("region", { name: "Availability for new cases" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Edit public profile" })).toBeNull();

    fireEvent.click(screen.getByRole("tab", { name: "Services & prices" }));
    expect(screen.queryByRole("button", { name: "Approve" })).toBeNull();
    expect(screen.getByText("Waiting for the consultant")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Add a service" }));
    expect(screen.getByRole("button", { name: "Send for approval" })).toBeTruthy();
  });

  it("sends a retire as a governed change, not a direct edit", () => {
    const { call } = setup(clinic({ pendingChanges: [] }));
    fireEvent.click(screen.getByRole("tab", { name: "Services & prices" }));
    fireEvent.click(screen.getByRole("button", { name: "Retire" }));
    expect(call).toHaveBeenCalledWith("/clinics/p1/service-changes", "POST", { serviceId: "s1", changeType: "RETIRE" });
  });

  it("invites a practice manager with explicit permissions only", () => {
    const { call } = setup(clinic());
    fireEvent.click(screen.getByRole("tab", { name: "Practice managers" }));
    expect(screen.getByText(/never see patients, cases, medical documents, messages or clinical decisions/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Full name"), { target: { value: "Mona PM" } });
    fireEvent.change(screen.getByLabelText("Work email"), { target: { value: "mona@example.test" } });
    fireEvent.click(screen.getByLabelText("Manage schedule"));
    fireEvent.click(screen.getByRole("button", { name: "Send invitation" }));
    expect(call).toHaveBeenCalledWith("/clinics/p1/managers", "POST", { name: "Mona PM", email: "mona@example.test", permissions: ["SCHEDULE"], locale: "en" });
  });

  it("renders in Arabic", () => {
    setup(clinic(), "ar");
    expect(screen.getByRole("tab", { name: "الخدمات والأسعار" })).toBeTruthy();
    expect(screen.getByText("مؤهل لإسناد حالات جديدة")).toBeTruthy();
  });
});
