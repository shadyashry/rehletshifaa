package com.rehletshifaa.notification.infrastructure;

import com.rehletshifaa.notification.domain.QueuedNotification;
import com.rehletshifaa.shared.persistence.BaseRepository;
import jakarta.persistence.LockModeType;
import jakarta.persistence.QueryHint;
import org.springframework.data.domain.Limit;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.jpa.repository.QueryHints;
import org.springframework.data.repository.query.Param;

import java.time.Instant;
import java.util.Optional;
import java.util.UUID;

public interface QueuedNotificationRepository extends BaseRepository<QueuedNotification, UUID> {
    boolean existsByIdempotencyKey(String idempotencyKey);

    Optional<QueuedNotification> findFirstByIdempotencyKeyContainingOrderByCreatedAtDesc(String fragment);

    long countByIdempotencyKeyStartingWithAndCreatedAtAfter(String prefix, Instant after);

    /** Lock timeout -2 is SKIP LOCKED: each instance takes different due messages instead of waiting. */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @QueryHints(@QueryHint(name = "jakarta.persistence.lock.timeout", value = "-2"))
    @Query("""
            select m from QueuedNotification m
            where m.status in ('PENDING', 'RETRY', 'PROCESSING') and m.nextAttemptAt <= :now and m.attempts < m.maxAttempts
            order by m.createdAt""")
    java.util.List<QueuedNotification> lockDue(@Param("now") Instant now, Limit limit);

    /** A lease that expired after the last allowed attempt has an unknown outcome; park it rather than retry forever. */
    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("""
            update QueuedNotification m set m.status = 'DEAD_LETTER', m.lastErrorCode = coalesce(m.lastErrorCode, 'UNKNOWN_OUTCOME')
            where m.status = 'PROCESSING' and m.nextAttemptAt <= :now and m.attempts >= m.maxAttempts""")
    int parkStranded(@Param("now") Instant now);

    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("update QueuedNotification m set m.status = 'PROCESSING', m.attempts = m.attempts + 1, m.nextAttemptAt = :leaseExpiresAt where m.id = :id")
    int lease(@Param("id") UUID id, @Param("leaseExpiresAt") Instant leaseExpiresAt);

    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("""
            update QueuedNotification m set m.status = 'RETRY', m.attempts = m.attempts - 1, m.nextAttemptAt = :now
            where m.id = :id and m.status = 'PROCESSING' and m.attempts = :attempt""")
    int release(@Param("id") UUID id, @Param("attempt") int attempt, @Param("now") Instant now);

    /** Delivered: the template data is dropped, since it holds patient-identifying text. */
    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("""
            update QueuedNotification m set m.status = 'DELIVERED', m.providerReference = :reference, m.deliveredAt = :now,
                m.lastErrorCode = null, m.templateData = '{}'
            where m.id = :id and m.status = 'PROCESSING' and m.attempts = :attempt""")
    int delivered(@Param("id") UUID id, @Param("attempt") int attempt, @Param("reference") String reference, @Param("now") Instant now);

    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("""
            update QueuedNotification m set m.status = :status, m.nextAttemptAt = :nextAttemptAt, m.lastErrorCode = :code
            where m.id = :id and m.status = 'PROCESSING' and m.attempts = :attempt""")
    int failed(@Param("id") UUID id, @Param("attempt") int attempt, @Param("status") String status,
               @Param("nextAttemptAt") Instant nextAttemptAt, @Param("code") String code);

    /** Queued resends of a superseded proposal version are not sent any more. */
    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("update QueuedNotification m set m.status = 'DEAD_LETTER' where m.idempotencyKey like :pattern and m.status in ('PENDING', 'RETRY')")
    int cancelQueued(@Param("pattern") String pattern);

    /** Provider delivery receipts arrive out of order; an older receipt never overwrites a newer one. */
    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("""
            update QueuedNotification m set m.providerDeliveryStatus = :status, m.providerStatusAt = :at, m.providerErrorCode = :errorCode
            where m.providerReference = :reference and (m.providerStatusAt is null or m.providerStatusAt <= :at)""")
    int recordProviderStatus(@Param("reference") String reference, @Param("status") String status, @Param("at") Instant at,
                             @Param("errorCode") String errorCode);
}
