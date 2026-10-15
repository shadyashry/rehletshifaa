package com.rehletshifaa.casemanagement.domain;

/**
 * The patient's age band (review 2026-10-14, A-05; P1-13), captured when the case is sent. A band, not a date of birth:
 * intake asks for the least that changes what the platform must do. The two minor bands mean the patient cannot consent
 * alone, so onboarding requires a GUARDIAN delegation with verified evidence and the guardian consent text. A case whose
 * band was never stated (null) is treated as an adult until the coordinator records it in intake review.
 */
public enum AgeBand {
    UNDER_12(true), AGE_12_17(true), AGE_18_64(false), AGE_65_PLUS(false);

    private final boolean minor;

    AgeBand(boolean minor) { this.minor = minor; }

    public boolean minor() { return minor; }

    /** The band named by an API value, or null when none was given. Bean validation has already limited the values. */
    public static AgeBand parseOrNull(String value) { return value == null || value.isBlank() ? null : valueOf(value.trim()); }

    /** True for a band that needs a guardian; a missing band does not. */
    public static boolean isMinor(AgeBand band) { return band != null && band.minor; }
}
