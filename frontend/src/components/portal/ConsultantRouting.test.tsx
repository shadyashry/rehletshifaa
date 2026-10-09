import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";

import { renderWithWork } from "./test-copy";
import { ConsultantReferrals, EligibleConsultantPicker, ReferralConfirmation, type EligibleConsultant, type Load, type Referral } from "./ConsultantRouting";

// jsdom implements <dialog> only partially.
beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  HTMLDialogElement.prototype.close = function () { this.open = false; this.dispatchEvent(new Event("close")); };
});

const categories = [{ slug: "cardiology", nameEn: "Cardiology", nameAr: "أمراض القلب" }, { slug: "orthopedics", nameEn: "Orthopedics", nameAr: "جراحة العظام" }];
const consultants: EligibleConsultant[] = [
  { practitionerId: "pr-a", displayName: "Dr A", specialty: "Cardiology", subspecialty: "Electrophysiology", careArea: "cardiology", matchedBy: "PRIMARY_CARE_AREA",
    capabilities: [{ type: "PROCEDURE", code: "ablation", label: "Catheter ablation" }], expectedReviewHours: 48, activeCases: 2, pendingOffers: 1 },
  { practitionerId: "pr-b", displayName: "Dr B", specialty: "Cardiology", careArea: "cardiology", matchedBy: "APPROVED_CAPABILITY", capabilities: [], activeCases: 0, pendingOffers: 0 },
];
const referral = (overrides: Partial<Referral> = {}): Referral => ({
  id: "r1", type: "TRANSFER", status: "AWAITING_COORDINATOR", fromConsultantName: "Dr C", clinicalReason: "Needs electrophysiology", suggestedCareArea: null,
  suggestedPractitionerId: "pr-a", suggestedConsultantName: "Dr A", createdAt: "2026-09-25T10:00:00Z", updatedAt: "2026-09-25T10:00:00Z", version: 2,
  viewerRelation: "COORDINATOR", ...overrides,
});

describe("Consultant routing", () => {
  afterEach(cleanup);

  it("lists eligible consultants with the facts to choose on, addressed by practitioner id", async () => {
    const load = vi.fn().mockResolvedValue(consultants);
    const onChange = vi.fn();
    render(<EligibleConsultantPicker locale="en" caseId="case-1" careArea="cardiology" value="" onChange={onChange} load={load}/>);
    expect(await screen.findByText("Dr A")).toBeTruthy();
    expect(load).toHaveBeenCalledWith("/coordinator/cases/case-1/eligible-consultants?careArea=cardiology");
    expect(screen.getByText("Catheter ablation")).toBeTruthy();
    expect(screen.getByText(/Usual review time 48 h · 2 active cases · 1 offer pending/)).toBeTruthy();
    expect(screen.getByText("Eligible through an approved capability")).toBeTruthy();
    fireEvent.click(screen.getByRole("radio", { name: /Dr B/ }));
    expect(onChange).toHaveBeenCalledWith("pr-b");
  });

  it("lets the coordinator confirm a referral to the suggested consultant", async () => {
    const load = vi.fn((path: string) => Promise.resolve(path.includes("/referrals") ? [referral()] : consultants)) as unknown as Load;
    const mutate = vi.fn().mockResolvedValue({});
    renderWithWork(<ReferralConfirmation locale="en" caseId="case-1" careCategory="cardiology" categories={categories} busy={false} load={load} mutate={mutate}/>);
    expect(await screen.findByText(/Needs electrophysiology/)).toBeTruthy();
    expect(await screen.findByText("Dr B")).toBeTruthy();
    expect((screen.getByRole("radio", { name: /Dr A/ }) as HTMLInputElement).checked).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Confirm handover" }));
    expect(mutate).toHaveBeenCalledWith("/coordinator/cases/case-1/referrals/r1/confirm", { practitionerId: "pr-a", careArea: "cardiology", note: null, expectedVersion: 2 });
  });

  it("requires a reason for the coordinator to decline", async () => {
    const load = vi.fn((path: string) => Promise.resolve(path.includes("/referrals") ? [referral()] : consultants)) as unknown as Load;
    const mutate = vi.fn().mockResolvedValue({});
    renderWithWork(<ReferralConfirmation locale="en" caseId="case-1" careCategory="cardiology" categories={categories} busy={false} load={load} mutate={mutate}/>);
    fireEvent.click(await screen.findByRole("button", { name: "Decline referral" }));
    fireEvent.change(screen.getByLabelText("Why this referral is not confirmed"), { target: { value: "Keep with current consultant" } });
    fireEvent.click(screen.getByRole("button", { name: "Decline" }));
    expect(mutate).toHaveBeenCalledWith("/coordinator/cases/case-1/referrals/r1/decline", { note: "Keep with current consultant", expectedVersion: 2 });
  });

  it("gives a second-opinion consultant the opinion form and nothing to refer", async () => {
    const load = vi.fn().mockResolvedValue([referral({ type: "SECOND_OPINION", status: "IN_PROGRESS", viewerRelation: "RECEIVER" })]);
    const mutate = vi.fn().mockResolvedValue({});
    renderWithWork(<ConsultantReferrals locale="en" caseId="case-1" careCategory="cardiology" categories={categories} canRefer={false} busy={false} load={load} mutate={mutate}/>);
    fireEvent.change(await screen.findByLabelText("Your second opinion"), { target: { value: "Ablation is reasonable." } });
    expect(screen.queryByRole("button", { name: "Refer this case" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Submit second opinion" }));
    // Ending access is confirmed first: nothing is sent until the consultant agrees.
    const confirm = await screen.findByRole("alertdialog", { name: "Submit your second opinion?" });
    expect(mutate).not.toHaveBeenCalled();
    fireEvent.click(within(confirm).getByRole("button", { name: "Submit and end access" }));
    expect(mutate).toHaveBeenCalledWith("/doctor/cases/case-1/referrals/r1/opinion", { opinion: "Ablation is reasonable." });
  });

  it("sends the primary consultant's referral to the coordinator, never to a consultant directly", async () => {
    const load = vi.fn((path: string) => Promise.resolve(path.includes("/referrals") ? [] : consultants)) as unknown as Load;
    const mutate = vi.fn().mockResolvedValue({});
    renderWithWork(<ConsultantReferrals locale="en" caseId="case-1" careCategory="cardiology" categories={categories} canRefer busy={false} load={load} mutate={mutate}/>);
    fireEvent.click(await screen.findByRole("button", { name: "Refer this case" }));
    fireEvent.click(screen.getByRole("radio", { name: /Transfer/ }));
    fireEvent.change(screen.getByLabelText("Clinical reason for the referral"), { target: { value: "Needs electrophysiology" } });
    await screen.findByRole("option", { name: /Dr A/ });
    fireEvent.change(screen.getByLabelText("Suggested consultant (optional)"), { target: { value: "pr-a" } });
    fireEvent.click(screen.getByRole("button", { name: "Send to the coordinator" }));
    expect(mutate).toHaveBeenCalledWith("/doctor/cases/case-1/referrals", {
      type: "TRANSFER", clinicalReason: "Needs electrophysiology", suggestedCareArea: null, suggestedCapability: null, suggestedPractitionerId: "pr-a",
    });
  });
});
