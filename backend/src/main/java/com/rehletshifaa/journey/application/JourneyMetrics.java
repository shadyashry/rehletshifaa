package com.rehletshifaa.journey.application;

import com.rehletshifaa.casemanagement.infrastructure.CaseTaskRepository;
import com.rehletshifaa.casemanagement.infrastructure.CaseTaskRepository.OpenWorkQueueRow;
import com.rehletshifaa.shared.metrics.AfterCommit;
import com.rehletshifaa.shared.metrics.CachedSnapshot;
import com.rehletshifaa.shared.metrics.GroupedGauges;
import com.rehletshifaa.shared.metrics.GroupedGauges.Column;
import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.Tags;
import io.micrometer.core.instrument.Timer;
import org.springframework.stereotype.Component;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.List;

/**
 * P1-8 (E-05): the journey module's business meters, all registered here. Tags are low-cardinality only (queue = work
 * item type, team = owning role, outcome, revision); never case ids, subjects or names.
 * <ul>
 *   <li>{@code work.open.items}, {@code work.open.oldest.age} (seconds), {@code work.open.high} (HIGH or URGENT) and
 *       {@code work.open.overdue} (past the due date the SLA table wrote) per {@code queue} and {@code team}, with the untagged
 *       {@code work.open.total}; one grouped read of open internal work at most every 60 s. Deposit verification age is
 *       {@code work.open.oldest.age{queue=DEPOSIT_RECORD}}.</li>
 *   <li>{@code journey.proposal.time.to.release}: case submitted → preliminary proposal released, recorded at release, by
 *       {@code revision} (first, revised).</li>
 *   <li>{@code journey.consultant.offer.expired}: offers declined by the offer deadline.</li>
 *   <li>{@code journey.information.request.closed}: unanswered information requests closed at day 30, by {@code outcome}
 *       (case_cancelled, withdrawn).</li>
 * </ul>
 * Counters count after commit, so a rolled-back sweep counts nothing.
 */
@Component
public class JourneyMetrics {
    private final MeterRegistry registry;
    private final Counter offersExpired;
    private final Timer firstProposal, revisedProposal;

    public JourneyMetrics(MeterRegistry registry, CaseTaskRepository tasks, Clock clock) {
        this.registry = registry;
        new GroupedGauges<OpenWorkQueueRow>(registry, clock, CachedSnapshot.MAX_AGE, () -> tasks.summarizeOpenInternalWork(clock.instant()),
                row -> Tags.of("queue", row.getQueue(), "team", row.getTeam() == null ? "NONE" : row.getTeam()),
                List.of(new Column<>("work.open.items", "Open internal work items", "items", row -> row.getOpen()),
                        new Column<>("work.open.oldest.age", "Age of the oldest open work item", "seconds",
                                row -> row.getOldest() == null ? 0 : Math.max(0, Duration.between(row.getOldest(), clock.instant()).toSeconds())),
                        new Column<>("work.open.high", "Open work items at HIGH or URGENT priority", "items", row -> row.getHigh()),
                        new Column<>("work.open.overdue", "Open work items past their due date", "items", row -> row.getOverdue())),
                "work.open.total", "Open internal work items, all queues");
        this.offersExpired = Counter.builder("journey.consultant.offer.expired").description("Consultant offers declined by their deadline").register(registry);
        this.firstProposal = timeToProposal("first");
        this.revisedProposal = timeToProposal("revised");
        for (String outcome : List.of("case_cancelled", "withdrawn")) informationClosed(outcome);
    }

    public void offerExpired() { AfterCommit.run(offersExpired::increment); }

    /** {@code outcome}: case_cancelled or withdrawn. */
    public void informationRequestClosed(String outcome) { Counter counter = informationClosed(outcome); AfterCommit.run(counter::increment); }

    /** Version 1 is the first proposal; a later version is a revision. Nothing is recorded for a case without a submission time. */
    public void proposalReleased(Instant submittedAt, int versionNumber, Instant releasedAt) {
        if (submittedAt == null || releasedAt.isBefore(submittedAt)) return;
        Timer timer = versionNumber <= 1 ? firstProposal : revisedProposal;
        Duration elapsed = Duration.between(submittedAt, releasedAt);
        AfterCommit.run(() -> timer.record(elapsed));
    }

    private Timer timeToProposal(String revision) {
        return Timer.builder("journey.proposal.time.to.release").description("Case submitted to preliminary proposal released").tag("revision", revision).register(registry);
    }

    private Counter informationClosed(String outcome) {
        return Counter.builder("journey.information.request.closed").description("Unanswered information requests closed").tag("outcome", outcome).register(registry);
    }
}
