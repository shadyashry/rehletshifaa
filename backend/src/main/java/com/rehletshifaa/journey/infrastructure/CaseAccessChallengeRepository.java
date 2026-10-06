package com.rehletshifaa.journey.infrastructure;

import com.rehletshifaa.journey.domain.CaseAccessChallenge;
import com.rehletshifaa.shared.persistence.BaseRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;
import java.util.UUID;

public interface CaseAccessChallengeRepository extends BaseRepository<CaseAccessChallenge, UUID> {
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
