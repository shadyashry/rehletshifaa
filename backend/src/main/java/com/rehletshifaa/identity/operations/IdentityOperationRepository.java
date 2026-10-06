package com.rehletshifaa.identity.operations;

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
import java.util.Collection;
import java.util.List;
import java.util.UUID;

public interface IdentityOperationRepository extends BaseRepository<IdentityOperation, UUID> {
    /** Lock timeout -2 is SKIP LOCKED: concurrent workers each take different due rows instead of waiting. */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @QueryHints(@QueryHint(name = "jakarta.persistence.lock.timeout", value = "-2"))
    @Query("""
            select o from IdentityOperation o
            where o.abandonedAt is null and o.attempts < o.maxAttempts and o.nextAttemptAt <= :now
                and (o.status in ('PENDING', 'RETRYING') or (o.status = 'RUNNING' and o.leaseExpiresAt <= :now))
            order by o.createdAt""")
    List<IdentityOperation> lockDue(@Param("now") Instant now, Limit limit);

    @Query("select o from IdentityOperation o order by o.createdAt desc")
    List<IdentityOperation> findNewest(Limit limit);

    @Query("select o from IdentityOperation o where o.status = :status order by o.createdAt desc")
    List<IdentityOperation> findNewestByStatus(@Param("status") String status, Limit limit);

    boolean existsByTargetSubjectAndStatusIn(String targetSubject, Collection<String> statuses);

    /** A lease that expired on the last allowed attempt has an unknown outcome and is not retried automatically. */
    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("""
            update IdentityOperation o set o.status = 'DEAD', o.lastErrorCode = coalesce(o.lastErrorCode, 'UNKNOWN_OUTCOME'),
                o.updatedAt = :now, o.revision = o.revision + 1
            where o.status = 'RUNNING' and o.leaseExpiresAt <= :now and o.attempts >= o.maxAttempts""")
    int expireExhaustedLeases(@Param("now") Instant now);

    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("""
            update IdentityOperation o set o.status = 'RUNNING', o.attempts = o.attempts + 1, o.leaseExpiresAt = :lease,
                o.nextAttemptAt = :lease, o.updatedAt = :now, o.revision = o.revision + 1
            where o.id = :id""")
    int claim(@Param("id") UUID id, @Param("lease") Instant lease, @Param("now") Instant now);

    /** Only the worker that still owns this attempt can complete it. */
    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("""
            update IdentityOperation o set o.status = 'SUCCEEDED', o.completedAt = :now, o.leaseExpiresAt = null,
                o.resultSubject = coalesce(:resultSubject, o.resultSubject), o.lastErrorCode = null, o.updatedAt = :now,
                o.revision = o.revision + 1
            where o.id = :id and o.status = 'RUNNING' and o.attempts = :attempt""")
    int succeed(@Param("id") UUID id, @Param("attempt") int attempt, @Param("resultSubject") String resultSubject, @Param("now") Instant now);

    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("""
            update IdentityOperation o set o.status = :status, o.nextAttemptAt = :nextAttemptAt, o.leaseExpiresAt = null,
                o.lastErrorCode = :code, o.updatedAt = :now, o.revision = o.revision + 1
            where o.id = :id and o.status = 'RUNNING' and o.attempts = :attempt""")
    int fail(@Param("id") UUID id, @Param("attempt") int attempt, @Param("status") String status,
             @Param("nextAttemptAt") Instant nextAttemptAt, @Param("code") String code, @Param("now") Instant now);

    /** Gives the attempt back without counting it (the worker could not start it). */
    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("""
            update IdentityOperation o set o.status = 'RETRYING', o.attempts = o.attempts - 1, o.nextAttemptAt = :now,
                o.leaseExpiresAt = null, o.updatedAt = :now, o.revision = o.revision + 1
            where o.id = :id and o.status = 'RUNNING' and o.attempts = :attempt""")
    int release(@Param("id") UUID id, @Param("attempt") int attempt, @Param("now") Instant now);

    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("""
            update IdentityOperation o set o.status = 'PENDING', o.attempts = 0, o.nextAttemptAt = :now, o.leaseExpiresAt = null,
                o.lastErrorCode = null, o.abandonedAt = null, o.abandonedBy = null, o.abandonReason = null, o.updatedAt = :now,
                o.revision = o.revision + 1
            where o.id = :id and o.status = 'DEAD' and o.revision = :revision""")
    int retry(@Param("id") UUID id, @Param("revision") long revision, @Param("now") Instant now);

    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("""
            update IdentityOperation o set o.status = 'DEAD', o.abandonedAt = :now, o.abandonedBy = :actor, o.abandonReason = :reason,
                o.leaseExpiresAt = null, o.updatedAt = :now, o.revision = o.revision + 1
            where o.id = :id and o.status in ('PENDING', 'RETRYING', 'DEAD') and o.abandonedAt is null and o.revision = :revision""")
    int abandon(@Param("id") UUID id, @Param("revision") long revision, @Param("actor") String actor,
                @Param("reason") String reason, @Param("now") Instant now);
}
