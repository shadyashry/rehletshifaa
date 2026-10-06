package com.rehletshifaa.journey.infrastructure;

import com.rehletshifaa.journey.domain.JourneyShadowRun;
import com.rehletshifaa.shared.persistence.BaseRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Optional;
import java.util.UUID;

public interface JourneyShadowRunRepository extends BaseRepository<JourneyShadowRun, UUID> {
    Optional<JourneyShadowRun> findByCreatedByAndCommandKey(String createdBy, String commandKey);

    /** A step completed at the revision the caller saw. */
    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("update JourneyShadowRun r set r.revision = r.revision + 1 where r.id = :id and r.revision = :revision")
    int advance(@Param("id") UUID id, @Param("revision") long revision);
}
