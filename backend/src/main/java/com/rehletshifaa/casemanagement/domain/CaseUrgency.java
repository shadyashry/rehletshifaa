package com.rehletshifaa.casemanagement.domain;

/**
 * How soon a case needs clinical attention, as its coordinator judged it (review 2026-10-14, A-02). A case starts
 * {@link #ROUTINE}; only a coordinator changes it, always with a reason. The CHECK constraints in V88 mirror this list.
 * The level never replaces local emergency care: the patient is told to seek it whatever the level.
 */
public enum CaseUrgency {
    /** The normal queue order and promises. */
    ROUTINE,
    /** Sooner than routine; shown to staff, no automatic change to the work. */
    PRIORITY,
    /** Time-critical: the case's work is HIGH, its coordinator's leads are alerted and routing ties favour cover now. */
    URGENT;

    public boolean urgent() { return this == URGENT; }
}
