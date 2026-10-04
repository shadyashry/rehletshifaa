package com.rehletshifaa.access.platform.infrastructure;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;

import java.time.Instant;
import java.util.Arrays;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static com.rehletshifaa.shared.persistence.SqlValues.timestamp;

/** Durable, minimal notifications for privileged governance activity. */
@Component
public class GovernanceNotificationOutbox {
    private final JdbcClient jdbc;
    private final ObjectMapper json;
    private final List<String> destinations;

    public GovernanceNotificationOutbox(JdbcClient jdbc, ObjectMapper json,
            @Value("${app.governance.notifications.email-destinations:}") String destinations) {
        this.jdbc = jdbc;
        this.json = json;
        this.destinations = Arrays.stream(destinations.split(",")).map(String::trim).filter(value -> !value.isBlank()).distinct().toList();
    }

    public void enqueue(String event, String entityId, String summary, Instant now) {
        String payload = payload(event, entityId, summary);
        for (String destination : destinations) {
            String key = "governance:" + event + ":" + entityId + ":" + Integer.toHexString(destination.toLowerCase().hashCode());
            jdbc.sql("INSERT INTO notification_outbox(id,notification_type,channel,destination,template_key,template_data,status,attempts,max_attempts,next_attempt_at,idempotency_key,created_at) "
                            + "SELECT ?,?,'EMAIL',?,'governance-event',?,'PENDING',0,5,?,?,? WHERE NOT EXISTS(SELECT 1 FROM notification_outbox WHERE idempotency_key=?)")
                    .params(UUID.randomUUID(), "GOVERNANCE", destination, payload, timestamp(now), key, timestamp(now), key).update();
        }
    }

    public boolean configured() { return !destinations.isEmpty(); }

    private String payload(String event, String entityId, String summary) {
        try { return json.writeValueAsString(Map.of("event", event, "entity", entityId, "summary", summary)); }
        catch (JsonProcessingException e) { throw new IllegalStateException("Could not serialize governance notification", e); }
    }
}
