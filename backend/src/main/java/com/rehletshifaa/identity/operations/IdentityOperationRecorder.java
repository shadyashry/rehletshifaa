package com.rehletshifaa.identity.operations;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.event.EventListener;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;
import com.rehletshifaa.shared.crypto.CryptoService;
import com.fasterxml.jackson.databind.ObjectMapper;

import java.time.Clock;

import static com.rehletshifaa.shared.persistence.SqlValues.timestamp;

/** Synchronous listener: failure to persist the operation fails the surrounding business transaction. */
@Component
public class IdentityOperationRecorder {
    private final JdbcClient jdbc;
    private final Clock clock;
    private final int maxAttempts;
    private final CryptoService crypto;
    private final ObjectMapper json;

    public IdentityOperationRecorder(JdbcClient jdbc, Clock clock, CryptoService crypto, ObjectMapper json,
            @Value("${app.identity-operations.max-attempts:8}") int maxAttempts) {
        this.jdbc = jdbc;
        this.clock = clock;
        this.crypto = crypto;
        this.json = json;
        this.maxAttempts = maxAttempts;
    }

    @EventListener
    public void record(IdentityOperationRequested event) {
        var now = clock.instant();
        jdbc.sql("INSERT INTO identity_operations(id,idempotency_key,target_subject,operation_type,status,attempts,max_attempts," +
                        "next_attempt_at,correlation_id,requested_by,reason,created_at,updated_at,revision,target_type,target_id,payload_encrypted) " +
                        "VALUES(?,?,?,?,'PENDING',0,?,?,?,?,?,?,?,0,?,?,?)")
                .params(event.id(), event.idempotencyKey(), event.targetSubject(), event.type().name(), maxAttempts,
                        timestamp(now), event.correlationId(), event.requestedBy(), bounded(event.reason()),
                        timestamp(now), timestamp(now), event.targetType(), event.targetId(), encrypted(event.payload()))
                .update();
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
