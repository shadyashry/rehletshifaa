package com.rehletshifaa.security;

public enum ActorRole {
    PATIENT, PATIENT_REPRESENTATIVE, COORDINATOR, COORDINATOR_LEAD, DOCTOR,
    OPERATIONS, FINANCE, CREDENTIALING_ADMIN, SYSTEM_ADMIN, AUDITOR,
    // Narrowly-scoped reviewer for patient legal-identity proofing. Distinct from
    // CREDENTIALING_ADMIN, which is for practitioner credentialing and must not be reused here.
    PATIENT_IDENTITY_REVIEWER
}
