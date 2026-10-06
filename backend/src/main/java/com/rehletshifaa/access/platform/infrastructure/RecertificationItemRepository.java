package com.rehletshifaa.access.platform.infrastructure;

import com.rehletshifaa.access.platform.domain.RecertificationItem;
import com.rehletshifaa.shared.persistence.BaseRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

public interface RecertificationItemRepository extends BaseRepository<RecertificationItem, UUID> {
    List<RecertificationItem> findByCampaignIdOrderBySubjectAscRoleKeyAsc(UUID campaignId);

    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("""
            update RecertificationItem i set i.decision = :decision, i.decidedBy = :actor, i.decidedAt = :now, i.reason = :reason,
                i.revision = i.revision + 1
            where i.id = :id and i.revision = :revision and i.decision = 'PENDING'""")
    int decide(@Param("id") UUID id, @Param("revision") long revision, @Param("decision") String decision, @Param("actor") String actor,
               @Param("now") Instant now, @Param("reason") String reason);
}
