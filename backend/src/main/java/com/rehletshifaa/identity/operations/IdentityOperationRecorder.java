package com.rehletshifaa.identity.operations;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;
import com.rehletshifaa.shared.crypto.CryptoService;
import com.fasterxml.jackson.databind.ObjectMapper;

import java.time.Clock;

/** Synchronous listener: failure to persist the operation fails the surrounding business transaction. */
@Component
public class IdentityOperationRecorder {
    private final IdentityOperationRepository operations;
    private final Clock clock;
    private final int maxAttempts;
    private final CryptoService crypto;
    private final ObjectMapper json;

    public IdentityOperationRecorder(IdentityOperationRepository operations, Clock clock, CryptoService crypto, ObjectMapper json,
            @Value("${app.identity-operations.max-attempts:8}") int maxAttempts) {
        this.operations = operations;
        this.clock = clock;
        this.crypto = crypto;
        this.json = json;
        this.maxAttempts = maxAttempts;
    }

    @EventListener
    public void record(IdentityOperationRequested event) {
        var now = clock.instant();
        operations.saveAndFlush(new IdentityOperation(event.id(), event.idempotencyKey(), event.targetSubject(), event.type().name(),
                maxAttempts, event.correlationId(), event.requestedBy(), bounded(event.reason()), event.targetType(), event.targetId(),
                encrypted(event.payload()), clock.instant()));
    }

    private String encrypted(java.util.Map<String,String> payload) {
        if (payload == null) return null;
        try { return "enc:" + crypto.encrypt(json.writeValueAsString(payload)); }
        catch (Exception failure) { throw new IllegalStateException("Unable to protect identity operation payload", failure); }
    }

    private static String bounded(String value) {
        String reason = value == null || value.isBlank() ? "Identity lifecycle synchronization" : value.trim();
        return reason.length() <= 500 ? reason : reason.substring(0, 500);
    }
}
