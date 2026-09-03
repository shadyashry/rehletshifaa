package com.rehletshifaa.casemanagement.domain;

/**
 * Canonical, authoritative case lifecycle. The allowed transitions between these states are
 * enforced server-side in {@code JourneyService}; every UI control must derive from or stay
 * synchronized with that model. Legacy values (NEW, COORDINATOR_REVIEW, RECOMMENDATION_READY,
 * TREATMENT_COORDINATION, CLAIM_PENDING, PROPOSAL_READY) were removed via migration V6.
 */
public enum CaseStatus {
    DRAFT, RECEIVED, INTAKE_REVIEW, INFORMATION_REQUIRED,
    READY_FOR_CONSULTANT, CONSULTANT_ASSIGNMENT_PENDING, CONSULTANT_REVIEW,
    CLINICAL_RECOMMENDATION_READY, PROPOSAL_PREPARATION, PROPOSAL_INTERNAL_APPROVAL,
    PATIENT_DECISION, REVISION_REQUESTED, ACCEPTED, DECLINED, EXPIRED,
    CLINICALLY_NOT_SUITABLE, TRAVEL_COORDINATION, ARRIVAL_CONFIRMED,
    TREATMENT_IN_PROGRESS, DISCHARGED, FOLLOW_UP, CLOSED, CANCELLED
}
