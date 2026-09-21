package com.rehletshifaa.journey;

import org.springframework.jdbc.core.JdbcTemplate;
import java.util.List;
import java.util.UUID;

/**
 * Legacy-vs-runtime business-outcome comparator (Phase 4B item E). A scenario is a case id plus, at each
 * checkpoint, the outcome the *actual* production {@code CaseTransitionPolicy}/{@code JourneyService}
 * contract requires — read from the code, never guessed — compared against what running the Journey
 * runtime path actually produced. Deterministic and test-friendly by construction: it only reads
 * already-committed-or-visible transaction state through plain SQL, the same tables every other Phase 4B
 * integration test asserts against.
 *
 * <p>Durability: scenarios and their expected snapshots are ordinary source-controlled Java (this class and
 * its callers), so they are versioned and repeatable across every CI run — the same durability model as
 * every other Phase 1–4B verification claim in this repository, which is recorded as a named, repeatable
 * test rather than a separate live database of results (see test-status.md).
 */
final class JourneyParityHarness {
    private JourneyParityHarness() {}

    enum Result {
        PASS, STATUS_MISMATCH, WORKITEM_MISMATCH, PATIENT_ACTION_MISMATCH, WAITING_ON_MISMATCH,
        ACTION_AVAILABILITY_MISMATCH, ASSIGNMENT_MISMATCH, DOMAIN_SIDE_EFFECT_MISMATCH,
        AUTHORIZATION_MISMATCH, RECOVERY_MISMATCH, BLOCKED
    }

    /** The business-outcome facts this harness compares, per journey-parity-status.md's required dimensions. */
    record CaseSnapshot(String status, String waitingOn, List<String> openInternalWorkTypes,
                        List<String> openPatientActionTypes, boolean hasActiveCoordinatorAssignment,
                        boolean hasActiveDoctorAssignment) {}

    record Expected(String scenario, String legacyStatus, String legacyWaitingOn, List<String> legacyOpenInternalWorkTypes,
                    List<String> legacyOpenPatientActionTypes, boolean legacyActiveCoordinatorAssignment,
                    boolean legacyActiveDoctorAssignment) {}

    static CaseSnapshot snapshot(JdbcTemplate jdbc, UUID caseId) {
        String status = jdbc.queryForObject("SELECT status FROM medical_cases WHERE id=?", String.class, caseId);
        String waitingOn = jdbc.queryForObject("SELECT waiting_on FROM medical_cases WHERE id=?", String.class, caseId);
        List<String> internal = jdbc.queryForList("SELECT task_type FROM case_tasks WHERE case_id=? AND visibility_scope='INTERNAL' AND status IN ('OPEN','IN_PROGRESS') ORDER BY task_type", String.class, caseId);
        List<String> patient = jdbc.queryForList("SELECT task_type FROM case_tasks WHERE case_id=? AND visibility_scope='PATIENT_ACTION' AND status IN ('OPEN','IN_PROGRESS') ORDER BY task_type", String.class, caseId);
        boolean coordinator = count(jdbc, caseId, "COORDINATOR") > 0;
        boolean doctor = count(jdbc, caseId, "DOCTOR") > 0;
        return new CaseSnapshot(status, waitingOn, internal, patient, coordinator, doctor);
    }

    private static int count(JdbcTemplate jdbc, UUID caseId, String role) {
        Integer n = jdbc.queryForObject("SELECT count(*) FROM case_assignments WHERE case_id=? AND assignee_role=? AND status IN ('PENDING','ACTIVE')", Integer.class, caseId, role);
        return n == null ? 0 : n;
    }

    /** Compares the actual runtime snapshot against the documented legacy expectation for one checkpoint. */
    static Result compare(Expected expected, CaseSnapshot actual) {
        if (!expected.legacyStatus().equals(actual.status())) return Result.STATUS_MISMATCH;
        if (!expected.legacyWaitingOn().equals(actual.waitingOn())) return Result.WAITING_ON_MISMATCH;
        if (!expected.legacyOpenInternalWorkTypes().equals(actual.openInternalWorkTypes())) return Result.WORKITEM_MISMATCH;
        if (!expected.legacyOpenPatientActionTypes().equals(actual.openPatientActionTypes())) return Result.PATIENT_ACTION_MISMATCH;
        if (expected.legacyActiveCoordinatorAssignment() != actual.hasActiveCoordinatorAssignment()
                || expected.legacyActiveDoctorAssignment() != actual.hasActiveDoctorAssignment()) return Result.ASSIGNMENT_MISMATCH;
        return Result.PASS;
    }
}
