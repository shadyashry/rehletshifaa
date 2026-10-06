package com.rehletshifaa.journey.infrastructure;

import com.rehletshifaa.journey.domain.JourneyStageProjection;
import com.rehletshifaa.shared.persistence.BaseRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface JourneyStageProjectionRepository extends BaseRepository<JourneyStageProjection, UUID> {
    Optional<JourneyStageProjection> findByEngineTaskReference(String engineTaskReference);

    Optional<JourneyStageProjection> findFirstByCaseIdAndNodeKeyOrderByCreatedAtDesc(UUID caseId, String nodeKey);

    Optional<JourneyStageProjection> findByCaseIdAndCaseTaskId(UUID caseId, UUID caseTaskId);

    List<JourneyStageProjection> findByCaseIdOrderByCreatedAt(UUID caseId);

    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("update JourneyStageProjection p set p.status = 'COMPLETED', p.completedAt = :now, p.advancedAt = :now where p.id = :id and p.status = 'OPEN'")
    int complete(@Param("id") UUID id, @Param("now") Instant now);
}
