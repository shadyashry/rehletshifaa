package com.rehletshifaa.retention.application;

import com.rehletshifaa.casemanagement.infrastructure.MedicalCaseRepository;
import com.rehletshifaa.retention.domain.RecordClass;
import com.rehletshifaa.retention.domain.RetentionPolicy;
import com.rehletshifaa.retention.infrastructure.RetentionPolicyRepository;
import com.rehletshifaa.shared.scheduling.application.LeasedJob;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.domain.Limit;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.time.Clock;
import java.time.Duration;
import java.util.EnumMap;
import java.util.EnumSet;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

/**
 * P1-7 (review E-03): the nightly purge. For each record class that has a purge handler it reads the class's policy and runs the
 * handler only when the policy has days and no legal hold ({@link RetentionPolicy#purgeable()}); a held class is skipped and said
 * so in the log. Each purged subject is its own transaction with its log and audit rows; a failure on one is logged
 * ({@code event.code=RETENTION_PURGE_FAILED}) and the rest go on, so it is retried the next night.
 *
 * <p>{@link RecordClass#LEGAL_RECORD} has no handler and never will: {@link #ENFORCED} is checked at start-up.
 */
@Component
public class RetentionPurgeJob {
    private static final Logger log = LoggerFactory.getLogger(RetentionPurgeJob.class);

    /** The classes a handler purges today. Every other class is kept until its handler is built (the policy view says which). */
    public static final Set<RecordClass> ENFORCED = EnumSet.of(RecordClass.DRAFT_INTAKE, RecordClass.TRANSPORT_LOG);

    static {
        if (ENFORCED.contains(RecordClass.LEGAL_RECORD)) throw new IllegalStateException("A legal record is never purged");
    }

    private final RetentionPolicyRepository policies;
    private final MedicalCaseRepository cases;
    private final DraftPurge drafts;
    private final TransportLogPurge transport;
    private final Clock clock;
    private final int batch;

    public RetentionPurgeJob(RetentionPolicyRepository policies, MedicalCaseRepository cases, DraftPurge drafts, TransportLogPurge transport,
                             Clock clock, @Value("${app.retention.draft-batch:500}") int batch) {
        this.policies = policies; this.cases = cases; this.drafts = drafts; this.transport = transport; this.clock = clock;
        this.batch = Math.max(1, batch);
    }

    /** The job: one pass over every enforced class; how many subjects each purged. */
    @LeasedJob(maxHold = LeasedJob.DAILY)
    @Scheduled(cron = "${app.retention.purge-cron:0 15 3 * * *}", zone = "Africa/Cairo")
    public Map<RecordClass, Integer> run() { return purgeDue(); }

    /** One pass over every enforced class, unleased (the job's body; tests call it directly). */
    public Map<RecordClass, Integer> purgeDue() {
        Map<RecordClass, Integer> purged = new EnumMap<>(RecordClass.class);
        policy(RecordClass.DRAFT_INTAKE).ifPresent(p -> purged.put(RecordClass.DRAFT_INTAKE, purgeDrafts(p)));
        policy(RecordClass.TRANSPORT_LOG).ifPresent(p -> purged.put(RecordClass.TRANSPORT_LOG, purgeTransport(p)));
        if (purged.values().stream().anyMatch(n -> n > 0)) log.info("Retention purge: {}", purged);
        return purged;
    }

    private java.util.Optional<RetentionPolicy> policy(RecordClass recordClass) {
        RetentionPolicy policy = policies.findById(recordClass).orElse(null);
        if (policy == null || !policy.purgeable()) {
            log.info("Retention purge of {} skipped: {}", recordClass, policy == null ? "no policy" : policy.isLegalHold() ? "legal hold" : "no term");
            return java.util.Optional.empty();
        }
        return java.util.Optional.of(policy);
    }

    private int purgeDrafts(RetentionPolicy policy) {
        int purged = 0;
        var due = cases.findAbandonedDrafts(clock.instant().minus(Duration.ofDays(policy.getRetentionDays())), Limit.of(batch));
        for (UUID caseId : due) {
            try { if (drafts.purgeAbandoned(caseId, policy).isPresent()) purged++; }
            catch (RuntimeException e) {
                log.atWarn().addKeyValue("event.code", "RETENTION_PURGE_FAILED").addKeyValue("record.class", RecordClass.DRAFT_INTAKE)
                        .log("Draft {} not purged: {}", caseId, e.getClass().getSimpleName());
            }
        }
        return purged;
    }

    private int purgeTransport(RetentionPolicy policy) {
        try { return transport.purge(policy).map(p -> p.getRowsAffected()).orElse(0); }
        catch (RuntimeException e) {
            log.atWarn().addKeyValue("event.code", "RETENTION_PURGE_FAILED").addKeyValue("record.class", RecordClass.TRANSPORT_LOG)
                    .log("Transport log not purged: {}", e.getClass().getSimpleName());
            return 0;
        }
    }
}
