package com.rehletshifaa.notification.application;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.rehletshifaa.shared.api.ApiException;
import org.junit.jupiter.api.Test;
import com.rehletshifaa.notification.infrastructure.QueuedNotificationRepository;
import com.rehletshifaa.notification.infrastructure.WhatsAppDeliveryEventRepository;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.time.Clock;
import java.util.HexFormat;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;

class MetaWhatsAppWebhookServiceTest {
    private final MetaWhatsAppWebhookService service = new MetaWhatsAppWebhookService(
        mock(WhatsAppDeliveryEventRepository.class), mock(QueuedNotificationRepository.class), new ObjectMapper(), Clock.systemUTC(),
        "test-app-secret", "test-verify-token");

    @Test void acceptsOnlyMatchingSubscriptionChallenge() {
        assertThat(service.acceptsVerification("subscribe", "test-verify-token")).isTrue();
        assertThat(service.acceptsVerification("subscribe", "wrong")).isFalse();
        assertThat(service.acceptsVerification("unsubscribe", "test-verify-token")).isFalse();
    }

    @Test void validatesSignatureAgainstExactRawBody() throws Exception {
        byte[] payload="{\"object\":\"whatsapp_business_account\"}".getBytes(StandardCharsets.UTF_8);
        Mac mac=Mac.getInstance("HmacSHA256");
        mac.init(new SecretKeySpec("test-app-secret".getBytes(StandardCharsets.UTF_8),"HmacSHA256"));
        String signature="sha256="+HexFormat.of().formatHex(mac.doFinal(payload));
        assertThat(service.validSignature(payload,signature)).isTrue();
        assertThat(service.validSignature("{}".getBytes(StandardCharsets.UTF_8),signature)).isFalse();
        assertThat(service.validSignature(payload,null)).isFalse();
    }

    @Test void malformedSignedPayloadIsAClientErrorWithoutParserLeakage(){assertThatThrownBy(()->service.process("{".getBytes(StandardCharsets.UTF_8))).isInstanceOf(ApiException.class).hasMessage("The webhook payload is invalid");}
}
