package com.rehletshifaa.journey.infrastructure;

import com.rehletshifaa.journey.domain.JourneyNode;
import com.rehletshifaa.shared.persistence.BaseRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.UUID;

public interface JourneyNodeRepository extends BaseRepository<JourneyNode, JourneyNode.Key> {
    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("delete from JourneyNode n where n.versionId = :versionId")
    int deleteForVersion(@Param("versionId") UUID versionId);
}
