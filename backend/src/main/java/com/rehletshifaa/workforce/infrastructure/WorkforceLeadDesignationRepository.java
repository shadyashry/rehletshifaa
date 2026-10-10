package com.rehletshifaa.workforce.infrastructure;

import com.rehletshifaa.workforce.domain.WorkforceLeadDesignation;
import com.rehletshifaa.shared.persistence.BaseRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface WorkforceLeadDesignationRepository extends BaseRepository<WorkforceLeadDesignation, UUID> {
    Optional<WorkforceLeadDesignation> findByTeamIdAndSubjectAndStatus(UUID teamId, String subject, String status);

    boolean existsByTeamIdAndStatusAndIdNot(UUID teamId, String status, UUID id);

    Optional<WorkforceLeadDesignation> findFirstByTeamIdAndSubjectAndEffectiveToIsNotNullOrderByEffectiveToDesc(UUID teamId, String subject);

    List<WorkforceLeadDesignation> findByTeamIdInAndStatus(Collection<UUID> teamIds, String status);

    /** Other active lead designations of the subject in the function's teams (any team status). */
    @Query("""
            select count(l) > 0 from WorkforceLeadDesignation l join WorkforceTeam t on t.id = l.teamId
            where l.subject = :subject and l.status = 'ACTIVE' and t.functionKey = :function and l.id <> :excluded""")
    boolean leadsElsewhereInFunction(@Param("subject") String subject, @Param("function") String function, @Param("excluded") UUID excluded);

    /** WF-05: a manager needs a current lead designation on an active team of the function. */
    @Query("""
            select count(l) > 0 from WorkforceLeadDesignation l join WorkforceTeam t on t.id = l.teamId
            where l.subject = :subject and l.status = 'ACTIVE' and t.status = 'ACTIVE' and t.functionKey = :function""")
    boolean leadsActiveTeamInFunction(@Param("subject") String subject, @Param("function") String function);

    /** WF-08: members of active teams of the function that the lead currently leads, at {@code at}. */
    @Query("""
            select distinct m.subject from WorkforceLeadDesignation l
                join WorkforceTeam t on t.id = l.teamId
                join WorkforceTeamMembership m on m.teamId = t.id
            where l.subject = :lead and l.status = 'ACTIVE' and l.effectiveFrom <= :at and (l.effectiveTo is null or l.effectiveTo > :at)
                and t.status = 'ACTIVE' and t.functionKey = :function
                and m.status = 'ACTIVE' and m.effectiveFrom <= :at and (m.effectiveTo is null or m.effectiveTo > :at)""")
    List<String> findSupervisedMembers(@Param("lead") String lead, @Param("function") String function, @Param("at") Instant at);

    /** The reverse of {@link #findSupervisedMembers}: the current leads of the member's active teams of the function. */
    @Query("""
            select distinct l.subject from WorkforceLeadDesignation l
                join WorkforceTeam t on t.id = l.teamId
                join WorkforceTeamMembership m on m.teamId = t.id
            where m.subject = :member and l.status = 'ACTIVE' and l.effectiveFrom <= :at and (l.effectiveTo is null or l.effectiveTo > :at)
                and t.status = 'ACTIVE' and t.functionKey = :function
                and m.status = 'ACTIVE' and m.effectiveFrom <= :at and (m.effectiveTo is null or m.effectiveTo > :at)""")
    List<String> findLeadsOf(@Param("member") String member, @Param("function") String function, @Param("at") Instant at);

    /** STF-08: active teams the subject solely leads (by designation status) that still have other active members. */
    @Query("""
            select count(t) from WorkforceTeam t join WorkforceLeadDesignation l on l.teamId = t.id
            where l.subject = :subject and l.status = 'ACTIVE' and t.status = 'ACTIVE'
                and not exists (select 1 from WorkforceLeadDesignation o where o.teamId = t.id and o.status = 'ACTIVE' and o.subject <> l.subject)
                and exists (select 1 from WorkforceTeamMembership m where m.teamId = t.id and m.status = 'ACTIVE' and m.subject <> l.subject)""")
    long countTeamsSolelyLedWithOtherMembers(@Param("subject") String subject);

    /** WF-12: the subject is the only current lead of an active team in the function that still has other members. */
    @Query("""
            select count(t) > 0 from WorkforceTeam t join WorkforceLeadDesignation l on l.teamId = t.id
            where l.subject = :subject and l.status = 'ACTIVE' and l.effectiveFrom <= :at and (l.effectiveTo is null or l.effectiveTo > :at)
                and t.functionKey = :function and t.status = 'ACTIVE'
                and not exists (select 1 from WorkforceLeadDesignation o where o.teamId = t.id and o.subject <> :subject
                    and o.status = 'ACTIVE' and o.effectiveFrom <= :at and (o.effectiveTo is null or o.effectiveTo > :at))
                and exists (select 1 from WorkforceTeamMembership m where m.teamId = t.id and m.subject <> :subject
                    and m.status = 'ACTIVE' and m.effectiveFrom <= :at and (m.effectiveTo is null or m.effectiveTo > :at))""")
    boolean onlyLeadOfStaffedTeam(@Param("subject") String subject, @Param("function") String function, @Param("at") Instant at);

    /** Whether the subject leads the team at {@code at}. */
    @Query("""
            select count(l) > 0 from WorkforceLeadDesignation l
            where l.teamId = :teamId and l.subject = :subject and l.status = 'ACTIVE'
                and l.effectiveFrom <= :at and (l.effectiveTo is null or l.effectiveTo > :at)""")
    boolean leadsAt(@Param("teamId") UUID teamId, @Param("subject") String subject, @Param("at") Instant at);

    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("""
            update WorkforceLeadDesignation l set l.status = 'ENDED', l.effectiveTo = :endAt, l.revision = l.revision + 1
            where l.id = :id and l.revision = :revision and l.status = 'ACTIVE'""")
    int end(@Param("id") UUID id, @Param("revision") long revision, @Param("endAt") Instant endAt);

    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("""
            update WorkforceLeadDesignation l set l.status = 'ENDED',
                l.effectiveTo = case when l.effectiveFrom < :now then cast(:now as Instant) else null end, l.revision = l.revision + 1
            where l.subject = :subject and l.status = 'ACTIVE'""")
    int endAllActive(@Param("subject") String subject, @Param("now") Instant now);
}
