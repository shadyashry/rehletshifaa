package com.rehletshifaa.notification.application;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.simple.JdbcClient;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.time.Clock;
import java.util.HexFormat;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;

class MetaWhatsAppWebhookServiceTest {
    private final MetaWhatsAppWebhookService service = new MetaWhatsAppWebhookService(
        mock(JdbcClient.class), new ObjectMapper(), Clock.systemUTC(), "test-app-secret", "test-verify-token");

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
}
