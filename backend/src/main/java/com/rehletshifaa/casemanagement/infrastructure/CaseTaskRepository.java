package com.rehletshifaa.casemanagement.infrastructure;

import com.rehletshifaa.casemanagement.domain.CaseTask;
import com.rehletshifaa.shared.persistence.BaseRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;
import java.util.UUID;

/** Task changes, each guarded by the task state (and, for staff edits, the version) the caller saw. */
public interface CaseTaskRepository extends BaseRepository<CaseTask, UUID> {
    boolean existsByCaseIdAndBlockingTrueAndStatusIn(UUID caseId, java.util.Collection<String> statuses);

    /** Open blocking work of one visibility scope (who has the ball). */
    boolean existsByCaseIdAndBlockingTrueAndVisibilityScopeAndStatusIn(UUID caseId, String visibilityScope,
                                                                      java.util.Collection<String> statuses);

    /** Open blocking work of one visibility scope owned by a role. */
    boolean existsByCaseIdAndBlockingTrueAndVisibilityScopeAndOwnerRoleAndStatusIn(UUID caseId, String visibilityScope, String ownerRole,
                                                                                  java.util.Collection<String> statuses);

    boolean existsByCaseIdAndVisibilityScopeAndOwnerRoleAndStatusIn(UUID caseId, String visibilityScope, String ownerRole,
                                                                    java.util.Collection<String> statuses);

    /** The newest open internal work item of a type on the case (pass {@code Limit.of(1)}). */
    @Query("""
            select t.id from CaseTask t
            where t.caseId = :caseId and t.taskType = :type and t.visibilityScope = 'INTERNAL' and t.status in ('OPEN', 'IN_PROGRESS')
            order by t.createdAt desc""")
    java.util.List<UUID> findOpenInternalOfType(@Param("caseId") UUID caseId, @Param("type") String type,
                                                org.springframework.data.domain.Limit limit);

    /** One row of a staff member's work queue: the task with the case facts needed to act on it. */
    interface OpenWorkRow {
        UUID getId(); UUID getCaseId(); String getTaskType(); String getTitle(); String getDescription(); String getPriority();
        String getStatus(); Boolean getBlocking(); Instant getDueAt(); Instant getCreatedAt(); Long getVersion();
        String getCaseNumber(); com.rehletshifaa.casemanagement.domain.CaseStatus getCaseStatus(); String getWaitingOn();
        String getCareCategory(); String getPatientName();
    }

    /** Open work owned by the subject: most urgent first, then soonest due (undated last), then oldest. */
    @Query("""
            select t.id as id, t.caseId as caseId, t.taskType as taskType, t.title as title, t.description as description,
                t.priority as priority, t.status as status, t.blocking as blocking, t.dueAt as dueAt, t.createdAt as createdAt,
                t.version as version, c.caseNumber as caseNumber, c.status as caseStatus, c.waitingOn as waitingOn,
                c.careCategory as careCategory, trim(concat(p.givenName, ' ', coalesce(p.familyName, ''))) as patientName
            from CaseTask t join MedicalCase c on c.id = t.caseId left join PatientProfile p on p.id = c.patientId
            where t.ownerSubject = :owner and t.status in ('OPEN', 'IN_PROGRESS')
            order by case t.priority when 'URGENT' then 0 when 'HIGH' then 1 when 'NORMAL' then 2 else 3 end,
                t.dueAt nulls last, t.createdAt""")
    java.util.List<OpenWorkRow> findOpenWorkOf(@Param("owner") String owner);

    /** The signed-in patient owns this patient action of their own (unmerged) case. */
    @Query("""
            select count(t) > 0 from CaseTask t join MedicalCase c on c.id = t.caseId join PatientProfile p on p.id = c.patientId
            where t.id = :taskId and t.caseId = :caseId and t.visibilityScope = 'PATIENT_ACTION' and p.externalSubject = :subject
            and p.mergedIntoPatientId is null""")
    boolean isPatientActionOf(@Param("taskId") UUID taskId, @Param("caseId") UUID caseId, @Param("subject") String subject);

    @Query("""
            select count(t) > 0 from CaseTask t join MedicalCase c on c.id = t.caseId
            where t.id = :taskId and t.caseId = :caseId and t.visibilityScope = 'PATIENT_ACTION' and c.patientId = :patientId""")
    boolean isPatientActionOfPatient(@Param("taskId") UUID taskId, @Param("caseId") UUID caseId, @Param("patientId") UUID patientId);

    long countByOwnerSubjectAndStatusIn(String ownerSubject, java.util.Collection<String> statuses);

    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("""
            update CaseTask t set t.status = 'IN_PROGRESS', t.startedAt = :now, t.updatedAt = :now, t.version = t.version + 1
            where t.id = :id and t.caseId = :caseId and t.ownerSubject = :owner and t.status = 'OPEN' and t.version = :version""")
    int start(@Param("id") UUID id, @Param("caseId") UUID caseId, @Param("owner") String owner, @Param("version") long version,
              @Param("now") Instant now);

    /** The owner completes their task at the version they saw. */
    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("""
            update CaseTask t set t.status = 'COMPLETED', t.completedAt = :now, t.completionEvidence = :evidence, t.updatedAt = :now,
                t.version = t.version + 1
            where t.id = :id and t.caseId = :caseId and t.version = :version and t.status in ('OPEN', 'IN_PROGRESS') and t.ownerSubject = :owner""")
    int completeOwned(@Param("id") UUID id, @Param("caseId") UUID caseId, @Param("version") long version, @Param("owner") String owner,
                      @Param("evidence") String evidence, @Param("now") Instant now);

    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("""
            update CaseTask t set t.status = 'COMPLETED', t.completedAt = :now, t.completionEvidence = :evidence, t.updatedAt = :now,
                t.version = t.version + 1
            where t.id = :id and t.status in ('OPEN', 'IN_PROGRESS')""")
    int complete(@Param("id") UUID id, @Param("evidence") String evidence, @Param("now") Instant now);

    /** The patient completes one of their own actions on the case. */
    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("""
            update CaseTask t set t.status = 'COMPLETED', t.completedAt = :now, t.completionEvidence = :evidence, t.updatedAt = :now,
                t.version = t.version + 1
            where t.id = :id and t.caseId = :caseId and t.visibilityScope = 'PATIENT_ACTION' and t.status in ('OPEN', 'IN_PROGRESS')""")
    int completePatientAction(@Param("id") UUID id, @Param("caseId") UUID caseId, @Param("evidence") String evidence, @Param("now") Instant now);

    /** Closes every open internal work item of one type on the case. */
    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("""
            update CaseTask t set t.status = 'COMPLETED', t.completedAt = :now, t.completionEvidence = :evidence, t.updatedAt = :now,
                t.version = t.version + 1
            where t.caseId = :caseId and t.taskType = :type and t.visibilityScope = 'INTERNAL' and t.status in ('OPEN', 'IN_PROGRESS')""")
    int completeOpenOfType(@Param("caseId") UUID caseId, @Param("type") String type, @Param("evidence") String evidence, @Param("now") Instant now);

    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("""
            update CaseTask t set t.status = 'CANCELLED', t.cancelledAt = :now, t.cancellationReason = :reason, t.updatedAt = :now,
                t.version = t.version + 1
            where t.id = :id and t.caseId = :caseId and t.version = :version and t.status in ('OPEN', 'IN_PROGRESS')""")
    int cancel(@Param("id") UUID id, @Param("caseId") UUID caseId, @Param("version") long version, @Param("reason") String reason,
               @Param("now") Instant now);

    /** Gives the task to another owner; it starts again as OPEN. */
    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("""
            update CaseTask t set t.ownerSubject = :owner, t.ownerRole = :role, t.visibilityScope = :visibility, t.status = 'OPEN',
                t.startedAt = null, t.updatedAt = :now, t.version = t.version + 1
            where t.id = :id and t.caseId = :caseId and t.version = :version and t.status in ('OPEN', 'IN_PROGRESS')""")
    int reassign(@Param("id") UUID id, @Param("caseId") UUID caseId, @Param("version") long version, @Param("owner") String owner,
                 @Param("role") String role, @Param("visibility") String visibility, @Param("now") Instant now);

    /** An existing work item is re-raised: it keeps its owner, or takes this one if it had none. */
    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("""
            update CaseTask t set t.ownerSubject = coalesce(t.ownerSubject, cast(:owner as String)), t.updatedAt = :now, t.version = t.version + 1
            where t.id = :id""")
    int adoptOwner(@Param("id") UUID id, @Param("owner") String owner, @Param("now") Instant now);

    /** A patient action asked for again: a new message (if any) replaces the old one. */
    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("""
            update CaseTask t set t.description = coalesce(cast(:description as String), t.description), t.blocking = :blocking, t.dueAt = :dueAt,
                t.updatedAt = :now, t.version = t.version + 1
            where t.id = :id""")
    int renewPatientAction(@Param("id") UUID id, @Param("description") String description, @Param("blocking") boolean blocking,
                           @Param("dueAt") Instant dueAt, @Param("now") Instant now);

    /** Records which coordination team queue holds the task; the first queueing time is kept. */
    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("""
            update CaseTask t set t.coordinationTeamId = :team, t.coordinationQueueReason = :reason,
                t.coordinationQueuedAt = coalesce(t.coordinationQueuedAt, cast(:now as Instant))
            where t.id = :id""")
    int queue(@Param("id") UUID id, @Param("team") UUID team, @Param("reason") String reason, @Param("now") Instant now);

    /** Moves the open coordinator work of the previous owner (or unowned) to the new coordinator. */
    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("""
            update CaseTask t set t.ownerSubject = :owner, t.updatedAt = :now, t.version = t.version + 1
            where t.caseId = :caseId and t.ownerRole = 'COORDINATOR' and t.visibilityScope = 'INTERNAL' and t.status in ('OPEN', 'IN_PROGRESS')
            and (t.ownerSubject is null or t.ownerSubject = :previous)""")
    int handOverCoordinatorWork(@Param("caseId") UUID caseId, @Param("owner") String owner, @Param("previous") String previous,
                                @Param("now") Instant now);
}
