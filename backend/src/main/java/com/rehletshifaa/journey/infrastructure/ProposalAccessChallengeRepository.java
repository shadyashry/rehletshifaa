package com.rehletshifaa.journey.infrastructure;

import com.rehletshifaa.journey.domain.ProposalAccessChallenge;
import com.rehletshifaa.shared.persistence.BaseRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;
import java.util.UUID;

public interface ProposalAccessChallengeRepository extends BaseRepository<ProposalAccessChallenge, UUID> {
    long countByShareTokenIdAndCreatedAtAfter(UUID shareTokenId, Instant since);

    interface CodeRow {
        UUID getId(); String getCodeHash(); Instant getExpiresAt(); Integer getAttempts(); Integer getMaxAttempts(); Instant getConsumedAt();
        Instant getRevokedAt(); String getDeliveryChannel();
    }

    /** The link's codes, newest first (pass {@code Limit.of(1)} for the current one). */
    @Query("""
            select c.id as id, c.codeHash as codeHash, c.expiresAt as expiresAt, c.attempts as attempts, c.maxAttempts as maxAttempts,
                c.consumedAt as consumedAt, c.revokedAt as revokedAt, c.deliveryChannel as deliveryChannel
            from ProposalAccessChallenge c where c.shareTokenId = :shareTokenId order by c.createdAt desc""")
    java.util.List<CodeRow> findLatest(@Param("shareTokenId") UUID shareTokenId, org.springframework.data.domain.Limit limit);

    /** A consumed code of the link exchanged for this grant, unexpired and not revoked. */
    @Query("""
            select count(c) > 0 from ProposalAccessChallenge c where c.shareTokenId = :shareTokenId and c.grantHash = :grantHash
            and c.grantExpiresAt > :now and c.consumedAt is not null and c.revokedAt is null""")
    boolean hasLiveGrant(@Param("shareTokenId") UUID shareTokenId, @Param("grantHash") String grantHash, @Param("now") Instant now);

    /** A new code supersedes the open codes of the link. */
    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("""
            update ProposalAccessChallenge c set c.revokedAt = :now
            where c.shareTokenId = :shareTokenId and c.consumedAt is null and c.revokedAt is null""")
    int revokeOpen(@Param("shareTokenId") UUID shareTokenId, @Param("now") Instant now);

    /** The link is closed: every code of it ends, consumed grants included. */
    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("update ProposalAccessChallenge c set c.revokedAt = :now where c.shareTokenId = :shareTokenId and c.revokedAt is null")
    int revokeAll(@Param("shareTokenId") UUID shareTokenId, @Param("now") Instant now);

    /** Ends the codes of every open link of the case. */
    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("""
            update ProposalAccessChallenge c set c.revokedAt = :now
            where c.revokedAt is null and c.shareTokenId in (select t.id from ProposalShareToken t
                where t.caseId = :caseId and t.revokedAt is null and t.consumedAt is null)""")
    int revokeOpenForCase(@Param("caseId") UUID caseId, @Param("now") Instant now);

    /** A wrong code: counts the attempt (guarded by the count the caller saw) and revokes the code at the limit. */
    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("""
            update ProposalAccessChallenge c set c.attempts = :next,
                c.revokedAt = case when :next >= c.maxAttempts then cast(:now as Instant) else c.revokedAt end
            where c.id = :id and c.attempts = :seen and c.consumedAt is null and c.revokedAt is null""")
    int recordFailedAttempt(@Param("id") UUID id, @Param("seen") int seen, @Param("next") int next, @Param("now") Instant now);

    /** The right code: consumes it once and stores the short-lived grant it was exchanged for. */
    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("""
            update ProposalAccessChallenge c set c.attempts = c.attempts + 1, c.consumedAt = :now, c.grantHash = :grantHash,
                c.grantExpiresAt = :grantExpiresAt
            where c.id = :id and c.attempts = :seen and c.consumedAt is null and c.revokedAt is null and c.expiresAt > :now""")
    int consume(@Param("id") UUID id, @Param("seen") int seen, @Param("grantHash") String grantHash,
                @Param("grantExpiresAt") Instant grantExpiresAt, @Param("now") Instant now);
}
