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
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;

class MetaWhatsAppWebhookServiceTest {
    private final WhatsAppInboundStore inbound = mock(WhatsAppInboundStore.class);
    private final MetaWhatsAppWebhookService service = new MetaWhatsAppWebhookService(
        mock(WhatsAppDeliveryEventRepository.class), mock(QueuedNotificationRepository.class), inbound, new ObjectMapper(), Clock.systemUTC(),
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

    @Test void eachInboundMessageIsHandedToTheStoreWithTheSendersDigitsAndProfileName() {
        String payload = """
            {"object":"whatsapp_business_account","entry":[{"changes":[{"field":"messages","value":{
              "contacts":[{"wa_id":"201001234567","profile":{"name":"Omar"}}],
              "messages":[{"id":"wamid.A","from":"201001234567","timestamp":"1760000000","type":"text","text":{"body":"hi"}}]}}]}]}""";

        service.process(payload.getBytes(StandardCharsets.UTF_8));

        verify(inbound).record(eq("wamid.A"), eq("201001234567"), eq("text"),
                argThat(json -> json.contains("\"profileName\":\"Omar\"") && json.contains("\"body\":\"hi\"")),
                eq(java.time.Instant.ofEpochSecond(1760000000)));
    }
}
