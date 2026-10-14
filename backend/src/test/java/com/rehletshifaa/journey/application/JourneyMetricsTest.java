package com.rehletshifaa.journey.application;

import com.rehletshifaa.authority.domain.Role;
import com.rehletshifaa.casemanagement.api.CaseDtos.CreateCaseRequest;
import com.rehletshifaa.casemanagement.application.CaseService;
import com.rehletshifaa.casemanagement.infrastructure.CaseTaskRepository;
import com.rehletshifaa.journey.api.WorkDtos.NewWorkItem;
import com.rehletshifaa.shared.crypto.CryptoService;
import com.rehletshifaa.workforce.WorkforceTestData;
import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import jakarta.persistence.EntityManager;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionTemplate;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * P1-8 (E-05): the journey module's business meters exist with their low-cardinality tags, the queue gauges follow open
 * work no faster than their 60-second snapshot, and the counters count only what committed.
 */
@SpringBootTest(properties = "spring.task.scheduling.enabled=false")
@Transactional
class JourneyMetricsTest {
    static final String COORDINATOR = "coordinator-subject";
    static final String QUEUE = "METRICS_PROBE";

    static final class SettableClock extends Clock {
        private volatile Instant now = Instant.now();
        void advance(Duration by) { now = now.plus(by); }
        @Override public Instant instant() { return now; }
        @Override public ZoneId getZone() { return ZoneOffset.UTC; }
        @Override public Clock withZone(ZoneId zone) { throw new UnsupportedOperationException(); }
    }

    @Autowired MeterRegistry contextRegistry; @Autowired CaseTaskRepository tasks; @Autowired PlatformTransactionManager transactions;
    @Autowired CaseService cases; @Autowired JourneyService journey; @Autowired StaffWorkService work;
    @Autowired JdbcTemplate jdbc; @Autowired CryptoService crypto; @Autowired EntityManager em;
    @AfterEach void clear() { SecurityContextHolder.clearContext(); }

    @Test void theApplicationRegistersEveryJourneyMeterWithItsTags() {
        assertThat(contextRegistry.find("journey.consultant.offer.expired").counter()).isNotNull();
        assertThat(contextRegistry.find("journey.information.request.closed").tag("outcome", "case_cancelled").counter()).isNotNull();
        assertThat(contextRegistry.find("journey.information.request.closed").tag("outcome", "withdrawn").counter()).isNotNull();
        assertThat(contextRegistry.find("journey.proposal.time.to.release").tag("revision", "first").timer()).isNotNull();
        assertThat(contextRegistry.find("journey.proposal.time.to.release").tag("revision", "revised").timer()).isNotNull();
        assertThat(contextRegistry.find("work.open.total").gauge()).isNotNull();
    }

    @Test void queueGaugesFollowOpenWorkThroughASixtySecondSnapshot() throws Exception {
        SimpleMeterRegistry registry = new SimpleMeterRegistry();
        SettableClock clock = new SettableClock();
        new JourneyMetrics(registry, tasks, clock);
        UUID caseId = ownedCase("+254700000881", "metrics-a@local.test");
        UUID first = openWork(caseId, "a");
        jdbc.update("UPDATE case_tasks SET due_at=?, priority='HIGH' WHERE id=?", Instant.now().minus(Duration.ofHours(1)), first);

        double total = registry.get("work.open.total").gauge().value();
        assertThat(total).isGreaterThanOrEqualTo(1);
        assertThat(gauge(registry, "work.open.items")).isEqualTo(1);
        assertThat(gauge(registry, "work.open.high")).isEqualTo(1);
        assertThat(gauge(registry, "work.open.overdue")).isEqualTo(1);
        assertThat(registry.get("work.open.oldest.age").tags("queue", QUEUE, "team", "COORDINATOR").gauge().getId().getBaseUnit()).isEqualTo("seconds");

        // A new item is not read until the snapshot is a minute old: a scrape never scans the table.
        UUID secondCase = ownedCase("+254700000882", "metrics-b@local.test");
        openWork(secondCase, "b");
        assertThat(gauge(registry, "work.open.items")).isEqualTo(1);
        clock.advance(Duration.ofSeconds(61));
        assertThat(gauge(registry, "work.open.items")).isEqualTo(2);
        assertThat(gauge(registry, "work.open.high")).isEqualTo(1);
        assertThat(gauge(registry, "work.open.overdue")).isEqualTo(1);
        assertThat(gauge(registry, "work.open.oldest.age")).isGreaterThanOrEqualTo(60);

        // Closed work leaves the series in place at zero, so an alert resolves instead of losing its data.
        jdbc.update("UPDATE case_tasks SET status='COMPLETED' WHERE task_type=?", QUEUE);
        clock.advance(Duration.ofSeconds(61));
        assertThat(gauge(registry, "work.open.items")).isZero();
        assertThat(gauge(registry, "work.open.oldest.age")).isZero();
    }

    @Test void countersAndTheProposalTimerCountOnlyWhatCommitted() {
        SimpleMeterRegistry registry = new SimpleMeterRegistry();
        JourneyMetrics metrics = new JourneyMetrics(registry, tasks, Clock.systemUTC());
        Instant submitted = Instant.parse("2026-10-01T08:00:00Z");

        // This test's own transaction never commits: nothing is counted.
        metrics.offerExpired();
        metrics.informationRequestClosed("withdrawn");
        assertThat(registry.get("journey.consultant.offer.expired").counter().count()).isZero();

        TransactionTemplate committed = new TransactionTemplate(transactions);
        committed.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRES_NEW);
        committed.executeWithoutResult(status -> {
            metrics.offerExpired();
            metrics.informationRequestClosed("case_cancelled");
            metrics.proposalReleased(submitted, 1, submitted.plus(Duration.ofDays(3)));
            metrics.proposalReleased(submitted, 2, submitted.plus(Duration.ofDays(5)));
            metrics.proposalReleased(null, 1, submitted);
        });
        assertThat(registry.get("journey.consultant.offer.expired").counter().count()).isEqualTo(1);
        assertThat(registry.get("journey.information.request.closed").tag("outcome", "case_cancelled").counter().count()).isEqualTo(1);
        assertThat(registry.get("journey.information.request.closed").tag("outcome", "withdrawn").counter().count()).isZero();
        var first = registry.get("journey.proposal.time.to.release").tag("revision", "first").timer();
        assertThat(first.count()).isEqualTo(1);
        assertThat(first.totalTime(java.util.concurrent.TimeUnit.HOURS)).isEqualTo(72);
        assertThat(registry.get("journey.proposal.time.to.release").tag("revision", "revised").timer().count()).isEqualTo(1);
    }

    private static double gauge(SimpleMeterRegistry registry, String name) {
        return registry.get(name).tags("queue", QUEUE, "team", "COORDINATOR").gauge().value();
    }

    private UUID ownedCase(String whatsapp, String email) throws Exception {
        var created = cases.create(new CreateCaseRequest("Metrics", "Patient", "Kenya", whatsapp, "Reports", "en", true, null, email, "Africa/Nairobi", "cardiology"));
        cases.submit(created.caseId()); em.flush(); em.clear();
        if (count("SELECT count(*) FROM workforce_people WHERE subject=?", COORDINATOR) == 0)
            WorkforceTestData.staff(jdbc, COORDINATOR, "COORDINATOR", crypto.encrypt("Coordinator One"));
        com.rehletshifaa.authority.TestPrincipals.signIn(jdbc, crypto, COORDINATOR, Role.COORDINATOR);
        com.rehletshifaa.coordination.CoordinationTestData.eligibleCoordinator(jdbc, COORDINATOR);
        if (!com.rehletshifaa.coordination.CoordinationTestData.hasActiveCoordinator(jdbc, created.caseId(), COORDINATOR))
            journey.claimCoordinatorCase(created.caseId(), "pod");
        em.flush(); SecurityContextHolder.clearContext();
        return created.caseId();
    }

    private UUID openWork(UUID caseId, String key) {
        UUID id = work.openWorkItem(new NewWorkItem(caseId, QUEUE, "Probe " + key, null, COORDINATOR, "COORDINATOR", false, null,
                "test", "WORK_ITEM_ASSIGNED", "metrics-test:" + key + ":" + caseId, false), false);
        em.flush();
        return id;
    }

    private int count(String sql, Object... args) { Integer n = jdbc.queryForObject(sql, Integer.class, args); return n == null ? 0 : n; }
}
