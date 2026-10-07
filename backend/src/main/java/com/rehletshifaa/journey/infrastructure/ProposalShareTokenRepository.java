package com.rehletshifaa.journey.infrastructure;

import com.rehletshifaa.journey.domain.ProposalShareToken;
import com.rehletshifaa.shared.persistence.BaseRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;
import java.util.UUID;

public interface ProposalShareTokenRepository extends BaseRepository<ProposalShareToken, UUID> {
    interface LiveLink { UUID getId(); UUID getVersionId(); UUID getCaseId(); Instant getConsumedAt(); Instant getRevokedAt(); Instant getExpiresAt(); }

    /** The open link with this token hash, while its version is still released (the caller checks expiry). */
    @Query("""
            select t.id as id, t.proposalVersionId as versionId, t.caseId as caseId, t.consumedAt as consumedAt, t.revokedAt as revokedAt,
                t.expiresAt as expiresAt
            from ProposalShareToken t join ProposalVersion v on v.id = t.proposalVersionId
            where t.tokenHash = :tokenHash and t.consumedAt is null and t.revokedAt is null and v.status in ('RELEASED', 'VIEWED')""")
    java.util.Optional<LiveLink> findLive(@Param("tokenHash") String tokenHash);

    /** The link was used for the decision: consumed and closed at once. */
    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("""
            update ProposalShareToken t set t.consumedAt = :now, t.revokedAt = :now
            where t.id = :id and t.consumedAt is null and t.revokedAt is null""")
    int consume(@Param("id") UUID id, @Param("now") Instant now);

    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("update ProposalShareToken t set t.revokedAt = :now where t.proposalVersionId = :versionId and t.revokedAt is null")
    int revokeForVersion(@Param("versionId") UUID versionId, @Param("now") Instant now);

    /** A newly released version replaces every open link of the case. */
    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("update ProposalShareToken t set t.revokedAt = :now where t.caseId = :caseId and t.revokedAt is null and t.consumedAt is null")
    int revokeOpenForCase(@Param("caseId") UUID caseId, @Param("now") Instant now);
}
