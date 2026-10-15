package com.rehletshifaa.shared.scheduling.domain;

import com.rehletshifaa.shared.persistence.PersistableEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.Instant;
import java.util.Objects;

/**
 * P1-8 (E-04): one scheduled job's lease. Whoever holds the row until {@code lockedUntil} is the only instance that runs the
 * job; the row also keeps the job's last start, success and failure. Changed only by the guarded updates in
 * {@code SchedulerLeaseRepository}; this class only creates the row, already taken, the first time a job runs.
 */
@Entity
@Table(name = "scheduler_leases")
public class SchedulerLease extends PersistableEntity<String> {
    @Id private String name;
    @Column(nullable = false) private String holder;
    @Column(nullable = false) private Instant lockedAt;
    @Column(nullable = false) private Instant lockedUntil;
    @Column(nullable = false) private Instant lastStartedAt;
    private Instant lastSucceededAt;
    private Instant lastFailedAt;
    private String lastErrorCode;

    protected SchedulerLease() {}

    public static SchedulerLease taken(String name, String holder, Instant now, Instant until) {
        SchedulerLease lease = new SchedulerLease();
        lease.name = Objects.requireNonNull(name, "name");
        lease.holder = Objects.requireNonNull(holder, "holder");
        lease.lockedAt = lease.lastStartedAt = Objects.requireNonNull(now, "now");
        lease.lockedUntil = Objects.requireNonNull(until, "until");
        return lease;
    }

    @Override public String getId() { return name; }
    public String getName() { return name; }
    public String getHolder() { return holder; }
    public Instant getLockedAt() { return lockedAt; }
    public Instant getLockedUntil() { return lockedUntil; }
    public Instant getLastStartedAt() { return lastStartedAt; }
    public Instant getLastSucceededAt() { return lastSucceededAt; }
    public Instant getLastFailedAt() { return lastFailedAt; }
    public String getLastErrorCode() { return lastErrorCode; }
}
