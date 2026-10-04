package com.rehletshifaa.identity.operations;

import com.rehletshifaa.shared.api.ApiException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.event.EventListener;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

@Service
public class IdentityOperationProcessor {
    private static final Logger log = LoggerFactory.getLogger(IdentityOperationProcessor.class);
    private static final int BATCH_SIZE = 20;
    private final IdentityOperationStore store;
    private final IdentityOperationExecutor executor;
    private volatile boolean stopping;

    public IdentityOperationProcessor(IdentityOperationStore store, IdentityOperationExecutor executor) {
        this.store = store;
        this.executor = executor;
    }

    @EventListener(org.springframework.context.event.ContextClosedEvent.class)
    void stop() { stopping = true; }

    /** Provider calls happen outside a database transaction; claim and outcome recording are separate. */
    @Scheduled(fixedDelayString = "${app.identity-operations.poll-milliseconds:5000}",
            initialDelayString = "${app.identity-operations.initial-delay-milliseconds:5000}")
    public void dispatch() {
        if (stopping) return;
        for (IdentityOperationStore.Operation operation : store.claim(BATCH_SIZE)) {
            if (stopping) { store.release(operation); continue; }
            execute(operation);
        }
    }

    private void execute(IdentityOperationStore.Operation operation) {
        try {
            executor.execute(operation);
        } catch (ApiException failure) {
            store.failed(operation, failure.code());
            log.warn("Identity operation retry: id={} type={} attempt={}/{} code={}", operation.id(), operation.type(),
                    operation.attempt(), operation.maxAttempts(), failure.code());
        } catch (RuntimeException failure) {
            store.failed(operation, "IDENTITY_PROVIDER_FAILURE");
            log.warn("Identity operation retry: id={} type={} attempt={}/{}", operation.id(), operation.type(),
                    operation.attempt(), operation.maxAttempts());
        }
    }
}
