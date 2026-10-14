package com.rehletshifaa.shared.scheduling.application;

import com.rehletshifaa.shared.scheduling.infrastructure.SchedulerLeaseRepository;
import com.rehletshifaa.shared.scheduling.domain.SchedulerLease;
import io.micrometer.core.instrument.Timer;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Component;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.support.TransactionTemplate;

import java.lang.management.ManagementFactory;
import java.time.Duration;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.Objects;
import java.util.Optional;

/**
 * P1-8 (E-04): runs a job under its scheduler lease. Taking and releasing are each one short transaction of their own
 * ({@code REQUIRES_NEW}), outside the job's transaction, and read the time from the database. A job that throws still
 * releases the lease (stamping {@code last_failed_at} and the exception's class as {@code last_error_code}, never its
 * message); a release that fails is logged and the lease then frees itself at its maximum hold.
 */
@Component
public class SchedulerLeases {
    private static final Logger log = LoggerFactory.getLogger(SchedulerLeases.class);

    /** What a job is leased for: the row name, how long the lease stays closed after a run, and the hold while it runs. */
    public record Terms(String name, Duration minHold, Duration maxHold) {
        public Terms {
            Objects.requireNonNull(name, "name");
            if (minHold.isNegative() || !maxHold.isPositive()) throw new IllegalArgumentException("A lease holds for a positive time");
        }
    }

    /** A lease this instance holds: the take it came from is identified by {@code lockedAt}. */
    public record Lease(String name, String holder, Instant lockedAt) {}

    @FunctionalInterface
    public interface Job { void run() throws Throwable; }

    private final SchedulerLeaseRepository leases;
    private final TransactionTemplate tx;
    private final SchedulerJobMetrics metrics;
    private final String holder;

    @Autowired
    public SchedulerLeases(SchedulerLeaseRepository leases, PlatformTransactionManager transactions, SchedulerJobMetrics metrics) {
        this(leases, transactions, metrics, instanceId());
    }

    /** With an explicit holder: a second instance, in tests. */
    public SchedulerLeases(SchedulerLeaseRepository leases, PlatformTransactionManager transactions, SchedulerJobMetrics metrics, String holder) {
        this.leases = leases;
        this.tx = new TransactionTemplate(transactions);
        this.tx.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRES_NEW);
        this.metrics = metrics;
        this.holder = holder;
    }

    public String holder() { return holder; }

    /** Runs {@code job} when this instance takes the lease; returns false, having run nothing, when another instance holds it. */
    public boolean run(Terms terms, Job job) throws Throwable {
        Optional<Lease> taken = tryTake(terms);
        if (taken.isEmpty()) {
            log.debug("Scheduled job {} skipped: another instance holds its lease", terms.name());
            return false;
        }
        Timer.Sample sample = Timer.start();
        try {
            job.run();
            release(taken.get(), terms, null);
            return true;
        } catch (Throwable failure) {
            metrics.failed(terms.name());
            release(taken.get(), terms, failure);
            throw failure;
        } finally {
            sample.stop(metrics.duration(terms.name()));
        }
    }

    public Optional<Lease> tryTake(Terms terms) {
        try {
            return Optional.ofNullable(tx.execute(status -> {
                Instant now = databaseNow();
                Instant until = now.plus(terms.maxHold());
                if (leases.take(terms.name(), holder, now, until) == 1) return new Lease(terms.name(), holder, now);
                if (leases.existsById(terms.name())) return null;
                leases.saveAndFlush(SchedulerLease.taken(terms.name(), holder, now, until));
                return new Lease(terms.name(), holder, now);
            }));
        } catch (DataIntegrityViolationException raced) {
            return Optional.empty(); // another instance inserted the job's first row at the same moment and holds it
        }
    }

    /** Ends the run: closed to the other instances for the minimum hold, with the success or the failure stamped. */
    public void release(Lease lease, Terms terms, Throwable failure) {
        try {
            Integer released = tx.execute(status -> {
                Instant now = databaseNow();
                Instant until = now.plus(terms.minHold());
                return failure == null
                        ? leases.releaseSucceeded(lease.name(), lease.holder(), lease.lockedAt(), now, until)
                        : leases.releaseFailed(lease.name(), lease.holder(), lease.lockedAt(), now, until, errorCode(failure));
            });
            if (released == null || released == 0)
                log.atWarn().addKeyValue("event.code", "SCHEDULER_LEASE_LOST").addKeyValue("job", lease.name())
                        .log("Scheduled job {} outlived its lease; another instance took it", lease.name());
        } catch (RuntimeException releaseFailure) {
            log.atWarn().addKeyValue("event.code", "SCHEDULER_LEASE_RELEASE_FAILED").addKeyValue("job", lease.name())
                    .log("Scheduled job {} could not release its lease ({}); it frees itself at its maximum hold",
                            lease.name(), releaseFailure.getClass().getSimpleName());
        }
    }

    private Instant databaseNow() {
        // Microseconds, the column precision, so the take's lockedAt matches the stored value exactly at release.
        return leases.databaseNow().truncatedTo(ChronoUnit.MICROS);
    }

    private static String errorCode(Throwable failure) {
        String code = failure.getClass().getSimpleName();
        return code.isEmpty() ? "UNKNOWN" : code.length() > 120 ? code.substring(0, 120) : code;
    }

    /** {@code pid@host}: one per process (a container's host name is its id), shared by every context in one JVM. */
    private static String instanceId() {
        String id = ManagementFactory.getRuntimeMXBean().getName();
        return id.length() > 160 ? id.substring(0, 160) : id;
    }
}
