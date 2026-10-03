package com.rehletshifaa.coordination.infrastructure;
import com.rehletshifaa.coordination.application.AssignmentEngine;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import java.util.UUID;
/** Deployment opt-in retry of automatically queued cases; a manager's explicit QUEUE stays parked. */
@Component
@ConditionalOnProperty(name="app.coordination.queue-retry.enabled",havingValue="true")
public class CoordinationQueueRetry {
    private static final Logger log=LoggerFactory.getLogger(CoordinationQueueRetry.class);
    private final CoordinationRepository repo;private final AssignmentEngine engine;
    public CoordinationQueueRetry(CoordinationRepository repo,AssignmentEngine engine){this.repo=repo;this.engine=engine;}
    /**
     * Each case retries in its own transaction and fails alone. The queue is read in case-id order, so one
     * permanently failing case must not end the pass and starve every case sorted after it.
     */
    @Scheduled(fixedDelayString="${app.coordination.queue-retry.delay-ms:60000}") public void retry(){
        for(UUID id:repo.retryableQueue()){
            try{engine.retryQueued(id);}
            catch(RuntimeException e){log.warn("Coordination queue retry failed for case {} ({}); continuing with the rest of the queue",id,e.getClass().getSimpleName());}
        }
    }
}
