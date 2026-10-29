import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

import { CaseBlockers } from "./CaseBlockers";
import type { BlockerView } from "./CurrentAction";

const blocker = (owner: BlockerView["owner"]): BlockerView => ({ code: "DEPOSIT_UNPAID", labelEn: "Coordination deposit", labelAr: "وديعة التنسيق", owner, gating: true });
const deposit = { status: "REQUESTED", currency: "USD", totalDisplay: 60, paidDisplay: 0, balanceDisplay: 60 };
const line = () => screen.getByText("Coordination deposit").nextElementSibling?.textContent;

/** QA W-22: the deposit line says where the payment stands (DEP-3), never "to arrange with the patient". */
describe("CaseBlockers deposit line", () => {
  afterEach(cleanup);

  it("follows the payment from the patient to Finance and back", () => {
    render(<CaseBlockers locale="en" blockers={[blocker("PATIENT")]} deposit={deposit}/>);
    expect(line()).toBe("Requested · $60 · waiting for the patient's payment");
    cleanup();
    render(<CaseBlockers locale="en" blockers={[blocker("STAFF")]} deposit={{ ...deposit, transfer: { status: "SUBMITTED" } }}/>);
    expect(line()).toBe("Transfer reference received · Finance is checking it");
    cleanup();
    render(<CaseBlockers locale="en" blockers={[blocker("PATIENT")]} deposit={{ ...deposit, transfer: { status: "REJECTED" } }}/>);
    expect(line()).toBe("Reference not confirmed · waiting for the patient to resend it");
    cleanup();
    render(<CaseBlockers locale="en" blockers={[blocker("PATIENT")]} deposit={{ ...deposit, status: "PARTIALLY_PAID", balanceDisplay: 25 }}/>);
    expect(line()).toBe("Partially paid · $25 · still due from the patient");
    expect(screen.queryByText(/to arrange with the patient/)).toBeNull();
  });

  it("words Finance's check in Arabic", () => {
    render(<CaseBlockers locale="ar" blockers={[blocker("STAFF")]} deposit={{ ...deposit, transfer: { status: "SUBMITTED" } }}/>);
    expect(screen.getByText("وصل الرقم المرجعي للتحويل · يتحقّق منه الفريق المالي")).toBeTruthy();
  });
});
