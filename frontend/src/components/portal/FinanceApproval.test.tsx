import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen, within } from "@testing-library/react";

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  HTMLDialogElement.prototype.close = function () { this.open = false; this.dispatchEvent(new Event("close")); };
});

import { FinanceApproval } from "./FinanceApproval";
import type { ProposalCommercial } from "./portal-model";
import { renderWithWork } from "./test-copy";

const commercial: ProposalCommercial = {
  versionId: "v1", currency: "USD", fxRate: null, requiresFinanceApproval: true, policyName: "Cardiology margin", policyCareArea: "cardiology",
  policyVersion: 3, marginRate: 0.12, baseTotalEgp: 53500, marginEgp: 6420, patientTotalEgp: 59920, displayTotal: 1198.4,
  lines: [
    { id: "l1", description: "Echocardiogram", source: "CATALOG", quantity: 1, baseEgp: 3500, patientEgp: 3920, displayUnitPrice: 78.4 },
    { id: "l2", description: "Bespoke lead extraction", source: "MANUAL", quantity: 1, baseEgp: 50000, patientEgp: 56000, displayUnitPrice: 1120 },
    { id: "l3", description: "Bypass package", source: "FACILITY_PACKAGE", quantity: 1, baseEgp: 180000, patientEgp: 201600, displayUnitPrice: 4032, facilityPackageId: "pkg-1", facilityName: "Nile Heart Hospital" },
  ],
};
const table = () => screen.getByRole("table");

/** QA #19 / #20: Finance sees what it approves — the manual line, the Consultant's EGP base price and the margin — and approves once, here. */
describe("FinanceApproval", () => {
  afterEach(cleanup);

  it("marks the manual line and shows the base price, the margin and the totals before the one approve button", () => {
    renderWithWork(<FinanceApproval locale="en" commercial={commercial} busy={false} approveLabel="Approve commercial terms" onApprove={vi.fn()}/>);
    expect(screen.getByText(/^1 line is priced by the Consultant outside their approved list/)).toBeTruthy();
    const manualRow = within(table()).getByRole("row", { name: /Bespoke lead extraction/ });
    expect(within(manualRow).getByText("Manual — needs your approval")).toBeTruthy();
    expect(manualRow.textContent).toMatch(/50,000/);
    expect(manualRow.textContent).toMatch(/56,000/);
    expect(within(within(table()).getByRole("row", { name: /Echocardiogram/ })).getByText("Approved list")).toBeTruthy();
    // P0-5: a facility package line says whose approved price it carries, and is not counted as a manual line.
    expect(within(table()).getByRole("row", { name: /Bypass package/ }).textContent).toContain("Approved facility package · Nile Heart Hospital");
    const term = (label: string) => screen.getAllByText(label, { selector: "dt" }).at(-1)?.parentElement?.textContent;
    expect(term("Consultant price total")).toMatch(/53,500/);
    expect(term("Platform margin")).toMatch(/6,420/);
    expect(term("Platform margin")).toMatch(/12%/);
    expect(term("Platform margin")).toContain("Cardiology margin");
    expect(term("Patient total (EGP)")).toMatch(/59,920/);
    expect(screen.getAllByRole("button")).toHaveLength(1);
  });

  // UX 4-0: approving is a money commitment, so it asks first with the patient's total in the question.
  it("asks before approving, with the patient's total, and approves only on confirm", () => {
    const onApprove = vi.fn().mockResolvedValue({});
    renderWithWork(<FinanceApproval locale="en" commercial={commercial} busy={false} approveLabel="Approve commercial terms" onApprove={onApprove}/>);
    fireEvent.click(screen.getByRole("button", { name: "Approve commercial terms" }));
    const dialog = screen.getByRole("alertdialog");
    expect(dialog.textContent).toMatch(/Approve these terms at .*59,920/);
    expect(onApprove).not.toHaveBeenCalled();
    fireEvent.click(within(dialog).getByRole("button", { name: "Approve commercial terms" }));
    expect(onApprove).toHaveBeenCalledTimes(1);
  });

  it("states a fixed rate the way Finance quotes it", () => {
    renderWithWork(<FinanceApproval locale="en" commercial={{ ...commercial, fxRate: 0.02 }} busy={false} approveLabel="Approve commercial terms" onApprove={vi.fn()}/>);
    expect(screen.getByText(/Rate fixed at release: .*\$1 = EGP\s?50/)).toBeTruthy();
  });

  it("states the rate in Arabic with each side isolated, so the equation reads right to left (UX 4-2)", () => {
    renderWithWork(<FinanceApproval locale="ar" commercial={{ ...commercial, fxRate: 0.02 }} busy={false} approveLabel="اعتماد الشروط التجارية" onApprove={vi.fn()}/>, "ar");
    const rate = screen.getByText(/\u2068[^\u2069]*1[^\u2069]*\u2069 = \u2068[^\u2069]*50[^\u2069]*\u2069/);
    // No forced left-to-right run around the whole equation.
    expect(rate.textContent).not.toContain("\u2066");
  });

  it("says when no margin policy applies, in Arabic too", () => {
    renderWithWork(<FinanceApproval locale="ar" commercial={{ ...commercial, policyName: null, policyVersion: null, marginRate: 0, marginEgp: 0 }} busy={false}
      approveLabel="الموافقة على الشروط التجارية" onApprove={vi.fn()}/>, "ar");
    expect(screen.getByText("لا تنطبق سياسة هامش على مجال الرعاية هذا — لا يُضاف هامش.")).toBeTruthy();
    expect(screen.getAllByText("سعر يدوي — يحتاج موافقتك").length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "الموافقة على الشروط التجارية" })).toBeTruthy();
  });
});
