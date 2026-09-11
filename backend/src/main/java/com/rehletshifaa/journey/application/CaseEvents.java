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

    /** The deposit was authoritatively settled (paid in full, or waived by an authorized actor). */
    public record DepositSettled(UUID caseId) {}

    /** A step only the patient could complete (profile, contact, consents, onboarding) just changed. */
    public record PatientReadinessChanged(UUID caseId) {}
}
