package com.rehletshifaa.journey.application;

import java.util.UUID;

/**
 * In-process domain events for the moments that may move an accepted case towards treatment
 * coordination. Published synchronously inside the publishing transaction and handled by
 * {@link CaseHandoffService}, so the money and readiness services never call the handoff directly —
 * that is what lets the handoff validate against the shared {@link CaseTransitionPolicy} without a
 * dependency cycle.
 */
public final class CaseEvents {
    private CaseEvents() {}

    /** A coordination deposit was raised on an accepted case and must be arranged offline. */
    public record DepositRequired(UUID caseId) {}

    /** The patient entered the bank's transaction reference for their deposit transfer: Finance verifies it (DEP-3). */
    public record TransferReported(UUID caseId) {}

    /** Finance confirmed a transfer reference and recorded the amount received (the deposit may still have a balance). */
    public record TransferConfirmed(UUID caseId) {}

    /** Finance could not confirm the transfer reference: the payment step returns to the patient with the reason. */
    public record TransferRejected(UUID caseId) {}

    /** The deposit was authoritatively settled (paid in full, or waived by an authorized actor). */
    public record DepositSettled(UUID caseId) {}

    /** A step only the patient could complete (profile, contact, consents, onboarding) just changed. */
    public record PatientReadinessChanged(UUID caseId) {}

    /** P1-15: the patient accepted a final treatment quote; the admission voucher is issued against it when the letter is checked. */
    public record FinalQuoteAccepted(UUID caseId, UUID versionId) {}

    /**
     * P1-15: something the admission gate reads changed (a voucher issued, a receipt countersigned, the fee balance received,
     * procedure consent captured, an emergency override): the handoff tries ARRIVAL_CONFIRMED to ADMISSION_READY under the policy.
     */
    public record AdmissionEvidenceChanged(UUID caseId) {}

    /**
     * P1-16: the treatment episode moved the case into TREATMENT_IN_PROGRESS (the Consultant, with the hospital's admission
     * number). {@link TreatmentMilestoneService} records the {@code ADMITTED} milestone and starts the Consultant's milestone clock.
     */
    public record TreatmentStarted(UUID caseId, String subject) {}

    /**
     * P1-17: evidence the discharge gate or the settlement gate reads changed (a pack item, the follow-up plan, the final invoice,
     * a countersigned milestone or interim bill, a settled change order, the settled reconciliation). {@link DischargeService} tries
     * TREATMENT_IN_PROGRESS -> DISCHARGED and then DISCHARGED -> FOLLOW_UP, each only when its gate passes. Synchronous: it runs
     * inside the publisher's transaction.
     */
    public record DischargeEvidenceChanged(UUID caseId) {}

    /**
     * Work, an assignment, the proposal's sign-offs or who has the ball changed on the case: the stage's own steps are
     * re-derived ({@link CaseActionService#syncStageWork}) so every step someone owes is in their My work (QA A3).
     */
    public record WorkChanged(UUID caseId) {}
}
