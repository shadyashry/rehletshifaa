package com.rehletshifaa.notification.infrastructure;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.rehletshifaa.notification.application.NotificationChannelPort;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

import java.util.Map;
import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

@Component
@ConditionalOnProperty(name="app.whatsapp.mode", havingValue="meta")
public class MetaWhatsAppChannel implements NotificationChannelPort {
    private final RestClient client;
    private final ObjectMapper json;
    private final String phoneNumberId;
    private final String accessToken;
    private final String authenticationTemplate;
    private final String authenticationTemplateLanguage;
    private static final Pattern SIX_DIGIT_CODE = Pattern.compile("(?<!\\d)(\\d{6})(?!\\d)");

    public MetaWhatsAppChannel(
        RestClient.Builder builder,
        ObjectMapper json,
        @Value("${app.whatsapp.meta.graph-base-url}") String graphBaseUrl,
        @Value("${app.whatsapp.meta.graph-version}") String graphVersion,
        @Value("${app.whatsapp.meta.phone-number-id}") String phoneNumberId,
        @Value("${app.whatsapp.meta.access-token}") String accessToken,
        @Value("${app.whatsapp.meta.authentication-template:}") String authenticationTemplate,
        @Value("${app.whatsapp.meta.authentication-template-language:en_US}") String authenticationTemplateLanguage
    ) {
        this.client = builder.baseUrl(graphBaseUrl + "/" + graphVersion).build();
        this.json = json;
        this.phoneNumberId = required(phoneNumberId, "WHATSAPP_META_PHONE_NUMBER_ID");
        this.accessToken = required(accessToken, "WHATSAPP_META_ACCESS_TOKEN");
        this.authenticationTemplate = authenticationTemplate;
        this.authenticationTemplateLanguage = authenticationTemplateLanguage;
    }

    @Override public boolean supports(String channel) { return "WHATSAPP".equals(channel); }

    @Override
    public String deliver(String destination, String subject, String body, String idempotencyKey) {
        String to = destination == null ? "" : destination.replaceAll("\\D", "");
        if (to.isBlank()) throw new IllegalArgumentException("WhatsApp destination is invalid");
        try {
            Matcher code = SIX_DIGIT_CODE.matcher(body);
            Object requestBody = code.find() && authenticationTemplate != null && !authenticationTemplate.isBlank()
                ? authenticationPayload(to, code.group(1))
                : textPayload(to, body);
            String response = client.post()
                .uri("/{phoneNumberId}/messages", phoneNumberId)
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + accessToken)
                .contentType(MediaType.APPLICATION_JSON)
                .body(requestBody)
                .retrieve().body(String.class);
            JsonNode messages = json.readTree(response).path("messages");
            if (!messages.isArray() || messages.isEmpty() || messages.get(0).path("id").asText().isBlank())
                throw new IllegalStateException("Meta response did not contain a message id");
            return messages.get(0).path("id").asText();
        } catch (Exception e) {
            throw new IllegalStateException("Meta WhatsApp Cloud API rejected the notification", e);
        }
    }

    private Map<String,Object> textPayload(String to, String body) {
        return Map.of("messaging_product", "whatsapp", "recipient_type", "individual", "to", to,
            "type", "text", "text", Map.of("preview_url", false, "body", body));
    }

    private Map<String,Object> authenticationPayload(String to, String code) {
        Map<String,Object> parameter=Map.of("type", "text", "text", code);
        return Map.of("messaging_product", "whatsapp", "to", to, "type", "template", "template", Map.of(
            "name", authenticationTemplate,
            "language", Map.of("code", authenticationTemplateLanguage),
            "components", List.of(
                Map.of("type", "body", "parameters", List.of(parameter)),
                Map.of("type", "button", "sub_type", "url", "index", "0", "parameters", List.of(parameter))
            )
        ));
    }

    private static String required(String value, String name) {
        if (value == null || value.isBlank()) throw new IllegalStateException(name + " is required when WHATSAPP_MODE=meta");
        return value;
    }
}
