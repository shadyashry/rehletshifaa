package com.rehletshifaa.journey.infrastructure;

import com.rehletshifaa.journey.domain.JourneyCaseBinding;
import com.rehletshifaa.shared.persistence.BaseRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;
import java.util.Optional;
import java.util.UUID;

public interface JourneyCaseBindingRepository extends BaseRepository<JourneyCaseBinding, UUID> {
    Optional<JourneyCaseBinding> findByCreatedByAndCommandKey(String createdBy, String commandKey);

    /** Records the engine instance once; a second start is refused. */
    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("update JourneyCaseBinding b set b.engineInstanceRef = :reference, b.startedAt = :now where b.caseId = :caseId and b.engineInstanceRef is null")
    int started(@Param("caseId") UUID caseId, @Param("reference") String reference, @Param("now") Instant now);
}
