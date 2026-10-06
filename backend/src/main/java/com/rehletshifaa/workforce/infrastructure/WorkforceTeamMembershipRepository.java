package com.rehletshifaa.workforce.infrastructure;

import com.rehletshifaa.workforce.domain.WorkforceTeamMembership;
import com.rehletshifaa.shared.persistence.BaseRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface WorkforceTeamMembershipRepository extends BaseRepository<WorkforceTeamMembership, UUID> {
    Optional<WorkforceTeamMembership> findByTeamIdAndSubjectAndStatus(UUID teamId, String subject, String status);

    boolean existsByTeamIdAndStatus(UUID teamId, String status);

    boolean existsByTeamIdAndStatusAndSubjectNot(UUID teamId, String status, String subject);

    Optional<WorkforceTeamMembership> findFirstByTeamIdAndSubjectAndEffectiveToIsNotNullOrderByEffectiveToDesc(UUID teamId, String subject);

    List<WorkforceTeamMembership> findByTeamIdInAndStatusOrderBySubject(Collection<UUID> teamIds, String status);

    interface TeamFact { UUID getTeamId(); String getFunctionKey(); String getName(); boolean isLead(); }

    /** The person's current teams at {@code at}, flagged where the person also leads the team. */
    @Query("""
            select t.id as teamId, t.functionKey as functionKey, t.name as name,
                case when exists (select 1 from WorkforceLeadDesignation l where l.teamId = t.id and l.subject = m.subject
                    and l.status = 'ACTIVE' and l.effectiveFrom <= :at and (l.effectiveTo is null or l.effectiveTo > :at))
                then true else false end as lead
            from WorkforceTeamMembership m join WorkforceTeam t on t.id = m.teamId
            where m.subject = :subject and m.status = 'ACTIVE' and t.status = 'ACTIVE'
                and m.effectiveFrom <= :at and (m.effectiveTo is null or m.effectiveTo > :at)
            order by t.functionKey, t.name, t.id""")
    List<TeamFact> findCurrentTeams(@Param("subject") String subject, @Param("at") Instant at);

    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("""
            update WorkforceTeamMembership m set m.status = 'ENDED', m.effectiveTo = :endAt, m.revision = m.revision + 1
            where m.id = :id and m.revision = :revision and m.status = 'ACTIVE'""")
    int end(@Param("id") UUID id, @Param("revision") long revision, @Param("endAt") Instant endAt);

    /** STF-10; a membership that started at or after {@code now} ends without an end instant (no zero-length period). */
    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("""
            update WorkforceTeamMembership m set m.status = 'ENDED',
                m.effectiveTo = case when m.effectiveFrom < :now then cast(:now as Instant) else null end, m.revision = m.revision + 1
            where m.subject = :subject and m.status = 'ACTIVE'""")
    int endAllActive(@Param("subject") String subject, @Param("now") Instant now);
}
