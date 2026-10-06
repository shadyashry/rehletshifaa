package com.rehletshifaa.journey.infrastructure;

import com.rehletshifaa.journey.domain.JourneyEdge;
import com.rehletshifaa.shared.persistence.BaseRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.UUID;

public interface JourneyEdgeRepository extends BaseRepository<JourneyEdge, JourneyEdge.Key> {
    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("delete from JourneyEdge e where e.versionId = :versionId")
    int deleteForVersion(@Param("versionId") UUID versionId);
}
