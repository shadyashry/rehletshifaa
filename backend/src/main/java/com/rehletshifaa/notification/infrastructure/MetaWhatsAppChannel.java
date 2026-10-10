package com.rehletshifaa.notification.infrastructure;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.rehletshifaa.notification.application.NotificationChannelPort;
import com.rehletshifaa.notification.application.OutgoingNotification;
import com.rehletshifaa.notification.application.UndeliverableNotificationException;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * Meta WhatsApp Cloud API. Outbox notifications go out as approved templates only: Meta rejects free text outside
 * the 24-hour customer-service window, which is where almost every patient notification lands.
 */
@Component
@ConditionalOnProperty(name="app.whatsapp.mode", havingValue="meta")
@EnableConfigurationProperties(MetaWhatsAppTemplates.class)
public class MetaWhatsAppChannel implements NotificationChannelPort {
    /** One-time codes use the authentication template: Meta fixes its text and its copy-code button. */
    static final Set<String> CODE_TEMPLATES = Set.of("case-access-code", "proposal-access-code");
    /**
     * A coordinator's reply in an intake conversation: free text, which Meta accepts only inside the 24-hour window
     * after the person's last message. The sender checks the window; outside it they send a template instead.
     */
    static final String CONVERSATION_TEXT = "conversation-text";

    private final RestClient client;
    private final ObjectMapper json;
    private final String phoneNumberId;
    private final String accessToken;
    private final String authenticationTemplate;
    private final String authenticationTemplateLanguage;
    private final MetaWhatsAppTemplates templates;

    public MetaWhatsAppChannel(
        RestClient.Builder builder,
        ObjectMapper json,
        MetaWhatsAppTemplates templates,
        @Value("${app.whatsapp.meta.graph-base-url}") String graphBaseUrl,
        @Value("${app.whatsapp.meta.graph-version}") String graphVersion,
        @Value("${app.whatsapp.meta.phone-number-id}") String phoneNumberId,
        @Value("${app.whatsapp.meta.access-token}") String accessToken,
        @Value("${app.whatsapp.meta.authentication-template:}") String authenticationTemplate,
        @Value("${app.whatsapp.meta.authentication-template-language:en_US}") String authenticationTemplateLanguage
    ) {
        this.client = builder.baseUrl(graphBaseUrl + "/" + graphVersion).build();
        this.json = json;
        this.templates = templates;
        this.phoneNumberId = required(phoneNumberId, "WHATSAPP_META_PHONE_NUMBER_ID");
        this.accessToken = required(accessToken, "WHATSAPP_META_ACCESS_TOKEN");
        this.authenticationTemplate = authenticationTemplate;
        this.authenticationTemplateLanguage = authenticationTemplateLanguage;
    }

    @Override public boolean supports(String channel) { return "WHATSAPP".equals(channel); }

    /** Text without a template key cannot be delivered reliably here; every outbox send names its template. */
    @Override
    public String deliver(String destination, String subject, String body, String idempotencyKey) {
        throw new UndeliverableNotificationException("WHATSAPP_TEMPLATE_REQUIRED", "Meta WhatsApp sends approved templates only");
    }

    @Override
    public String deliver(OutgoingNotification notification) {
        String to = notification.destination() == null ? "" : notification.destination().replaceAll("\\D", "");
        if (to.isBlank()) throw new IllegalArgumentException("WhatsApp destination is invalid");
        Map<String, Object> payload = CONVERSATION_TEXT.equals(notification.templateKey())
                ? Map.of("messaging_product", "whatsapp", "recipient_type", "individual", "to", to, "type", "text",
                        "text", Map.of("preview_url", false, "body", notification.body()))
                : CODE_TEMPLATES.contains(notification.templateKey())
                ? authenticationPayload(to, notification)
                : templatePayload(to, notification);
        try {
            String response = client.post()
                .uri("/{phoneNumberId}/messages", phoneNumberId)
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + accessToken)
                .contentType(MediaType.APPLICATION_JSON)
                .body(payload)
                .retrieve().body(String.class);
            JsonNode messages = json.readTree(response).path("messages");
            if (!messages.isArray() || messages.isEmpty() || messages.get(0).path("id").asText().isBlank())
                throw new IllegalStateException("Meta response did not contain a message id");
            return messages.get(0).path("id").asText();
        } catch (Exception e) {
            throw new IllegalStateException("Meta WhatsApp Cloud API rejected the notification", e);
        }
    }

    private Map<String, Object> templatePayload(String to, OutgoingNotification n) {
        String name = templates.template(n.templateKey());
        if (name == null)
            throw new UndeliverableNotificationException("WHATSAPP_TEMPLATE_NOT_BOUND", "No WhatsApp template is bound to " + n.templateKey());
        String language = templates.language(n.language() == null ? "en" : n.language());
        if (language == null)
            throw new UndeliverableNotificationException("WHATSAPP_LANGUAGE_NOT_BOUND", "No WhatsApp language is bound to " + n.language());
        List<Map<String, Object>> components = new ArrayList<>();
        if (!n.parameters().isEmpty())
            components.add(Map.of("type", "body", "parameters", n.parameters().stream().map(MetaWhatsAppChannel::text).toList()));
        if (n.linkPath() != null)
            components.add(Map.of("type", "button", "sub_type", "url", "index", "0", "parameters", List.of(text(n.linkPath()))));
        Map<String, Object> template = new LinkedHashMap<>();
        template.put("name", name);
        template.put("language", Map.of("code", language));
        if (!components.isEmpty()) template.put("components", components);
        return Map.of("messaging_product", "whatsapp", "recipient_type", "individual", "to", to, "type", "template", "template", template);
    }

    private Map<String, Object> authenticationPayload(String to, OutgoingNotification n) {
        if (authenticationTemplate == null || authenticationTemplate.isBlank())
            throw new UndeliverableNotificationException("WHATSAPP_TEMPLATE_NOT_BOUND", "No WhatsApp authentication template is configured");
        if (n.parameters().isEmpty()) throw new IllegalArgumentException("A one-time code is required");
        Map<String, Object> parameter = text(n.parameters().get(0));
        String language = n.language() == null ? null : templates.language(n.language());
        return Map.of("messaging_product", "whatsapp", "to", to, "type", "template", "template", Map.of(
            "name", authenticationTemplate,
            "language", Map.of("code", language == null ? authenticationTemplateLanguage : language),
            "components", List.of(
                Map.of("type", "body", "parameters", List.of(parameter)),
                Map.of("type", "button", "sub_type", "url", "index", "0", "parameters", List.of(parameter))
            )
        ));
    }

    private static Map<String, Object> text(String value) { return Map.of("type", "text", "text", value); }

    private static String required(String value, String name) {
        if (value == null || value.isBlank()) throw new IllegalStateException(name + " is required when WHATSAPP_MODE=meta");
        return value;
    }
}
