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
    OutgoingNotification delivered;
    NotificationOutboxProcessor processor;
    CryptoService crypto;

    @BeforeEach void setup() {
        store = mock(NotificationOutboxStore.class);
        metrics = new SimpleMeterRegistry();
        sends = new AtomicInteger();
        providerError = null;
        delivered = null;
        NotificationChannelPort channel = new NotificationChannelPort() {
            public boolean supports(String channel) { return "EMAIL".equals(channel); }
            public String deliver(String destination, String subject, String body, String key) {
                sends.incrementAndGet();
                if (providerError != null) throw providerError;
                return "provider-ref";
            }
            public String deliver(OutgoingNotification notification) {
                delivered = notification;
                return NotificationChannelPort.super.deliver(notification);
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

    NotificationOutboxStore.OutboxMessage claimedWith(String template, String data) {
        var message = new NotificationOutboxStore.OutboxMessage(UUID.randomUUID(), "EMAIL", "p@example.test", template,
                "enc:" + crypto.encrypt(data), 1, 5, "key-2", NOW.plusSeconds(NotificationOutboxStore.LEASE_SECONDS));
        when(store.claim(anyInt())).thenReturn(List.of(message));
        return message;
    }

    @Test void aFinalQuoteNoticeIsDeliveredWithItsLanguageAndLinkPath() {
        var message = claimedWith("final-quote-ready", "{\"token\":\"tok123\",\"lang\":\"ar\"}");
        when(store.recordDelivered(any(), anyInt(), anyString())).thenReturn(true);

        processor.dispatch();

        verify(store).recordDelivered(message.id(), 1, "provider-ref");
        assertThat(delivered.templateKey()).isEqualTo("final-quote-ready");
        assertThat(delivered.language()).isEqualTo("ar");
        assertThat(delivered.linkPath()).isEqualTo("ar/proposal/tok123");
        assertThat(delivered.body()).contains("http://localhost:3000/ar/proposal/tok123");
    }

    /** Renders one message and returns what the channel received. */
    OutgoingNotification render(String template, String json) {
        claimedWith(template, json);
        when(store.recordDelivered(any(), anyInt(), anyString())).thenReturn(true);
        processor.dispatch();
        return delivered;
    }

    static boolean arabic(String text) { return text.codePoints().anyMatch(c -> c >= 0x0600 && c <= 0x06FF); }

    /** QA W-8, #29, W-42: an Arabic patient reads every message in Arabic, an English one in English — email or simulator. */
    @Test void everyPatientMessageIsWrittenInThePatientsLanguage() {
        String[][] templates = {
                {"case-status-link", "{\"token\":\"t1\",\"lang\":\"%s\"}"}, {"patient-action-link", "{\"token\":\"t1\",\"lang\":\"%s\"}"},
                {"patient-action-reminder", "{\"token\":\"t1\",\"lang\":\"%s\"}"}, {"information-request-closed", "{\"lang\":\"%s\"}"},
                {"secure-message", "{\"token\":\"t1\",\"lang\":\"%s\"}"}, {"proposal-ready", "{\"token\":\"t1\",\"lang\":\"%s\"}"},
                {"final-quote-ready", "{\"token\":\"t1\",\"lang\":\"%s\"}"}, {"onboarding-activation", "{\"token\":\"t1\",\"lang\":\"%s\"}"},
                {"account-link-continue", "{\"token\":\"t1\",\"lang\":\"%s\"}"}, {"deposit-settled-patient", "{\"lang\":\"%s\"}"},
                {"out-of-hours", "{\"lang\":\"%s\"}"}, {"intake-followup", "{\"lang\":\"%s\"}"},
                {"coordinator-intro", "{\"name\":\"Layla\",\"lang\":\"%s\"}"}, {"case-access-code", "{\"code\":\"123456\",\"lang\":\"%s\"}"},
                {"document-cleared", "{\"case\":\"0b0d8f8e-6f6c-4a3e-9c1d-2f8f3c2a1b00\",\"lang\":\"%s\"}"},
                {"admission-balance-due", "{\"case\":\"0b0d8f8e-6f6c-4a3e-9c1d-2f8f3c2a1b00\",\"lang\":\"%s\"}"},
                {"cleared-for-admission", "{\"case\":\"0b0d8f8e-6f6c-4a3e-9c1d-2f8f3c2a1b00\",\"lang\":\"%s\"}"},
                {"treatment-update", "{\"case\":\"0b0d8f8e-6f6c-4a3e-9c1d-2f8f3c2a1b00\",\"lang\":\"%s\"}"},
                {"change-order-review", "{\"case\":\"0b0d8f8e-6f6c-4a3e-9c1d-2f8f3c2a1b00\",\"lang\":\"%s\"}"},
                {"change-order-applied", "{\"case\":\"0b0d8f8e-6f6c-4a3e-9c1d-2f8f3c2a1b00\",\"lang\":\"%s\"}"},
                {"discharge-pack-ready", "{\"case\":\"0b0d8f8e-6f6c-4a3e-9c1d-2f8f3c2a1b00\",\"lang\":\"%s\"}"},
                {"statement-ready", "{\"case\":\"0b0d8f8e-6f6c-4a3e-9c1d-2f8f3c2a1b00\",\"lang\":\"%s\"}"}};
        for (String[] t : templates) {
            var ar = render(t[0], t[1].formatted("ar"));
            assertThat(arabic(ar.subject()) && arabic(ar.body())).as(t[0] + " in Arabic").isTrue();
            assertThat(ar.language()).as(t[0]).isEqualTo("ar");
            var en = render(t[0], t[1].formatted("en"));
            assertThat(arabic(en.subject()) || arabic(en.body())).as(t[0] + " in English").isFalse();
        }
    }

    /** P1-15 (D-B): the hospital receives the voucher with the money split it admits and bills against, in English and Arabic, no clinical detail. */
    @Test void theHospitalVoucherCarriesTheFrozenSplitInBothLanguages() {
        assertThat(render("admission-voucher-facility", "{\"lang\":\"en\",\"voucher\":\"RS-V-1\"}")).as("a voucher missing its amounts is never sent").isNull();
        var mail = render("admission-voucher-facility", "{\"lang\":\"en\",\"voucher\":\"RS-V-2026-000081-1\",\"caseNumber\":\"RS-2026-000081\",\"patient\":\"Maya Example\","
                + "\"facility\":\"Cairo Heart\",\"admission\":\"2026-11-02T08:00:00Z\",\"package\":\"100000.00\",\"credit\":\"2250.00\",\"atFacility\":\"97750.00\"}");
        assertThat(mail.subject()).contains("RS-V-2026-000081-1");
        assertThat(mail.body()).contains("Package price (EGP): 100000.00", "(EGP): 2250.00", "before admission (EGP): 97750.00", "Maya Example", "RS-2026-000081");
        assertThat(arabic(mail.body())).as("the Arabic half follows the English").isTrue();
    }

    /** The patient's admission messages link to their own case page; no amount travels in the message. */
    @Test void theAdmissionMessagesLinkToTheCasePage() {
        for (String template : List.of("admission-balance-due", "cleared-for-admission", "treatment-update", "change-order-review", "change-order-applied",
                "discharge-pack-ready", "statement-ready")) {
            var en = render(template, "{\"case\":\"0b0d8f8e-6f6c-4a3e-9c1d-2f8f3c2a1b00\",\"lang\":\"en\"}");
            assertThat(en.linkPath()).as(template).isEqualTo("en/portal?case=0b0d8f8e-6f6c-4a3e-9c1d-2f8f3c2a1b00");
            assertThat(en.body()).as(template).doesNotContainPattern("[0-9]{3,}[.][0-9]{2}");
        }
    }

    /** A file cleared in the sweep: the patient is sent to their own case page (sign-in), never told the file's name. */
    @Test void aClearedUploadLinksToTheCasePageWithoutNamingTheFile() {
        var en = render("document-cleared", "{\"case\":\"0b0d8f8e-6f6c-4a3e-9c1d-2f8f3c2a1b00\",\"lang\":\"en\"}");
        assertThat(en.body()).contains("passed the check").endsWith("http://localhost:3000/en/portal?case=0b0d8f8e-6f6c-4a3e-9c1d-2f8f3c2a1b00");
        assertThat(en.linkPath()).isEqualTo("en/portal?case=0b0d8f8e-6f6c-4a3e-9c1d-2f8f3c2a1b00");
    }

    /** QA W-8: the patient acknowledged a preliminary estimate; nothing was accepted. */
    @Test void theProfileCompletionMessageSaysAcknowledgedNotAccepted() {
        assertThat(render("onboarding-activation", "{\"token\":\"t1\",\"lang\":\"en\"}").body())
                .contains("You acknowledged your preliminary estimate").doesNotContain("accepted");
        assertThat(render("onboarding-activation", "{\"token\":\"t1\",\"lang\":\"ar\"}").body())
                .contains("أقررتَ بتقديرك المبدئي").contains("http://localhost:3000/ar/activate/t1");
    }

    /** QA W-9: the coordinator's work email names the case once. */
    @Test void theCoordinatorWorkEmailNamesTheCaseOnce() {
        String body = render("coordinator-work-assigned", "{\"title\":\"Arrange the deposit\",\"case\":\"RS-2026-000002\"}").body();
        assertThat(body).startsWith("Case RS-2026-000002 needs you as its coordinator").doesNotContain("Case for case");
        assertThat(render("coordinator-work-assigned", "{\"title\":\"Arrange the deposit\"}").body()).startsWith("A case needs you");
    }

    @Test void aRecordedDecisionCarriesItsWordsAsTemplateParameters() {
        claimedWith("proposal-decision-recorded",
                "{\"decision\":\"ACCEPTED\",\"confirmedBy\":\"REPRESENTATIVE\",\"date\":\"2026-10-08\",\"lang\":\"en\"}");
        when(store.recordDelivered(any(), anyInt(), anyString())).thenReturn(true);

        processor.dispatch();

        assertThat(delivered.parameters()).containsExactly("you accepted the final quote", "your representative", "8 October 2026");
        assertThat(delivered.linkPath()).isNull();
    }

    @Test void aChannelThatCanNeverDeliverParksTheMessageAtOnce() {
        var message = claimed();
        providerError = new UndeliverableNotificationException("WHATSAPP_TEMPLATE_NOT_BOUND", "no template");
        when(store.recordFailure(any(), anyInt(), anyInt(), anyString())).thenReturn(true);

        processor.dispatch();

        verify(store).recordFailure(message.id(), 1, 1, "WHATSAPP_TEMPLATE_NOT_BOUND");
        assertThat(count("dead_letter")).isEqualTo(1);
    }
}
