package com.rehletshifaa.workforce.infrastructure;

import com.rehletshifaa.workforce.domain.WorkforceRoleAssignment;
import com.rehletshifaa.shared.persistence.BaseRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;
import java.util.Collection;
import java.util.List;
import java.util.UUID;

public interface WorkforceRoleAssignmentRepository extends BaseRepository<WorkforceRoleAssignment, UUID> {
    String EFFECTIVE_AT = "a.status = 'ACTIVE' and a.effectiveFrom <= :at and (a.effectiveTo is null or a.effectiveTo > :at)";

    boolean existsBySubjectAndRoleKeyAndSource(String subject, String roleKey, String source);

    /** Effective assignments of the given subjects at {@code at}, ordered by subject then role. */
    @Query("select a from WorkforceRoleAssignment a where a.subject in :subjects and " + EFFECTIVE_AT + " order by a.subject, a.roleKey")
    List<WorkforceRoleAssignment> findEffective(@Param("subjects") Collection<String> subjects, @Param("at") Instant at);

    /** Effective role keys of one subject at {@code at}, ordered. */
    @Query("select a.roleKey from WorkforceRoleAssignment a where a.subject = :subject and " + EFFECTIVE_AT + " order by a.roleKey")
    List<String> findEffectiveRoleKeys(@Param("subject") String subject, @Param("at") Instant at);

    /** WF-03: whether the subject holds an effective role belonging to the function. */
    @Query("select count(a) > 0 from WorkforceRoleAssignment a join WorkforceRole r on r.key = a.roleKey "
            + "where a.subject = :subject and r.functionKey = :function and " + EFFECTIVE_AT)
    boolean holdsFunctionRole(@Param("subject") String subject, @Param("function") String function, @Param("at") Instant at);

    String WITH_FUNCTION = "select new com.rehletshifaa.workforce.infrastructure.AssignmentWithFunction(a, r.functionKey) "
            + "from WorkforceRoleAssignment a join WorkforceRole r on r.key = a.roleKey ";

    @Query(WITH_FUNCTION + "where a.subject = :subject order by a.effectiveFrom, a.id")
    List<AssignmentWithFunction> findWithFunctionForSubject(@Param("subject") String subject);

    @Query(WITH_FUNCTION + "where a.id = :id")
    java.util.Optional<AssignmentWithFunction> findWithFunction(@Param("id") UUID id);

    /** An active assignment of the role overlapping [from, ∞). */
    @Query("select count(a) > 0 from WorkforceRoleAssignment a where a.subject = :subject and a.roleKey = :role and a.status = 'ACTIVE' "
            + "and (a.effectiveTo is null or a.effectiveTo > :from)")
    boolean overlapsOpenEnded(@Param("subject") String subject, @Param("role") String role, @Param("from") Instant from);

    /** An active assignment of the role overlapping [from, to). */
    @Query("select count(a) > 0 from WorkforceRoleAssignment a where a.subject = :subject and a.roleKey = :role and a.status = 'ACTIVE' "
            + "and a.effectiveFrom < :to and (a.effectiveTo is null or a.effectiveTo > :from)")
    boolean overlaps(@Param("subject") String subject, @Param("role") String role, @Param("from") Instant from, @Param("to") Instant to);

    /** A current or scheduled (not ended) active assignment of the role, from any source. */
    @Query("select count(a) > 0 from WorkforceRoleAssignment a where a.subject = :subject and a.roleKey = :role and a.status = 'ACTIVE' "
            + "and (a.effectiveTo is null or a.effectiveTo > :at)")
    boolean holdsNowOrLater(@Param("subject") String subject, @Param("role") String role, @Param("at") Instant at);

    /** Another assignment (not {@code excluded}) in the function stays effective at {@code at}. */
    @Query("select count(a) > 0 from WorkforceRoleAssignment a join WorkforceRole r on r.key = a.roleKey "
            + "where a.subject = :subject and r.functionKey = :function and a.id <> :excluded and " + EFFECTIVE_AT)
    boolean retainsFunction(@Param("subject") String subject, @Param("function") String function, @Param("excluded") UUID excluded,
                            @Param("at") Instant at);

    /** All effective assignments at {@code at}, ordered by subject then role (one query for a whole directory page). */
    @Query("select a from WorkforceRoleAssignment a where " + EFFECTIVE_AT + " order by a.subject, a.roleKey")
    List<WorkforceRoleAssignment> findAllEffective(@Param("at") Instant at);

    interface RoleHolder { String getSubject(); String getDisplayNameEncrypted(); String getRoleKey(); }

    interface RoleFact { String getRoleKey(); String getFunctionKey(); Instant getEffectiveFrom(); Instant getEffectiveTo(); String getSource(); }

    /** People who hold the role now: an effective assignment, an ACTIVE lifecycle and active platform access. */
    String HOLDS = "from WorkforceRoleAssignment a join WorkforcePerson p on p.subject = a.subject join AccessSubject s on s.subject = a.subject "
            + "where " + EFFECTIVE_AT + " and p.lifecycleStatus = 'ACTIVE' and s.active = true and a.roleKey in :roles";

    @Query("select distinct a.subject as subject, p.displayNameEncrypted as displayNameEncrypted, a.roleKey as roleKey " + HOLDS
            + " order by a.subject, a.roleKey")
    List<RoleHolder> findActiveHolders(@Param("roles") Collection<String> roles, @Param("at") Instant at);

    @Query("select count(a) > 0 " + HOLDS + " and a.subject = :subject")
    boolean holdsAny(@Param("subject") String subject, @Param("roles") Collection<String> roles, @Param("at") Instant at);

    @Query("select a.roleKey as roleKey, r.functionKey as functionKey, a.effectiveFrom as effectiveFrom, a.effectiveTo as effectiveTo, "
            + "a.source as source from WorkforceRoleAssignment a join WorkforceRole r on r.key = a.roleKey "
            + "where a.subject = :subject and " + EFFECTIVE_AT + " order by a.roleKey")
    List<RoleFact> findEffectiveRoleFacts(@Param("subject") String subject, @Param("at") Instant at);

    /** Active, not yet ended assignments whose role is (or is not) in {@code roles}, for a recertification campaign. */
    @Query("select a from WorkforceRoleAssignment a where a.status = 'ACTIVE' and a.roleKey in :roles and (a.effectiveTo is null or a.effectiveTo > :at) order by a.subject, a.roleKey")
    List<WorkforceRoleAssignment> findCurrentWithRoles(@Param("roles") Collection<String> roles, @Param("at") Instant at);

    @Query("select a from WorkforceRoleAssignment a where a.status = 'ACTIVE' and a.roleKey not in :roles and (a.effectiveTo is null or a.effectiveTo > :at) order by a.subject, a.roleKey")
    List<WorkforceRoleAssignment> findCurrentWithoutRoles(@Param("roles") Collection<String> roles, @Param("at") Instant at);

    /** Role keys the subject holds effectively at {@code at}, counted only while the person is ACTIVE with platform access. */
    @Query("select distinct a.roleKey from WorkforceRoleAssignment a join WorkforcePerson p on p.subject = a.subject "
            + "join AccessSubject s on s.subject = a.subject where a.subject = :subject and " + EFFECTIVE_AT
            + " and p.lifecycleStatus = 'ACTIVE' and s.active = true")
    List<String> findAuthorityRoleKeys(@Param("subject") String subject, @Param("at") Instant at);

    /** An ACTIVE workforce person holding the role effectively at {@code at} (platform access is not part of this check). */
    @Query("select count(a) > 0 from WorkforceRoleAssignment a join WorkforcePerson p on p.subject = a.subject "
            + "where a.subject = :subject and a.roleKey = :role and p.lifecycleStatus = 'ACTIVE' and " + EFFECTIVE_AT)
    boolean activePersonHoldsRole(@Param("subject") String subject, @Param("role") String role, @Param("at") Instant at);

    /** SOD-04: roles whose conflict rule is triggered by another workforce role the subject holds effectively at {@code at}. */
    @Query("select distinct c.roleKey from WorkforceRoleConflict c, WorkforceRoleAssignment a where a.subject = :subject "
            + "and a.roleKey = c.conflictingRoleKey and " + EFFECTIVE_AT)
    List<String> findRolesConflictedByHeldRoles(@Param("subject") String subject, @Param("at") Instant at);

    /** Revocation guarded by the revision the caller read. */
    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("""
            update WorkforceRoleAssignment a set a.status = 'REVOKED', a.revokedBy = :actor, a.revokedAt = :at,
                a.revokeReason = :reason, a.revision = a.revision + 1
            where a.id = :id and a.revision = :revision and a.status = 'ACTIVE'""")
    int revoke(@Param("id") UUID id, @Param("revision") long revision, @Param("actor") String actor,
               @Param("at") Instant at, @Param("reason") String reason);

    /** Revocation of a still-active assignment, whatever its revision (system hygiene). */
    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("""
            update WorkforceRoleAssignment a set a.status = 'REVOKED', a.revokedBy = :actor, a.revokedAt = :at,
                a.revokeReason = :reason, a.revision = a.revision + 1
            where a.id = :id and a.status = 'ACTIVE'""")
    int revokeActive(@Param("id") UUID id, @Param("actor") String actor, @Param("at") Instant at, @Param("reason") String reason);

    /** STF-10: every active assignment of an offboarded person. */
    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("""
            update WorkforceRoleAssignment a set a.status = 'REVOKED', a.revokedBy = :actor, a.revokedAt = :at,
                a.revokeReason = :reason, a.revision = a.revision + 1
            where a.subject = :subject and a.status = 'ACTIVE'""")
    int revokeAllActive(@Param("subject") String subject, @Param("actor") String actor, @Param("at") Instant at, @Param("reason") String reason);

    /** A future-dated removal: the assignment stays ACTIVE until {@code removalAt}. */
    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("""
            update WorkforceRoleAssignment a set a.effectiveTo = :removalAt, a.revokedBy = :actor, a.revokeReason = :reason,
                a.revision = a.revision + 1
            where a.id = :id and a.revision = :revision and a.status = 'ACTIVE' and (a.effectiveTo is null or a.effectiveTo > :removalAt)""")
    int scheduleRemoval(@Param("id") UUID id, @Param("revision") long revision, @Param("actor") String actor,
                        @Param("removalAt") Instant removalAt, @Param("reason") String reason);
}
