/**
 * The patient steps the admission block belongs to (P1-15); the backend decides which one applies. Kept apart so My Care
 * and the patient case view can test for them without loading the block.
 */
export const ADMISSION_STEPS: ReadonlySet<string> = new Set(["CONFIRM_ARRIVAL", "PAY_BALANCE", "WAIT_BALANCE_CHECK", "CLEARED_FOR_ADMISSION"]);
/** The patient steps the treatment block belongs to (P1-16): in treatment, and a change order awaiting their decision. */
export const TREATMENT_STEPS: ReadonlySet<string> = new Set(["IN_TREATMENT", "REVIEW_CHANGE_ORDER"]);
/** The patient steps the "Going home" block belongs to (P1-17): discharged, then follow-up (the statement is issued at settlement). */
export const DISCHARGE_STEPS: ReadonlySet<string> = new Set(["GOING_HOME", "FOLLOW_UP"]);
/** The patient steps the follow-up block belongs to (P1-18): in follow-up, and an outcome question to answer (also once closed). */
export const FOLLOW_UP_STEPS: ReadonlySet<string> = new Set(["FOLLOW_UP", "REPORT_OUTCOME"]);
/**
 * P1-18: the version of the purpose notice shown above the outcome questions; the backend refuses any other
 * (`FollowUpService.OUTCOME_NOTICE_VERSION`). Change both, and the notice's words, together.
 */
export const OUTCOME_NOTICE_VERSION = "outcome-notice-2026-10";
