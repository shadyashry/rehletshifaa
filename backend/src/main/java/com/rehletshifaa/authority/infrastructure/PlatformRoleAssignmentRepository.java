package com.rehletshifaa.authority.infrastructure;

import com.rehletshifaa.authority.domain.PlatformRoleAssignment;
import com.rehletshifaa.shared.persistence.BaseRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

public interface PlatformRoleAssignmentRepository extends BaseRepository<PlatformRoleAssignment, UUID> {
    /** Holders of the role now who are also ACTIVE workforce people with MFA and active platform access. */
    String ELIGIBLE = "from PlatformRoleAssignment a join WorkforcePerson p on p.subject = a.subject join AccessSubject s on s.subject = a.subject "
            + "where a.roleKey = :role and a.status = 'ACTIVE' and p.lifecycleStatus = 'ACTIVE' and p.mfaEnrolled = true and s.active = true";

    boolean existsByRoleKey(String roleKey);

    long countBySubjectAndStatus(String subject, String status);

    @Query("select distinct a.subject from PlatformRoleAssignment a where a.roleKey = :role and a.status = 'ACTIVE'")
    List<String> findSubjectsWithActiveRole(@Param("role") String role);

    @Query("select count(a) > 0 " + ELIGIBLE + " and a.subject = :subject and a.effectiveFrom <= :at and (a.effectiveTo is null or a.effectiveTo > :at)")
    boolean isEffectiveHolder(@Param("subject") String subject, @Param("role") String role, @Param("at") Instant at);

    /** SOD-04: workforce roles whose conflict rule is triggered by a platform role the subject holds effectively at {@code at}. */
    @Query("select distinct c.roleKey from WorkforceRoleConflict c, PlatformRoleAssignment a where a.subject = :subject "
            + "and a.roleKey = c.conflictingRoleKey and a.status = 'ACTIVE' and a.effectiveFrom <= :at and (a.effectiveTo is null or a.effectiveTo > :at)")
    List<String> findWorkforceRolesConflictedByPlatformRoles(@Param("subject") String subject, @Param("at") Instant at);

    @Query("select a from PlatformRoleAssignment a where a.status = 'ACTIVE' and (a.effectiveTo is null or a.effectiveTo > :at) order by a.subject")
    List<PlatformRoleAssignment> findAllCurrentAndScheduled(@Param("at") Instant at);

    @Query("select distinct a.subject " + ELIGIBLE + " and a.effectiveFrom <= :at and (a.effectiveTo is null or a.effectiveTo > :at)")
    List<String> findEffectiveHolders(@Param("role") String role, @Param("at") Instant at);

    @Query("select count(a) > 0 " + ELIGIBLE + " and a.effectiveTo is null")
    boolean hasIndefiniteEligibleHolder(@Param("role") String role);

    /** Current and scheduled (not yet ended) assignments of the role, earliest first. */
    @Query("""
            select a from PlatformRoleAssignment a where a.roleKey = :role and a.status = 'ACTIVE'
                and (a.effectiveTo is null or a.effectiveTo > :at) order by a.effectiveFrom, a.id""")
    List<PlatformRoleAssignment> findCurrentAndScheduled(@Param("role") String role, @Param("at") Instant at);

    @Query("""
            select a from PlatformRoleAssignment a where a.subject = :subject and a.roleKey = :role and a.status = 'ACTIVE'
                and (a.effectiveTo is null or a.effectiveTo > :at) order by a.effectiveFrom, a.id""")
    List<PlatformRoleAssignment> findCurrentAndScheduledForSubject(@Param("subject") String subject, @Param("role") String role,
                                                                  @Param("at") Instant at);

    @Query("""
            select a from PlatformRoleAssignment a where a.subject = :subject and a.roleKey = :role and a.status = 'ACTIVE'
                and a.effectiveFrom <= :at and (a.effectiveTo is null or a.effectiveTo > :at) order by a.effectiveFrom, a.id""")
    List<PlatformRoleAssignment> findEffectiveForSubject(@Param("subject") String subject, @Param("role") String role, @Param("at") Instant at);

    /** An active assignment of the subject overlapping [from, ∞). */
    @Query("""
            select count(a) > 0 from PlatformRoleAssignment a where a.subject = :subject and a.roleKey = :role and a.status = 'ACTIVE'
                and (a.effectiveTo is null or a.effectiveTo > :from)""")
    boolean overlapsOpenEnded(@Param("subject") String subject, @Param("role") String role, @Param("from") Instant from);

    /** An active assignment of the subject overlapping [from, to). */
    @Query("""
            select count(a) > 0 from PlatformRoleAssignment a where a.subject = :subject and a.roleKey = :role and a.status = 'ACTIVE'
                and a.effectiveFrom < :to and (a.effectiveTo is null or a.effectiveTo > :from)""")
    boolean overlaps(@Param("subject") String subject, @Param("role") String role, @Param("from") Instant from, @Param("to") Instant to);

    @Query("select a.effectiveFrom from PlatformRoleAssignment a where a.roleKey = :role and a.status = 'ACTIVE' and a.effectiveFrom > :now")
    List<Instant> findFutureStarts(@Param("role") String role, @Param("now") Instant now);

    @Query("select a.effectiveTo from PlatformRoleAssignment a where a.roleKey = :role and a.status = 'ACTIVE' and a.effectiveTo >= :now")
    List<Instant> findUpcomingEnds(@Param("role") String role, @Param("now") Instant now);

    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("""
            update PlatformRoleAssignment a set a.status = 'REVOKED', a.revokedAt = :now, a.revision = a.revision + 1
            where a.id = :id and a.revision = :revision and a.status = 'ACTIVE'""")
    int revoke(@Param("id") UUID id, @Param("revision") long revision, @Param("now") Instant now);

    /** Revocation of a still-active assignment whatever its revision (recertification outcome). */
    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("update PlatformRoleAssignment a set a.status = 'REVOKED', a.revokedAt = :now, a.revision = a.revision + 1 where a.id = :id and a.status = 'ACTIVE'")
    int revokeActive(@Param("id") UUID id, @Param("now") Instant now);

    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("""
            update PlatformRoleAssignment a set a.effectiveTo = :removalAt, a.revision = a.revision + 1
            where a.id = :id and a.revision = :revision and a.status = 'ACTIVE' and (a.effectiveTo is null or a.effectiveTo > :removalAt)""")
    int scheduleEnd(@Param("id") UUID id, @Param("revision") long revision, @Param("removalAt") Instant removalAt);
}
