import type { LocalizedWorkCopy } from "@/components/portal/portal-copy";

/** `meanwhile`: P1-6 (D-02), on a waiting step, what the patient can usefully do while the team works. */
export type StepText = { title: string; body: string; next?: string; meanwhile?: string };

/** What decides how one step code reads: the stage, the proposal's state and document type, and the exit word the backend sent. */
export type StepContext = { proposalState: string | null; status: string; exit: string | null; documentType?: string | null };

/**
 * The patient's current step in the patient's own words, keyed by the backend's action code (and, where one code reads
 * two ways, the stage, proposal state or document type the backend also sent). Copy only — which code applies is never
 * decided here. My Care reads it for the patient; the coordinator's case cover reads the same words (UX area 2), so the
 * two sides of the file never say different things.
 */
export function patientStepText(code: string, steps: LocalizedWorkCopy["myCare"]["steps"], ctx: StepContext): StepText {
  const s = steps as Record<string, StepText>;
  switch (code) {
    case "WAIT_COORDINATOR_REVIEW": return ctx.status === "RECEIVED" ? s.WAIT_CASE_RECEIVED : s.WAIT_COORDINATOR_REVIEW;
    case "WAIT_PROPOSAL": return ctx.proposalState === "REVISION_REQUESTED" ? s.WAIT_PROPOSAL_REVISION : ctx.proposalState === "EXPIRED" ? s.WAIT_PROPOSAL_EXPIRED : s.WAIT_PROPOSAL;
    // A final quote is reviewed as a quote, never called an estimate.
    case "REVIEW_PROPOSAL": return ctx.documentType === "FINAL_TREATMENT_QUOTE" ? s.REVIEW_FINAL_QUOTE : s.REVIEW_PROPOSAL;
    case "PROVIDE_INFORMATION": case "COMPLETE_PROFILE": case "VERIFY_IDENTITY": case "WAIT_CONSULTANT_REVIEW":
    case "PAY_DEPOSIT": case "WAIT_PAYMENT_CHECK": case "WAIT_COORDINATION": case "WAIT_TREATMENT": case "IN_TREATMENT": case "GOING_HOME": case "FOLLOW_UP":
    case "CONFIRM_ARRIVAL": case "PAY_BALANCE": case "WAIT_BALANCE_CHECK": case "CLEARED_FOR_ADMISSION": case "REVIEW_CHANGE_ORDER": case "REPORT_OUTCOME": return s[code];
    default:
      // A journey that ended after acceptance says so with the backend's word for how (withdrawn, cancelled, expired, completed).
      if (ctx.exit && s[ctx.exit]) return s[ctx.exit];
      if (ctx.status === "DECLINED" || ctx.status === "CLINICALLY_NOT_SUITABLE") return s[ctx.status];
      if (ctx.status === "CLOSED" || ctx.status === "CANCELLED") return s.CLOSED;
      return s.NONE;
  }
}
