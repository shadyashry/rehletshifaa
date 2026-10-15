/**
 * The patient steps the admission block belongs to (P1-15); the backend decides which one applies. Kept apart so My Care
 * and the patient case view can test for them without loading the block.
 */
export const ADMISSION_STEPS: ReadonlySet<string> = new Set(["CONFIRM_ARRIVAL", "PAY_BALANCE", "WAIT_BALANCE_CHECK", "CLEARED_FOR_ADMISSION"]);
/** The patient steps the treatment block belongs to (P1-16): in treatment, and a change order awaiting their decision. */
export const TREATMENT_STEPS: ReadonlySet<string> = new Set(["IN_TREATMENT", "REVIEW_CHANGE_ORDER"]);
/** The patient steps the "Going home" block belongs to (P1-17): discharged, then follow-up (the statement is issued at settlement). */
export const DISCHARGE_STEPS: ReadonlySet<string> = new Set(["GOING_HOME", "FOLLOW_UP"]);
