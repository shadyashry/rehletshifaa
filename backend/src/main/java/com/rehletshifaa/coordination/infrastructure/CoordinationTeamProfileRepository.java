package com.rehletshifaa.coordination.infrastructure;

import com.rehletshifaa.coordination.domain.CoordinationTeamProfile;
import com.rehletshifaa.shared.persistence.BaseRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;
import java.util.UUID;

public interface CoordinationTeamProfileRepository extends BaseRepository<CoordinationTeamProfile, UUID> {
    /** Replaces the profile at the revision the manager saw. */
    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("""
            update CoordinationTeamProfile p set p.careAreas = :careAreas, p.languages = :languages, p.fallbackTeamId = :fallback,
                p.updatedBy = :by, p.updatedAt = :now, p.revision = p.revision + 1
            where p.teamId = :teamId and p.revision = :revision""")
    int change(@Param("teamId") UUID teamId, @Param("revision") long revision, @Param("careAreas") String careAreas,
               @Param("languages") String languages, @Param("fallback") UUID fallback, @Param("by") String by, @Param("now") Instant now);

    /** A care-coordination team with its routing profile (profile columns null and revision -1 when it has none). */
    interface TeamRow { UUID getId(); String getName(); String getStatus(); String getCareAreas(); String getLanguages(); UUID getFallbackTeamId(); Long getRevision(); }

    /** The function's teams by name, then id. */
    @Query("""
            select t.id as id, t.name as name, t.status as status, p.careAreas as careAreas, p.languages as languages,
                p.fallbackTeamId as fallbackTeamId, coalesce(p.revision, -1) as revision
            from WorkforceTeam t left join CoordinationTeamProfile p on p.teamId = t.id
            where t.functionKey = :function
            order by t.name, t.id""")
    java.util.List<TeamRow> findTeams(@Param("function") String function);
}
