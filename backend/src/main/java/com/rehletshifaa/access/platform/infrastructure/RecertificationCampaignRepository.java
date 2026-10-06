package com.rehletshifaa.access.platform.infrastructure;

import com.rehletshifaa.access.platform.domain.RecertificationCampaign;
import com.rehletshifaa.shared.persistence.BaseRepository;
import org.springframework.data.domain.Limit;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface RecertificationCampaignRepository extends BaseRepository<RecertificationCampaign, UUID> {
    @Query("select max(c.startedAt) from RecertificationCampaign c where c.scope = :scope")
    Optional<Instant> findLastStart(@Param("scope") String scope);

    boolean existsByScopeAndStatus(String scope, String status);

    @Query("select c from RecertificationCampaign c order by c.startedAt desc, c.id")
    List<RecertificationCampaign> findNewest(Limit limit);

    @Query("select c from RecertificationCampaign c where c.status = 'OPEN' and c.dueAt <= :now")
    List<RecertificationCampaign> findOverdue(@Param("now") Instant now);
}
