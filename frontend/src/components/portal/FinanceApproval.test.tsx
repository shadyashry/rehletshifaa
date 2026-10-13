import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";

import { FinanceApproval } from "./FinanceApproval";
import type { ProposalCommercial } from "./portal-model";

const commercial: ProposalCommercial = {
  versionId: "v1", currency: "USD", fxRate: null, requiresFinanceApproval: true, policyName: "Cardiology margin", policyCareArea: "cardiology",
  policyVersion: 3, marginRate: 0.12, baseTotalEgp: 53500, marginEgp: 6420, patientTotalEgp: 59920, displayTotal: 1198.4,
  lines: [
    { id: "l1", description: "Echocardiogram", source: "CATALOG", quantity: 1, baseEgp: 3500, patientEgp: 3920, displayUnitPrice: 78.4 },
    { id: "l2", description: "Bespoke lead extraction", source: "MANUAL", quantity: 1, baseEgp: 50000, patientEgp: 56000, displayUnitPrice: 1120 },
  ],
};

/** QA #19 / #20: Finance sees what it approves — the manual line, the Consultant's EGP base price and the margin — and approves once, here. */
describe("FinanceApproval", () => {
  afterEach(cleanup);

  it("marks the manual line and shows the base price, the margin and the totals before the one approve button", () => {
    const onApprove = vi.fn();
    render(<FinanceApproval locale="en" commercial={commercial} busy={false} approveLabel="Approve commercial terms" onApprove={onApprove}/>);
    expect(screen.getByText(/^1 line is priced by the Consultant outside their approved list/)).toBeTruthy();
    const manualRow = screen.getByRole("row", { name: /Bespoke lead extraction/ });
    expect(within(manualRow).getByText("Manual — needs your approval")).toBeTruthy();
    expect(manualRow.textContent).toMatch(/50,000/);
    expect(manualRow.textContent).toMatch(/56,000/);
    expect(within(screen.getByRole("row", { name: /Echocardiogram/ })).getByText("Approved list")).toBeTruthy();
    const term = (label: string) => screen.getByText(label, { selector: "dt" }).parentElement?.textContent;
    expect(term("Consultant price total")).toMatch(/53,500/);
    expect(term("Platform margin")).toMatch(/6,420/);
    expect(term("Platform margin")).toMatch(/12%/);
    expect(term("Platform margin")).toContain("Policy: Cardiology margin (version 3)");
    expect(term("Patient total (EGP)")).toMatch(/59,920/);
    expect(screen.getAllByRole("button")).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "Approve commercial terms" }));
    expect(onApprove).toHaveBeenCalledTimes(1);
  });

  it("says when no margin policy applies, in Arabic too", () => {
    render(<FinanceApproval locale="ar" commercial={{ ...commercial, policyName: null, policyVersion: null, marginRate: 0, marginEgp: 0 }} busy={false}
      approveLabel="الموافقة على الشروط التجارية" onApprove={vi.fn()}/>);
    expect(screen.getByText("لا تنطبق سياسة هامش على مجال الرعاية هذا — لا يُضاف هامش.")).toBeTruthy();
    expect(screen.getByText("يدوي — يحتاج موافقتك")).toBeTruthy();
    expect(screen.getByRole("button", { name: "الموافقة على الشروط التجارية" })).toBeTruthy();
  });
});
