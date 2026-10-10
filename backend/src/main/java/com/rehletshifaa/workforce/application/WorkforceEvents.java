package com.rehletshifaa.workforce.application;

/** Workforce facts other modules react to inside the same transaction. */
public final class WorkforceEvents {
    private WorkforceEvents() {}

    /**
     * Someone's authority shrank now: sign-in disabled, offboarding started, or a role removed. Modules release what only
     * an active holder may keep (patient conversations, reply covers). Listeners re-check the current facts, so a
     * reduction that leaves the person's role intact changes nothing and a repeated event is harmless.
     */
    public record StaffAccessReduced(String subject, String actor, String reason) {}
}
