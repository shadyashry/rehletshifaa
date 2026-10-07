package com.rehletshifaa.casemanagement.infrastructure;

import com.rehletshifaa.casemanagement.domain.CaseAssignment;
import com.rehletshifaa.shared.persistence.BaseRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;
import java.util.UUID;

/** Assignment status changes, each guarded by the status it moves from. */
public interface CaseAssignmentRepository extends BaseRepository<CaseAssignment, UUID> {
    long countByAssigneeSubjectAndStatusIn(String assigneeSubject, java.util.Collection<String> statuses);

    interface CaseAssignee { UUID getCaseId(); String getSubject(); }

    /** Active coordinators of the given cases, newest assignment first (the first row per case is its coordinator). */
    @Query("""
            select a.caseId as caseId, a.assigneeSubject as subject from CaseAssignment a
            where a.caseId in :caseIds and a.assigneeRole = 'COORDINATOR' and a.status = 'ACTIVE'
            order by a.assignedAt desc""")
    java.util.List<CaseAssignee> findActiveCoordinators(@Param("caseIds") java.util.Collection<UUID> caseIds);

    interface OpenAssignment { String getSubject(); String getRole(); String getType(); String getStatus(); }

    /** The case's pending and active assignments, newest first. */
    @Query("""
            select a.assigneeSubject as subject, a.assigneeRole as role, a.assignmentType as type, a.status as status from CaseAssignment a
            where a.caseId = :caseId and a.status in ('PENDING', 'ACTIVE')
            order by a.assignedAt desc""")
    java.util.List<OpenAssignment> findOpenOnCase(@Param("caseId") UUID caseId);

    interface CaseHolder { UUID getCaseId(); String getRole(); String getSubject(); String getStatus(); }

    /**
     * The open coordinator and consultant assignments of the given cases, oldest first (the last row per case and role is
     * the current one). Referral offers and second opinions never stand in for the case's consultant.
     */
    @Query("""
            select a.caseId as caseId, a.assigneeRole as role, a.assigneeSubject as subject, a.status as status from CaseAssignment a
            where a.caseId in :caseIds and a.assigneeRole in ('COORDINATOR', 'DOCTOR') and a.status in ('PENDING', 'ACTIVE')
            and a.assignmentType not in ('TRANSFER', 'SECOND_OPINION')
            order by a.assignedAt""")
    java.util.List<CaseHolder> findCaseHolders(@Param("caseIds") java.util.Collection<UUID> caseIds);

    interface HeldAssignment { UUID getCaseId(); UUID getId(); String getStatus(); }

    /** The subject's open assignments in a role on the given cases: active ones first, then oldest first (the last row per case wins). */
    @Query("""
            select a.caseId as caseId, a.id as id, a.status as status from CaseAssignment a
            where a.caseId in :caseIds and a.assigneeSubject = :subject and a.assigneeRole = :role and a.status in ('PENDING', 'ACTIVE')
            order by case a.status when 'PENDING' then 1 else 0 end, a.assignedAt""")
    java.util.List<HeldAssignment> findHeldBy(@Param("caseIds") java.util.Collection<UUID> caseIds, @Param("subject") String subject,
                                              @Param("role") String role);

    interface OpenAssignmentRow { UUID getId(); String getSubject(); String getRole(); String getType(); String getStatus(); Instant getAssignedAt(); Long getVersion(); }

    /** The case's pending and active assignments, oldest first. */
    @Query("""
            select a.id as id, a.assigneeSubject as subject, a.assigneeRole as role, a.assignmentType as type, a.status as status,
                a.assignedAt as assignedAt, a.version as version from CaseAssignment a
            where a.caseId = :caseId and a.status in ('PENDING', 'ACTIVE')
            order by a.assignedAt""")
    java.util.List<OpenAssignmentRow> findOpenRowsOn(@Param("caseId") UUID caseId);

    interface HistoryRow { String getSubject(); String getRole(); String getStatus(); String getReason(); String getAssignedBy(); Instant getAssignedAt(); Instant getEndedAt(); }

    /** Every assignment of the case, newest first; on a shared assignment time the still-open one precedes the one it replaced. */
    @Query("""
            select a.assigneeSubject as subject, a.assigneeRole as role, a.status as status, a.reason as reason, a.assignedBy as assignedBy,
                a.assignedAt as assignedAt, a.endedAt as endedAt from CaseAssignment a
            where a.caseId = :caseId
            order by a.assignedAt desc, case when a.endedAt is null then 0 else 1 end, a.endedAt desc, a.id""")
    java.util.List<HistoryRow> findHistoryOf(@Param("caseId") UUID caseId);

    @Query("""
            select a.status from CaseAssignment a
            where a.id = :id and a.caseId = :caseId and a.assigneeSubject = :subject and a.assigneeRole = :role""")
    java.util.Optional<String> findStatusFor(@Param("id") UUID id, @Param("caseId") UUID caseId, @Param("subject") String subject,
                                             @Param("role") String role);

    /** The case's active primary coordinator, newest assignment first (pass {@code Limit.of(1)}). */
    @Query("""
            select a.assigneeSubject from CaseAssignment a
            where a.caseId = :caseId and a.assigneeRole = 'COORDINATOR' and a.assignmentType = 'PRIMARY' and a.status = 'ACTIVE'
            order by a.assignedAt desc, a.id""")
    java.util.List<String> findActivePrimaryCoordinator(@Param("caseId") UUID caseId, org.springframework.data.domain.Limit limit);

    /** A primary coordinator assignment of the case, whatever its status. */
    interface CoordinatorAssignment { UUID getId(); String getAssigneeSubject(); }

    /** The case's primary coordinator assignments, latest first, ended ones included (use with {@code Limit.of(1)}). */
    @Query("""
            select a.id as id, a.assigneeSubject as assigneeSubject from CaseAssignment a
            where a.caseId = :caseId and a.assigneeRole = 'COORDINATOR' and a.assignmentType = 'PRIMARY'
            order by a.assignedAt desc""")
    java.util.List<CoordinatorAssignment> findNewestPrimaryCoordinators(@Param("caseId") UUID caseId, org.springframework.data.domain.Limit limit);

    boolean existsByCaseIdAndAssigneeSubjectAndAssigneeRoleAndStatus(UUID caseId, String assigneeSubject, String assigneeRole, String status);

    boolean existsByCaseIdAndAssigneeSubjectAndStatusIn(UUID caseId, String assigneeSubject, java.util.Collection<String> statuses);

    /** The subject holds an offered (PENDING) or active assignment of the role on the case. */
    boolean existsByCaseIdAndAssigneeSubjectAndAssigneeRoleAndStatusIn(UUID caseId, String assigneeSubject, String assigneeRole,
                                                                       java.util.Collection<String> statuses);

    /** The subject actively works the case in the role (a second opinion is a consultation, not the case's work). */
    @Query("""
            select count(a) > 0 from CaseAssignment a where a.caseId = :caseId and a.assigneeSubject = :subject and a.assigneeRole = :role
                and a.status = 'ACTIVE' and a.assignmentType <> 'SECOND_OPINION'""")
    boolean isActivelyAssigned(@Param("caseId") UUID caseId, @Param("subject") String subject, @Param("role") String role);

    /** The subject gives an active second opinion on the case. */
    @Query("""
            select count(a) > 0 from CaseAssignment a where a.caseId = :caseId and a.assigneeSubject = :subject
                and a.assignmentType = 'SECOND_OPINION' and a.status = 'ACTIVE'""")
    boolean isConsulted(@Param("caseId") UUID caseId, @Param("subject") String subject);

    /** Open cases (not closed or cancelled) each coordinator owns as active primary coordinator. */
    interface Caseload { String getSubject(); Long getCases(); }

    @Query("""
            select a.assigneeSubject as subject, count(distinct a.caseId) as cases from CaseAssignment a join MedicalCase c on c.id = a.caseId
            where a.assigneeSubject in :subjects and a.assigneeRole = 'COORDINATOR' and a.assignmentType = 'PRIMARY' and a.status = 'ACTIVE'
                and c.status not in (com.rehletshifaa.casemanagement.domain.CaseStatus.CLOSED, com.rehletshifaa.casemanagement.domain.CaseStatus.CANCELLED)
            group by a.assigneeSubject""")
    java.util.List<Caseload> countCoordinatorCaseloads(@Param("subjects") java.util.Collection<String> subjects);

    /** A case and the coordinator who owns it as active primary coordinator. */
    interface CoordinatedCase { UUID getCaseId(); String getCaseNumber(); com.rehletshifaa.casemanagement.domain.CaseStatus getStatus(); String getCoordinator(); Instant getUpdatedAt(); }

    /** The cases the given coordinators own, latest change first. */
    @Query("""
            select distinct c.id as caseId, c.caseNumber as caseNumber, c.status as status, a.assigneeSubject as coordinator, c.updatedAt as updatedAt
            from CaseAssignment a join MedicalCase c on c.id = a.caseId
            where a.assigneeSubject in :subjects and a.assigneeRole = 'COORDINATOR' and a.assignmentType = 'PRIMARY' and a.status = 'ACTIVE'
            order by c.updatedAt desc""")
    java.util.List<CoordinatedCase> findCoordinatedCases(@Param("subjects") java.util.Collection<String> subjects);

    /** The case's active primary coordinator assignments, latest first (use with {@code Limit.of(1)}). */
    @Query("""
            select a.id from CaseAssignment a
            where a.caseId = :caseId and a.assigneeRole = 'COORDINATOR' and a.assignmentType = 'PRIMARY' and a.status = 'ACTIVE'
            order by a.assignedAt desc, a.id""")
    java.util.List<UUID> findActivePrimaryCoordinatorAssignmentIds(@Param("caseId") UUID caseId, org.springframework.data.domain.Limit limit);

    /** Practitioner ids of the case's primary consultant, active or offered, latest first (use with {@code Limit.of(1)}). */
    @Query("""
            select p.id from CaseAssignment a join PractitionerProfile p on p.externalSubject = a.assigneeSubject
            where a.caseId = :caseId and a.assigneeRole = 'DOCTOR' and a.assignmentType = 'PRIMARY' and a.status in ('ACTIVE', 'PENDING')
            order by a.assignedAt desc, a.id""")
    java.util.List<UUID> findPrimaryConsultantIds(@Param("caseId") UUID caseId, org.springframework.data.domain.Limit limit);

    /** Open (not closed or cancelled) cases the coordinator owns as active primary coordinator, other than {@code excluded}. */
    @Query("""
            select count(distinct a.caseId) from CaseAssignment a join MedicalCase c on c.id = a.caseId
            where a.assigneeSubject = :subject and a.assigneeRole = 'COORDINATOR' and a.assignmentType = 'PRIMARY' and a.status = 'ACTIVE'
                and c.status not in (com.rehletshifaa.casemanagement.domain.CaseStatus.CLOSED, com.rehletshifaa.casemanagement.domain.CaseStatus.CANCELLED)
                and a.caseId <> :excluded""")
    long countOpenPrimaryCasesExcept(@Param("subject") String subject, @Param("excluded") UUID excluded);

    /** When the routing engine last made the subject a case's coordinator, latest first (use with {@code Limit.of(1)}). */
    @Query("""
            select a.assignedAt from CaseAssignment a
            where a.assigneeSubject = :subject and a.assigneeRole = 'COORDINATOR' and a.assignedBy = 'ROUTING_ENGINE'
            order by a.assignedAt desc""")
    java.util.List<Instant> findAutomaticAssignmentTimes(@Param("subject") String subject, org.springframework.data.domain.Limit limit);

    /** Everyone actively assigned to the case in the role. */
    @Query("select a.assigneeSubject from CaseAssignment a where a.caseId = :caseId and a.assigneeRole = :role and a.status = 'ACTIVE'")
    java.util.List<String> findActiveAssignees(@Param("caseId") UUID caseId, @Param("role") String role);

    interface AssigneeAndStatus { String getSubject(); String getStatus(); }

    @Query("select a.assigneeSubject as subject, a.status as status from CaseAssignment a where a.id = :id")
    java.util.Optional<AssigneeAndStatus> findAssigneeAndStatus(@Param("id") UUID id);

    /** The subject's active assignment as the case's consultant (a referral offer or second opinion is not one). */
    @Query("""
            select a.id from CaseAssignment a
            where a.caseId = :caseId and a.assigneeSubject = :subject and a.assigneeRole = 'DOCTOR' and a.status = 'ACTIVE'
            and a.assignmentType not in ('TRANSFER', 'SECOND_OPINION')""")
    java.util.Optional<UUID> findActiveConsultantAssignment(@Param("caseId") UUID caseId, @Param("subject") String subject);

    /** Cases a consultant holds in an assignment status, excluding cases that are no longer live. */
    @Query("""
            select count(distinct a.caseId) from CaseAssignment a join MedicalCase c on c.id = a.caseId
            where a.assigneeSubject = :subject and a.assigneeRole = 'DOCTOR' and a.status = :status and c.status not in :closed""")
    long countConsultantCases(@Param("subject") String subject, @Param("status") String status,
                              @Param("closed") java.util.Collection<com.rehletshifaa.casemanagement.domain.CaseStatus> closed);

    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("""
            update CaseAssignment a set a.status = 'ENDED', a.endedAt = :now, a.version = a.version + 1
            where a.id = :id and a.status = :status""")
    int endIf(@Param("id") UUID id, @Param("status") String status, @Param("now") Instant now);

    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("""
            update CaseAssignment a set a.status = 'DECLINED', a.endedAt = :now, a.version = a.version + 1
            where a.id = :id and a.status = 'PENDING'""")
    int decline(@Param("id") UUID id, @Param("now") Instant now);

    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("""
            update CaseAssignment a set a.status = 'ACTIVE', a.acceptedAt = :now, a.version = a.version + 1
            where a.id = :id and a.status = 'PENDING'""")
    int accept(@Param("id") UUID id, @Param("now") Instant now);

    /** A transfer is accepted: the pending referral becomes the case's primary consultant. */
    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("""
            update CaseAssignment a set a.status = 'ACTIVE', a.assignmentType = 'PRIMARY', a.acceptedAt = :now, a.version = a.version + 1
            where a.id = :id and a.status = 'PENDING'""")
    int acceptAsPrimary(@Param("id") UUID id, @Param("now") Instant now);

    /** Restores an earlier assignment, keeping when it was first accepted. */
    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("""
            update CaseAssignment a set a.status = 'ACTIVE', a.endedAt = null, a.acceptedAt = coalesce(a.acceptedAt, cast(:now as Instant)),
                a.version = a.version + 1
            where a.id = :id and a.status <> 'ACTIVE'""")
    int reinstate(@Param("id") UUID id, @Param("now") Instant now);

    /** The assignee answers a pending assignment (ACTIVE with an acceptance time, or DECLINED with an end time). */
    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("""
            update CaseAssignment a set a.status = :status, a.acceptedAt = :acceptedAt, a.endedAt = :endedAt, a.version = a.version + 1
            where a.id = :id and a.caseId = :caseId and a.assigneeSubject = :subject and a.assigneeRole = :role and a.status = 'PENDING'""")
    int respond(@Param("id") UUID id, @Param("caseId") UUID caseId, @Param("subject") String subject, @Param("role") String role,
                @Param("status") String status, @Param("acceptedAt") Instant acceptedAt, @Param("endedAt") Instant endedAt);

    /** Ends the open assignment of a role and type before a new one is made. */
    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("""
            update CaseAssignment a set a.status = 'ENDED', a.endedAt = :now, a.version = a.version + 1
            where a.caseId = :caseId and a.assigneeRole = :role and a.assignmentType = :type and a.status in ('PENDING', 'ACTIVE')""")
    int endOpen(@Param("caseId") UUID caseId, @Param("role") String role, @Param("type") String type, @Param("now") Instant now);

    /** The consultant hands the case back for reassignment. Historically not a revision of the assignment. */
    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("""
            update CaseAssignment a set a.status = 'ENDED', a.endedAt = :now
            where a.caseId = :caseId and a.assigneeSubject = :subject and a.assigneeRole = 'DOCTOR' and a.status in ('PENDING', 'ACTIVE')""")
    int releaseConsultant(@Param("caseId") UUID caseId, @Param("subject") String subject, @Param("now") Instant now);
}
