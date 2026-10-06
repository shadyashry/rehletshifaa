package com.rehletshifaa.journey.infrastructure;

import com.rehletshifaa.journey.domain.JourneyVersion;
import com.rehletshifaa.shared.audit.AuditEvent;
import com.rehletshifaa.shared.persistence.BaseRepository;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface JourneyVersionRepository extends BaseRepository<JourneyVersion, UUID> {
    List<JourneyVersion> findByDefinitionIdOrderByVersionNumberDesc(UUID definitionId);

    Optional<JourneyVersion> findByIdAndDefinitionId(UUID id, UUID definitionId);

    @Query("select coalesce(max(v.versionNumber), 0) + 1 from JourneyVersion v where v.definitionId = :definitionId")
    int nextNumber(@Param("definitionId") UUID definitionId);

    /** Governance history of the journey and its versions (journey actions and denied access), newest first. */
    @Query("""
            select e from AuditEvent e
            where (e.entityId = :definitionKey or e.entityId in (select cast(v.id as String) from JourneyVersion v where v.definitionId = :definitionId))
            and (e.action like 'JOURNEY_%' or e.action = 'ACCESS_DENIED')
            order by e.occurredAt desc, e.id desc""")
    List<AuditEvent> journeyAudit(@Param("definitionKey") String definitionKey, @Param("definitionId") UUID definitionId, Pageable page);

    @Query("""
            select max(e.occurredAt) from AuditEvent e
            where (e.entityId = :definitionKey or e.entityId in (select cast(v.id as String) from JourneyVersion v where v.definitionId = :definitionId))
            and e.action like 'JOURNEY_%'""")
    Instant lastJourneyActivity(@Param("definitionKey") String definitionKey, @Param("definitionId") UUID definitionId);

    /** Saving a graph returns the version to DRAFT and clears its validation and simulation, at the revision the editor saw. */
    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("""
            update JourneyVersion v set v.graphSnapshot = :graph, v.graphHash = :hash, v.status = 'DRAFT', v.validationSummary = null,
                v.simulationSummary = null, v.revision = v.revision + 1
            where v.id = :id and v.revision = :revision and v.status in ('DRAFT', 'VALIDATED', 'SIMULATED')""")
    int saveGraph(@Param("id") UUID id, @Param("revision") long revision, @Param("graph") String graph, @Param("hash") String hash);

    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("""
            update JourneyVersion v set v.status = :status, v.validationSummary = :validation, v.simulationSummary = :simulation,
                v.publishedAt = :publishedAt, v.retiredAt = :retiredAt, v.revision = v.revision + 1
            where v.id = :id and v.revision = :revision""")
    int transition(@Param("id") UUID id, @Param("revision") long revision, @Param("status") String status,
                   @Param("validation") String validation, @Param("simulation") String simulation,
                   @Param("publishedAt") Instant publishedAt, @Param("retiredAt") Instant retiredAt);
}
