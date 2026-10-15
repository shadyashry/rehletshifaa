/**
 * The patient steps the admission block belongs to (P1-15); the backend decides which one applies. Kept apart so My Care
 * and the patient case view can test for them without loading the block.
 */
export const ADMISSION_STEPS: ReadonlySet<string> = new Set(["CONFIRM_ARRIVAL", "PAY_BALANCE", "WAIT_BALANCE_CHECK", "CLEARED_FOR_ADMISSION"]);
