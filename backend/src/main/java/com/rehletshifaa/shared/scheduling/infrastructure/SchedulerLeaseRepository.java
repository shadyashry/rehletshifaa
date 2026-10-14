package com.rehletshifaa.shared.scheduling.infrastructure;

import com.rehletshifaa.shared.persistence.BaseRepository;
import com.rehletshifaa.shared.scheduling.domain.SchedulerLease;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;

/** P1-8 (E-04): the scheduler leases. Every time comes from {@link #databaseNow()}, never from an instance clock. */
public interface SchedulerLeaseRepository extends BaseRepository<SchedulerLease, String> {
    /** The database clock (the transaction's start time), so instances with skewed clocks agree on who holds a lease. */
    @Query("select current_timestamp")
    Instant databaseNow();

    /**
     * Takes the lease when it is free: its window has passed, or this holder released it (the holder's own scheduler paces it,
     * so the minimum hold only keeps the other instances out). One guarded update, so two instances racing for the row cannot
     * both win: the second waits for the first's row lock and then no longer matches.
     */
    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("""
            update SchedulerLease l set l.holder = :holder, l.lockedAt = :now, l.lockedUntil = :until, l.lastStartedAt = :now
            where l.name = :name and (l.lockedUntil <= :now
                or (l.holder = :holder and (l.lastSucceededAt >= l.lockedAt or l.lastFailedAt >= l.lockedAt)))""")
    int take(@Param("name") String name, @Param("holder") String holder, @Param("now") Instant now, @Param("until") Instant until);

    /** Releases a lease this holder still holds (same take), keeping it closed to the others until {@code until}. */
    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("""
            update SchedulerLease l set l.lockedUntil = :until, l.lastSucceededAt = :now
            where l.name = :name and l.holder = :holder and l.lockedAt = :lockedAt""")
    int releaseSucceeded(@Param("name") String name, @Param("holder") String holder, @Param("lockedAt") Instant lockedAt,
                         @Param("now") Instant now, @Param("until") Instant until);

    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("""
            update SchedulerLease l set l.lockedUntil = :until, l.lastFailedAt = :now, l.lastErrorCode = :errorCode
            where l.name = :name and l.holder = :holder and l.lockedAt = :lockedAt""")
    int releaseFailed(@Param("name") String name, @Param("holder") String holder, @Param("lockedAt") Instant lockedAt,
                      @Param("now") Instant now, @Param("until") Instant until, @Param("errorCode") String errorCode);
}
