package com.rehletshifaa.workforce.infrastructure;

import com.rehletshifaa.workforce.domain.WorkforceTeam;
import com.rehletshifaa.shared.persistence.BaseRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface WorkforceTeamRepository extends BaseRepository<WorkforceTeam, UUID> {
    boolean existsByFunctionKeyAndName(String functionKey, String name);

    @Query("select t from WorkforceTeam t order by t.functionKey, t.name, t.id")
    List<WorkforceTeam> findAllOrdered();

    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("""
            update WorkforceTeam t set t.status = 'RETIRED', t.updatedAt = :now, t.revision = t.revision + 1
            where t.id = :id and t.revision = :revision and t.status = 'ACTIVE'""")
    int retire(@Param("id") UUID id, @Param("revision") long revision, @Param("now") Instant now);
}
