package com.rehletshifaa.security;

public enum ActorRole {
    PATIENT, PATIENT_REPRESENTATIVE, COORDINATOR, COORDINATOR_LEAD, DOCTOR,
    // Base staff roles are listed before their _LEAD variant so primaryRole() (lowest ordinal)
    // reports the base function for audit/sender labels. The _LEAD realm roles are composite and
    // include their base role, so a lead satisfies every base-role authorization automatically.
    OPERATIONS, OPERATIONS_LEAD, FINANCE, FINANCE_LEAD, CREDENTIALING_ADMIN, SYSTEM_ADMIN, AUDITOR,
    // Narrowly-scoped reviewer for patient legal-identity proofing. Distinct from
    // CREDENTIALING_ADMIN, which is for practitioner credentialing and must not be reused here.
    PATIENT_IDENTITY_REVIEWER
}
