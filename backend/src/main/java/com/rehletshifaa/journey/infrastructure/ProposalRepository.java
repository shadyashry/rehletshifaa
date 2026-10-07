package com.rehletshifaa.journey.infrastructure;

import com.rehletshifaa.journey.domain.Proposal;
import com.rehletshifaa.shared.persistence.BaseRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;
import java.util.UUID;

public interface ProposalRepository extends BaseRepository<Proposal, UUID> {
    @Query("select p.id from Proposal p where p.caseId = :caseId")
    java.util.Optional<UUID> findIdByCaseId(@Param("caseId") UUID caseId);

    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("update Proposal p set p.currentVersion = :current, p.updatedAt = :now, p.version = p.version + 1 where p.id = :id")
    int advanceTo(@Param("id") UUID id, @Param("current") int current, @Param("now") Instant now);
}
