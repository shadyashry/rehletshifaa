package com.rehletshifaa.notification.application;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.rehletshifaa.shared.crypto.CryptoService;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicInteger;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

/**
 * Dispatcher decisions around the provider call, where a wrong outcome means either a lost or a duplicated
 * patient message. The store's SQL guards are covered by {@link NotificationOutboxDeliveryTest}.
 */
class NotificationOutboxProcessorTest {
    static final Instant NOW = Instant.parse("2026-09-23T10:00:00Z");
    NotificationOutboxStore store;
    SimpleMeterRegistry metrics;
    AtomicInteger sends;
    RuntimeException providerError;
    NotificationOutboxProcessor processor;
    CryptoService crypto;

    @BeforeEach void setup() {
        store = mock(NotificationOutboxStore.class);
        metrics = new SimpleMeterRegistry();
        sends = new AtomicInteger();
        providerError = null;
        NotificationChannelPort channel = new NotificationChannelPort() {
            public boolean supports(String channel) { return "EMAIL".equals(channel); }
            public String deliver(String destination, String subject, String body, String key) {
                sends.incrementAndGet();
                if (providerError != null) throw providerError;
                return "provider-ref";
            }
        };
        crypto = new CryptoService("notification-test-key");
        processor = new NotificationOutboxProcessor(store, List.of(channel), new ObjectMapper(), "http://localhost:3000",
                crypto, metrics, Clock.fixed(NOW, ZoneOffset.UTC));
    }

    NotificationOutboxStore.OutboxMessage claimed(String template, Instant leaseExpiresAt) {
        var message = new NotificationOutboxStore.OutboxMessage(UUID.randomUUID(), "EMAIL", "p@example.test", template,
                "enc:" + crypto.encrypt("{\"code\":\"123456\"}"), 1, 5, "key-1", leaseExpiresAt);
        when(store.claim(anyInt())).thenReturn(List.of(message));
        return message;
    }
    NotificationOutboxStore.OutboxMessage claimed() { return claimed("case-access-code", NOW.plusSeconds(NotificationOutboxStore.LEASE_SECONDS)); }
    double count(String outcome) { var c = metrics.find("notification.delivery").tag("outcome", outcome).counter(); return c == null ? 0 : c.count(); }

    @Test void aProviderFailureIsRecordedAsARetryableFailure() {
        var message = claimed();
        providerError = new IllegalStateException("smtp down");
        when(store.recordFailure(any(), anyInt(), anyInt(), anyString())).thenReturn(true);

        processor.dispatch();

        verify(store).recordFailure(message.id(), 1, 5, "PROVIDER_FAILURE");
        verify(store, never()).recordDelivered(any(), anyInt(), any());
        assertThat(count("retry")).isEqualTo(1);
    }

    @Test void aDeliveredMessageWhoseOutcomeCannotBeRecordedIsNeverBookedAsAProviderFailure() {
        var message = claimed();
        when(store.recordDelivered(message.id(), 1, "provider-ref")).thenThrow(new org.springframework.dao.DataAccessResourceFailureException("db gone"));

        processor.dispatch();

        assertThat(sends).hasValue(1);
        // Booking this as a failure would schedule a deliberate second send of a message the provider accepted.
        verify(store, never()).recordFailure(any(), anyInt(), anyInt(), anyString());
        assertThat(count("delivered_unrecorded")).isEqualTo(1);
    }

    @Test void aStaleWorkerWhoseLeaseWasTakenOverDoesNotCountADelivery() {
        var message = claimed();
        when(store.recordDelivered(message.id(), 1, "provider-ref")).thenReturn(false);

        processor.dispatch();

        assertThat(count("delivered")).isZero();
    }

    @Test void noSendStartsOnANearlySpentLeaseTheMessageIsHandedBackUncharged() {
        var message = claimed("case-access-code", NOW.plus(NotificationOutboxProcessor.SEND_MARGIN).minusSeconds(1));

        processor.dispatch();

        assertThat(sends).hasValue(0);
        verify(store).release(message.id(), 1);
        verify(store, never()).recordFailure(any(), anyInt(), anyInt(), anyString());
    }

    @Test void onceShutdownBeginsNoNewBatchIsClaimed() {
        claimed();
        processor.stop();

        processor.dispatch();

        verify(store, never()).claim(anyInt());
        assertThat(sends).hasValue(0);
    }

    @Test void aTemplateThatCannotRenderIsParkedAtOnceInsteadOfRetried() {
        var message = claimed("no-such-template", NOW.plusSeconds(NotificationOutboxStore.LEASE_SECONDS));
        when(store.recordFailure(any(), anyInt(), anyInt(), anyString())).thenReturn(true);

        processor.dispatch();

        verify(store).recordFailure(message.id(), 1, 1, "TEMPLATE_FAILURE"); // attempts>=max: DEAD_LETTER
        assertThat(sends).hasValue(0);
        assertThat(count("dead_letter")).isEqualTo(1);
    }

    @Test void plaintextTemplateDataIsRejectedBeforeDelivery() {
        var message = new NotificationOutboxStore.OutboxMessage(UUID.randomUUID(), "EMAIL", "p@example.test", "case-access-code",
                "{\"code\":\"123456\"}", 1, 5, "key-plain", NOW.plusSeconds(NotificationOutboxStore.LEASE_SECONDS));
        when(store.claim(anyInt())).thenReturn(List.of(message));
        when(store.recordFailure(any(), anyInt(), anyInt(), anyString())).thenReturn(true);

        processor.dispatch();

        verify(store).recordFailure(message.id(), 1, 1, "TEMPLATE_FAILURE");
        assertThat(sends).hasValue(0);
    }
}
