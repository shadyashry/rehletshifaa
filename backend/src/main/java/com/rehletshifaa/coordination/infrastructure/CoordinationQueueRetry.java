package com.rehletshifaa.coordination.infrastructure;
import com.rehletshifaa.coordination.application.AssignmentEngine;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
/** Deployment opt-in; only explicitly adopted LIVE queues can be processed. */
@Component
@ConditionalOnProperty(name="app.coordination.queue-retry.enabled",havingValue="true")
public class CoordinationQueueRetry {
    private final CoordinationRepository repo;private final AssignmentEngine engine;
    public CoordinationQueueRetry(CoordinationRepository repo,AssignmentEngine engine){this.repo=repo;this.engine=engine;}
    @Scheduled(fixedDelayString="${app.coordination.queue-retry.delay-ms:60000}") public void retry(){for(var id:repo.queuedCases())engine.retryQueued(id);}
}
