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
