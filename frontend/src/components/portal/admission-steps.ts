/**
 * The patient steps the admission block belongs to (P1-15); the backend decides which one applies. Kept apart so My Care
 * and the patient case view can test for them without loading the block.
 */
export const ADMISSION_STEPS: ReadonlySet<string> = new Set(["CONFIRM_ARRIVAL", "PAY_BALANCE", "WAIT_BALANCE_CHECK", "CLEARED_FOR_ADMISSION"]);
/** The patient steps the treatment block belongs to (P1-16): in treatment, and a change order awaiting their decision. */
export const TREATMENT_STEPS: ReadonlySet<string> = new Set(["IN_TREATMENT", "REVIEW_CHANGE_ORDER"]);
