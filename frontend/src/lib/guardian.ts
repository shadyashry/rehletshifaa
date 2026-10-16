/**
 * P1-13 (A-05): minors and their guardians. The backend decides who owes what (readiness blockers); these are only the
 * names the portal renders them by.
 */

/** The readiness blockers the guardian clears from My Care, in the order the backend asks for them. */
export const GUARDIAN_STEP_CODES = ["MINOR_REQUIRES_GUARDIAN", "GUARDIAN_AUTH_MISSING", "GUARDIAN_EVIDENCE_MISSING"] as const;
export const isGuardianStep = (code: string | null | undefined) => (GUARDIAN_STEP_CODES as readonly string[]).includes(code ?? "");

export const LEGAL_BASES = ["PARENT", "LEGAL_GUARDIAN", "COURT_ORDER"] as const;
export type LegalBasis = (typeof LEGAL_BASES)[number];

export const GUARDIAN_CONSENT = "GUARDIAN_AUTHORIZATION";
/**
 * The policy version the guardian consent is recorded under. It names the wording as a placeholder (counsel and a native
 * Arabic reader replace `guardianConsent.text`); it must equal `PatientActivationService.GUARDIAN_CONSENT_VERSION`, and both
 * change together when the final wording ships so earlier consents can be found and asked again.
 */
export const GUARDIAN_CONSENT_VERSION = "guardian-v0-placeholder";
