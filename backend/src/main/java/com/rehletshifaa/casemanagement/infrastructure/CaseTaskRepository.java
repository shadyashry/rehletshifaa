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

    /** The newest open patient action of a type on the case (pass {@code Limit.of(1)}). */
    @Query("""
            select t.id from CaseTask t
            where t.caseId = :caseId and t.taskType = :type and t.visibilityScope = 'PATIENT_ACTION' and t.status in ('OPEN', 'IN_PROGRESS')
            order by t.createdAt desc""")
    java.util.List<UUID> findOpenPatientActionOfType(@Param("caseId") UUID caseId, @Param("type") String type,
                                                     org.springframework.data.domain.Limit limit);

    /** A patient action as the patient sees it (title and message stay encrypted). */
    interface PatientActionRow { UUID getId(); String getTitle(); String getDescription(); Boolean getBlocking(); Instant getDueAt(); }

    /** The newest open patient action of a type on the case, as shown to the patient (pass {@code Limit.of(1)}). */
    @Query("""
            select t.id as id, t.title as title, t.description as description, t.blocking as blocking, t.dueAt as dueAt
            from CaseTask t
            where t.caseId = :caseId and t.taskType = :type and t.visibilityScope = 'PATIENT_ACTION' and t.status in ('OPEN', 'IN_PROGRESS')
            order by t.createdAt desc""")
    java.util.List<PatientActionRow> findOpenPatientActionRowsOfType(@Param("caseId") UUID caseId, @Param("type") String type,
                                                                     org.springframework.data.domain.Limit limit);

    interface CaseWorkRow { UUID getId(); String getTaskType(); String getTitle(); String getDescription(); Instant getDueAt(); Long getVersion(); }

    /** The subject's open internal work on one case: blocking first, then most urgent, then oldest (pass {@code Limit.of(1)}). */
    @Query("""
            select t.id as id, t.taskType as taskType, t.title as title, t.description as description, t.dueAt as dueAt, t.version as version
            from CaseTask t
            where t.caseId = :caseId and t.ownerSubject = :owner and t.visibilityScope = 'INTERNAL' and t.status in ('OPEN', 'IN_PROGRESS')
            order by case when t.blocking = true then 0 else 1 end,
                case t.priority when 'URGENT' then 0 when 'HIGH' then 1 when 'NORMAL' then 2 else 3 end, t.createdAt""")
    java.util.List<CaseWorkRow> findOpenInternalWorkOf(@Param("caseId") UUID caseId, @Param("owner") String owner,
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

    /** A task as the case page and task lists show it (title and description still encrypted). */
    interface TaskRow {
        UUID getId(); UUID getCaseId(); String getTaskType(); String getTitle(); String getDescription(); String getOwnerSubject();
        String getOwnerRole(); String getVisibilityScope(); String getPriority(); String getStatus(); Boolean getBlocking(); Instant getDueAt();
        Long getVersion();
    }

    String TASK_ROW = """
            select t.id as id, t.caseId as caseId, t.taskType as taskType, t.title as title, t.description as description,
                t.ownerSubject as ownerSubject, t.ownerRole as ownerRole, t.visibilityScope as visibilityScope, t.priority as priority,
                t.status as status, t.blocking as blocking, t.dueAt as dueAt, t.version as version
            from CaseTask t
            """;

    @Query(TASK_ROW + "where t.caseId = :caseId order by t.createdAt")
    java.util.List<TaskRow> findRowsOf(@Param("caseId") UUID caseId);

    @Query(TASK_ROW + "where t.caseId = :caseId and t.visibilityScope = :scope order by t.createdAt")
    java.util.List<TaskRow> findRowsOf(@Param("caseId") UUID caseId, @Param("scope") String scope);

    /** Open tasks owned by the subject: most urgent first, then soonest due (undated last), then oldest. */
    @Query(TASK_ROW + """
            where t.ownerSubject = :owner and t.status in ('OPEN', 'IN_PROGRESS')
            order by case t.priority when 'URGENT' then 0 when 'HIGH' then 1 when 'NORMAL' then 2 else 3 end,
                t.dueAt nulls last, t.createdAt""")
    java.util.List<TaskRow> findOpenRowsOwnedBy(@Param("owner") String owner);

    @Query("select t.ownerSubject from CaseTask t where t.id = :id and t.caseId = :caseId")
    java.util.Optional<String> findOwnerSubject(@Param("id") UUID id, @Param("caseId") UUID caseId);

    /** The queue signals of a case's open internal work; cases without any are absent. */
    interface WorkSignals {
        UUID getCaseId(); Long getOpenCount(); Long getOverdueCount(); Long getBlockingOverdueCount(); Long getHighPriorityCount();
        Long getPatientResponseCount(); Instant getNextDue();
    }

    @Query("""
            select t.caseId as caseId, count(t) as openCount,
                sum(case when t.dueAt is not null and t.dueAt < :now then 1 else 0 end) as overdueCount,
                sum(case when t.blocking = true and t.dueAt is not null and t.dueAt < :now then 1 else 0 end) as blockingOverdueCount,
                sum(case when t.priority in ('URGENT', 'HIGH') then 1 else 0 end) as highPriorityCount,
                sum(case when t.taskType = 'REVIEW_PATIENT_RESPONSE' then 1 else 0 end) as patientResponseCount,
                min(case when t.dueAt is not null and t.dueAt >= :now then t.dueAt end) as nextDue
            from CaseTask t
            where t.caseId in :caseIds and t.status in ('OPEN', 'IN_PROGRESS') and t.visibilityScope = 'INTERNAL'
            group by t.caseId""")
    java.util.List<WorkSignals> findWorkSignals(@Param("caseIds") java.util.Collection<UUID> caseIds, @Param("now") Instant now);

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

    /** The case waits, unowned, in the coordination routing queue. */
    @Query("""
            select count(t) > 0 from CaseTask t where t.caseId = :caseId and t.taskType = 'COORDINATION_ROUTING'
                and t.status in ('OPEN', 'IN_PROGRESS') and t.ownerSubject is null""")
    boolean isQueuedForRouting(@Param("caseId") UUID caseId);

    /** Cases queued automatically (not a manager's explicit QUEUE), by case id (use with {@code Limit.of(100)}). */
    @Query("""
            select distinct t.caseId from CaseTask t where t.taskType = 'COORDINATION_ROUTING' and t.status in ('OPEN', 'IN_PROGRESS')
                and t.ownerSubject is null and t.coordinationQueueReason <> 'MANUAL_QUEUE'
            order by t.caseId""")
    java.util.List<UUID> findRetryableRoutingCases(org.springframework.data.domain.Limit limit);

    /** An unowned coordination routing queue item with its case number. */
    interface RoutingQueueRow {
        UUID getCaseId(); String getCaseNumber(); UUID getTaskId(); UUID getTeam(); String getReason(); Instant getQueuedAt(); Instant getDueAt();
    }

    /** The routing queue, earliest due first. */
    @Query("""
            select t.caseId as caseId, c.caseNumber as caseNumber, t.id as taskId, t.coordinationTeamId as team,
                t.coordinationQueueReason as reason, t.coordinationQueuedAt as queuedAt, t.dueAt as dueAt
            from CaseTask t join MedicalCase c on c.id = t.caseId
            where t.taskType = 'COORDINATION_ROUTING' and t.status in ('OPEN', 'IN_PROGRESS') and t.ownerSubject is null
            order by t.dueAt, t.id""")
    java.util.List<RoutingQueueRow> findRoutingQueue();

    /** Open internal work per case: how much, how much is overdue at {@code now}, how much blocks. Cases without any are absent. */
    interface WorkCounts { UUID getCaseId(); Long getOpen(); Long getOverdue(); Long getBlocking(); }

    @Query("""
            select t.caseId as caseId, count(t) as open, sum(case when t.dueAt < :now then 1 else 0 end) as overdue,
                sum(case when t.blocking = true then 1 else 0 end) as blocking
            from CaseTask t where t.caseId in :caseIds and t.status in ('OPEN', 'IN_PROGRESS') and t.visibilityScope = 'INTERNAL'
            group by t.caseId""")
    java.util.List<WorkCounts> countOpenInternalWork(@Param("caseIds") java.util.Collection<UUID> caseIds, @Param("now") Instant now);

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
