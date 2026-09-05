package com.rehletshifaa.notification.application;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Clock;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.format.DateTimeParseException;
import java.util.HexFormat;
import java.util.UUID;

import static com.rehletshifaa.shared.persistence.SqlValues.timestamp;

@Service
@ConditionalOnProperty(name="app.whatsapp.mode", havingValue="meta")
public class MetaWhatsAppWebhookService {
    private final JdbcClient jdbc;
    private final ObjectMapper json;
    private final Clock clock;
    private final byte[] appSecret;
    private final byte[] verifyToken;

    public MetaWhatsAppWebhookService(
        JdbcClient jdbc,
        ObjectMapper json,
        Clock clock,
        @Value("${app.whatsapp.meta.app-secret}") String appSecret,
        @Value("${app.whatsapp.meta.verify-token}") String verifyToken
    ) {
        this.jdbc = jdbc;
        this.json = json;
        this.clock = clock;
        this.appSecret = required(appSecret, "WHATSAPP_META_APP_SECRET").getBytes(StandardCharsets.UTF_8);
        this.verifyToken = required(verifyToken, "WHATSAPP_META_VERIFY_TOKEN").getBytes(StandardCharsets.UTF_8);
    }

    public boolean acceptsVerification(String mode, String suppliedToken) {
        return "subscribe".equals(mode) && suppliedToken != null &&
            MessageDigest.isEqual(verifyToken, suppliedToken.getBytes(StandardCharsets.UTF_8));
    }

    public boolean validSignature(byte[] payload, String signatureHeader) {
        if (signatureHeader == null || !signatureHeader.startsWith("sha256=")) return false;
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(appSecret, "HmacSHA256"));
            byte[] expected = mac.doFinal(payload);
            byte[] supplied = HexFormat.of().parseHex(signatureHeader.substring(7));
            return MessageDigest.isEqual(expected, supplied);
        } catch (Exception ignored) {
            return false;
        }
    }

    @Transactional
    public void process(byte[] payload) {
        try {
            JsonNode root = json.readTree(payload);
            for (JsonNode entry : root.path("entry"))
                for (JsonNode change : entry.path("changes"))
                    processStatuses(change.path("value").path("statuses"), payload);
        } catch (Exception e) {
            throw new IllegalArgumentException("Invalid Meta webhook payload", e);
        }
    }

    private void processStatuses(JsonNode statuses, byte[] payload) {
        if (!statuses.isArray()) return;
        for (JsonNode statusNode : statuses) {
            String messageId = statusNode.path("id").asText();
            String deliveryStatus = statusNode.path("status").asText().toUpperCase();
            if (messageId.isBlank() || !isKnownStatus(deliveryStatus)) continue;
            Instant eventAt = parseTimestamp(statusNode.path("timestamp").asText());
            String errorCode = firstErrorCode(statusNode.path("errors"));
            String payloadHash = sha256(payload);
            int inserted = jdbc.sql("INSERT INTO whatsapp_delivery_events(id,provider,provider_message_id,delivery_status,provider_event_at,error_code,payload_hash,received_at) VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(provider,provider_message_id,delivery_status,provider_event_at) DO NOTHING")
                .params(UUID.randomUUID(), "META", messageId, deliveryStatus, timestamp(eventAt), errorCode, payloadHash, timestamp(clock.instant())).update();
            if (inserted == 1) {
                jdbc.sql("UPDATE notification_outbox SET provider_delivery_status=?,provider_status_at=?,provider_error_code=? WHERE provider_reference=? AND (provider_status_at IS NULL OR provider_status_at<=?)")
                    .params(deliveryStatus, timestamp(eventAt), errorCode, messageId, timestamp(eventAt)).update();
            }
        }
    }

    private static boolean isKnownStatus(String status) {
        return status.equals("SENT") || status.equals("DELIVERED") || status.equals("READ") || status.equals("FAILED") || status.equals("DELETED");
    }

    private Instant parseTimestamp(String value) {
        try { return Instant.ofEpochSecond(Long.parseLong(value)); }
        catch (NumberFormatException ignored) {
            try { return OffsetDateTime.parse(value).toInstant(); }
            catch (DateTimeParseException ignoredAgain) { return clock.instant(); }
        }
    }

    private static String firstErrorCode(JsonNode errors) {
        if (!errors.isArray() || errors.isEmpty()) return null;
        String code = errors.get(0).path("code").asText();
        return code.isBlank() ? null : code;
    }

    private static String sha256(byte[] payload) {
        try { return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(payload)); }
        catch (Exception e) { throw new IllegalStateException(e); }
    }

    private static String required(String value, String name) {
        if (value == null || value.isBlank()) throw new IllegalStateException(name + " is required when WHATSAPP_MODE=meta");
        return value;
    }
}
