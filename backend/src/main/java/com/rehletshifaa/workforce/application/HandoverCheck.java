package com.rehletshifaa.workforce.application;

import java.util.List;

/**
 * Responsibilities a case-side module still assigns to a person, which must be handed over before their offboarding can
 * complete. Implemented by the owning modules so platform access governance never depends on the case workflow (ACG-06).
 */
public interface HandoverCheck {
    record Pending(String code, long count, String detail) {}

    /** Only what still needs handing over; empty when the person holds nothing here. */
    List<Pending> pending(String subject);
}
