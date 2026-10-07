package com.rehletshifaa.journey.infrastructure;

import com.rehletshifaa.journey.domain.CaseAccessChallenge;
import com.rehletshifaa.shared.persistence.BaseRepository;
import org.springframework.data.domain.Limit;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

public interface CaseAccessChallengeRepository extends BaseRepository<CaseAccessChallenge, UUID> {
    /** Codes sent for the link since the instant (the hourly send limit). */
    long countByLinkIdAndCreatedAtAfter(UUID linkId, Instant after);

    /** A code as verification judges it. */
    interface ChallengeState {
        UUID getId(); String getCodeHash(); Instant getExpiresAt(); Integer getAttempts(); Integer getMaxAttempts();
        Instant getConsumedAt(); Instant getRevokedAt(); String getDeliveryChannel();
    }

    /** The code a verification is checked against: the link's open code first, else its newest. */
    @Query("""
            select c.id as id, c.codeHash as codeHash, c.expiresAt as expiresAt, c.attempts as attempts, c.maxAttempts as maxAttempts,
                c.consumedAt as consumedAt, c.revokedAt as revokedAt, c.deliveryChannel as deliveryChannel
            from CaseAccessChallenge c where c.linkId = :linkId
            order by case when c.consumedAt is null and c.revokedAt is null then 0 else 1 end, c.createdAt desc""")
    List<ChallengeState> findCurrentOf(@Param("linkId") UUID linkId, Limit limit);

    /** Where the link's last verified code went: the channel and the masked destination. */
    interface VerifiedDelivery { String getDeliveryChannel(); String getDestinationHint(); }

    @Query("""
            select c.deliveryChannel as deliveryChannel, c.destinationHint as destinationHint
            from CaseAccessChallenge c where c.linkId = :linkId and c.consumedAt is not null order by c.consumedAt desc""")
    List<VerifiedDelivery> findLastVerifiedDelivery(@Param("linkId") UUID linkId, Limit limit);

    /** The grant was issued for this link by a consumed, unrevoked code and has not expired. */
    @Query("""
            select count(c) > 0 from CaseAccessChallenge c
            where c.linkId = :linkId and c.grantHash = :grantHash and c.grantExpiresAt > :now and c.consumedAt is not null
                and c.revokedAt is null""")
    boolean hasLiveGrant(@Param("linkId") UUID linkId, @Param("grantHash") String grantHash, @Param("now") Instant now);

    /** A new code supersedes every open code of the link. */
    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("update CaseAccessChallenge c set c.revokedAt = :now where c.linkId = :linkId and c.consumedAt is null and c.revokedAt is null")
    int revokeOpen(@Param("linkId") UUID linkId, @Param("now") Instant now);

    /** A wrong code: counts the attempt (guarded by the count the caller saw) and revokes the code at the limit. */
    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("""
            update CaseAccessChallenge c set c.attempts = :next,
                c.revokedAt = case when :next >= c.maxAttempts then cast(:now as Instant) else c.revokedAt end
            where c.id = :id and c.attempts = :seen and c.consumedAt is null and c.revokedAt is null""")
    int recordFailedAttempt(@Param("id") UUID id, @Param("seen") int seen, @Param("next") int next, @Param("now") Instant now);

    /** The right code: consumes it once and stores the short-lived grant it was exchanged for. */
    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("""
            update CaseAccessChallenge c set c.attempts = c.attempts + 1, c.consumedAt = :now, c.grantHash = :grantHash,
                c.grantExpiresAt = :grantExpiresAt
            where c.id = :id and c.attempts = :seen and c.consumedAt is null and c.revokedAt is null and c.expiresAt > :now""")
    int consume(@Param("id") UUID id, @Param("seen") int seen, @Param("grantHash") String grantHash,
                @Param("grantExpiresAt") Instant grantExpiresAt, @Param("now") Instant now);
}
