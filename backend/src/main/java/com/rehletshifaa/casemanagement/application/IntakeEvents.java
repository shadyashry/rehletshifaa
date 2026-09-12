package com.rehletshifaa.casemanagement.application;

import java.util.UUID;

/**
 * In-process events raised by intake. Published synchronously inside the submitting transaction so
 * downstream modules (identity resolution, work routing) can react without intake depending on them.
 */
public final class IntakeEvents {
    private IntakeEvents() {}

    /** A draft case was submitted (DRAFT -> RECEIVED). */
    public record CaseSubmitted(UUID caseId) {}
}
