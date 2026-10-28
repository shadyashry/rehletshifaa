import { cleanup, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { refreshAfterRejectedAction } from "./portal-model";
import { RoleActions } from "./StaffCaseView";
import { renderWithWork } from "./test-copy";

const t = { operationsComplete: "Complete operational plan", financeApprove: "Approve commercial terms" } as never;
const c = { id: "case-1", caseNumber: "RS-1", status: "PROPOSAL_PREPARATION", patientName: "Patient", country: "AE", preferredLanguage: "en", createdAt: "2026-01-01", updatedAt: "2026-01-01", version: 1 };
const proposal = { proposalId: "p-1", versionId: "v-1", versionNumber: 1, status: "CLINICALLY_APPROVED", language: "en", currency: "EGP", items: [] };
const gates = { operationsRequired: true, operationsReason: "Travel", operationsCompleted: false, financeRequired: true, financeReasons: ["Manual"], financeCompleted: false, readyForRelease: false };

describe("server-authoritative proposal actions", () => {
  afterEach(cleanup);

  it("does not reconstruct Finance authority from gate booleans", () => {
    renderWithWork(<RoleActions role="finance" t={t} c={c} proposal={proposal} gates={{ ...gates, operationsRequired: false }} availableActions={[]} mutate={vi.fn()}/>);
    expect(screen.queryByRole("button", { name: /approve commercial terms/i })).toBeNull();
    cleanup();
    renderWithWork(<RoleActions role="finance" t={t} c={c} proposal={proposal} gates={{ ...gates, financeRequired: false }} availableActions={["APPROVE_COMMERCIAL_TERMS"]} mutate={vi.fn()}/>);
    expect(screen.getByRole("button", { name: /approve commercial terms/i })).toBeTruthy();
    // QA #20: when the action card carries the approval, there is no second button here.
    cleanup();
    renderWithWork(<RoleActions role="finance" t={t} c={c} proposal={proposal} gates={gates} availableActions={["APPROVE_COMMERCIAL_TERMS"]} mutate={vi.fn()} approvalInCard/>);
    expect(screen.queryByRole("button", { name: /approve commercial terms/i })).toBeNull();
  });

  it("does not reconstruct Operations authority from proposal status or gates", () => {
    renderWithWork(<RoleActions role="operations" t={t} c={c} proposal={proposal} gates={gates} availableActions={[]} mutate={vi.fn()}/>);
    expect(screen.queryByRole("button", { name: /complete operational plan/i })).toBeNull();
    cleanup();
    renderWithWork(<RoleActions role="operations" t={t} c={c} proposal={proposal} gates={{ ...gates, operationsRequired: false }} availableActions={["UPDATE_TRAVEL_PLAN"]} mutate={vi.fn()}/>);
    expect(screen.getByRole("button", { name: /complete operational plan/i })).toBeTruthy();
  });

  it("refreshes queue and workspace after a stale/direct API rejection", async () => {
    const refresh = vi.fn().mockResolvedValue(undefined);
    const reopen = vi.fn().mockResolvedValue(undefined);
    await refreshAfterRejectedAction("/finance/cases/case-1/proposals/v-1/approve", { caseSummary: c } as never, refresh, reopen);
    expect(refresh).toHaveBeenCalledOnce();
    expect(reopen).toHaveBeenCalledWith(c);
  });
});
