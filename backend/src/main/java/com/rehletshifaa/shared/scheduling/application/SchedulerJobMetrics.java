package com.rehletshifaa.shared.scheduling.application;

import com.rehletshifaa.shared.metrics.CachedSnapshot;
import com.rehletshifaa.shared.scheduling.domain.SchedulerLease;
import com.rehletshifaa.shared.scheduling.infrastructure.SchedulerLeaseRepository;
import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.Gauge;
import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.Timer;
import org.springframework.stereotype.Component;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.HashMap;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * P1-8 (E-04, E-05): the scheduled jobs' health meters, one series per leased job ({@code task} = the lease name; not
 * {@code job}, which is Prometheus's own target label):
 * <ul>
 *   <li>{@code scheduler.job.duration} (timer): each run this instance made;</li>
 *   <li>{@code scheduler.job.failures} (counter): runs that threw;</li>
 *   <li>{@code scheduler.job.last.success} (gauge, epoch seconds): the job's last success on any instance, read from
 *       {@code scheduler_leases} through a 30 s snapshot; a job that has not succeeded yet reports when this instance started,
 *       so "no success within twice the cadence" also fires for a job that never runs;</li>
 *   <li>{@code scheduler.job.cadence} (gauge, seconds): the job's fixed delay or the interval between two cron firings, so
 *       the alert reads {@code time() - last_success > 2 * cadence} without a table of cadences.</li>
 * </ul>
 */
@Component
public class SchedulerJobMetrics {
    private final MeterRegistry registry;
    private final Instant startedAt;
    private final CachedSnapshot<Map<String, Instant>> lastSuccess;
    private final Map<String, Timer> durations = new ConcurrentHashMap<>();
    private final Map<String, Counter> failures = new ConcurrentHashMap<>();
    private final Map<String, Boolean> registered = new ConcurrentHashMap<>();

    public SchedulerJobMetrics(MeterRegistry registry, SchedulerLeaseRepository leases, Clock clock) {
        this.registry = registry;
        this.startedAt = clock.instant();
        this.lastSuccess = new CachedSnapshot<>(() -> {
            Map<String, Instant> latest = new HashMap<>();
            for (SchedulerLease lease : leases.findAll())
                if (lease.getLastSucceededAt() != null) latest.put(lease.getName(), lease.getLastSucceededAt());
            return latest;
        }, clock, Duration.ofSeconds(30));
    }

    /** Registers every meter of a job, at startup, so each series exists before the job first runs. */
    public void register(String job, Duration cadence) {
        if (registered.putIfAbsent(job, true) != null) return;
        duration(job);
        failures(job);
        Gauge.builder("scheduler.job.last.success", () -> lastSuccess.get().getOrDefault(job, startedAt).getEpochSecond())
                .description("Last successful run of the scheduled job on any instance").baseUnit("seconds").tag("task", job)
                .strongReference(true).register(registry);
        if (cadence != null)
            Gauge.builder("scheduler.job.cadence", cadence::toSeconds).description("How often the scheduled job is due")
                    .baseUnit("seconds").tag("task", job).strongReference(true).register(registry);
    }

    Timer duration(String job) {
        return durations.computeIfAbsent(job, name -> Timer.builder("scheduler.job.duration").description("Scheduled job runs on this instance")
                .tag("task", name).register(registry));
    }

    void failed(String job) { failures(job).increment(); }

    private Counter failures(String job) {
        return failures.computeIfAbsent(job, name -> Counter.builder("scheduler.job.failures").description("Scheduled job runs that threw")
                .tag("task", name).register(registry));
    }
}
