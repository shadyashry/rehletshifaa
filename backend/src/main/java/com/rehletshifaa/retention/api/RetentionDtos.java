package com.rehletshifaa.retention.api;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

/** P1-7 retention: the policies, the purge log and subject erasure. Codes are stable; the UI words them. */
public final class RetentionDtos {
    private RetentionDtos() {}

    /**
     * One record class's policy. {@code retentionDays} null = kept (no term set, or nothing personal); {@code enforced} = a purge
     * handler runs for it nightly (a class with days but not enforced is classified, its handler not built yet); {@code tables} =
     * the tables in the class.
     */
    public record PolicyView(String recordClass, Integer retentionDays, String anchor, boolean legalHold, boolean enforced, String basis,
                             Instant lastPurgedAt, List<String> tables) {}

    /** Per class over the period: purges, rows, files and bytes removed, and the latest purge. */
    public record ClassTotalsView(String recordClass, long purges, long rowsAffected, long filesDeleted, long bytesDeleted, Instant lastPurgedAt) {}

    /**
     * One purge. {@code subjectType}: DRAFT_CASE (subjectId = case, caseNumber shown), TRANSPORT_BATCH (no subject), PATIENT (an erasure;
     * subjectId = the pseudonymised patient, {@code requestReference} = where the person asked). {@code cause}: SCHEDULE or
     * ERASURE_REQUEST. {@code actor}: "SYSTEM" or the staff subject who erased.
     */
    public record PurgeView(UUID id, String recordClass, String subjectType, UUID subjectId, String caseNumber, String cause, Integer policyDays,
                            int rowsAffected, int filesDeleted, long bytesDeleted, String actor, String requestReference, Instant purgedAt) {}

    /** The purge log over [from, to): totals per class and the purges newest first (at most {@code limit}; {@code truncated} if more). */
    public record PurgeLogView(Instant from, Instant to, List<ClassTotalsView> totals, List<PurgeView> purges, boolean truncated) {}

    /** An erasure request: the case number the person is known by, and where and when they asked (no health data). */
    public record ErasureRequest(@NotBlank @Size(max = 20) String caseNumber, @NotBlank @Size(max = 200) String reference) {}

    /** A case of the person as erasure sees it: a DRAFT is purged; any other is kept under the pseudonym. */
    public record ErasureCaseView(String caseNumber, String status, boolean draft, boolean purged) {}

    /**
     * What an erasure of the person behind {@code caseNumber} would do. {@code blockers}: codes that refuse it now (ERASURE_ALREADY_DONE,
     * ERASURE_PATIENT_MERGED, ERASURE_CASE_ACTIVE, ERASURE_INCIDENT_OPEN, ERASURE_CONVERSATION_OPEN, ERASURE_REPRESENTS_OTHERS,
     * ERASURE_ON_HOLD); empty = it can run. {@code hasAccount}: the sign-in account is removed too.
     */
    public record ErasurePreview(UUID patientId, List<ErasureCaseView> cases, boolean hasAccount, List<String> blockers, Instant erasedAt) {}

    /** The erasure done: the purge log row, what was kept and removed, and whether the account removal was queued. */
    public record ErasureResult(UUID purgeId, UUID patientId, Instant erasedAt, int casesKept, int draftsPurged, int rowsAffected, int filesDeleted,
                                boolean accountRemovalQueued) {}
}
