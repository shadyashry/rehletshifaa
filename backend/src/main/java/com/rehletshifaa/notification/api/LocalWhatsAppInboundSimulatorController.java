package com.rehletshifaa.notification.api;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.rehletshifaa.notification.application.WhatsAppInboundStore;
import com.rehletshifaa.shared.PhoneDigits;
import com.rehletshifaa.shared.api.ApiException;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Profile;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.time.Clock;
import java.time.Instant;
import java.util.UUID;

/**
 * Dev only (QA W-31): "someone texted the business number". The local profile sends WhatsApp to Mailpit and has no Meta
 * webhook, so without this no intake conversation can start on dev and the coordinator routing cannot be walked. It
 * records a Meta-shaped text message in the same inbound store the webhook uses; the scheduled processor then files it
 * exactly as live (the sender's open case, else an intake conversation that routing gives an owner).
 *
 * <p>Never public: the bean exists only under the {@code local} profile with the local WhatsApp channel, and the API
 * gateway forwards only {@code /api/v1}, so {@code /dev} is reachable from this machine alone ({@code localhost:8080}).</p>
 */
@RestController
@Profile("local")
@ConditionalOnProperty(name = "app.whatsapp.mode", havingValue = "noop", matchIfMissing = true)
@RequestMapping("/dev/whatsapp")
public class LocalWhatsAppInboundSimulatorController {
    private final WhatsAppInboundStore inbound;
    private final ObjectMapper json;
    private final Clock clock;

    public LocalWhatsAppInboundSimulatorController(WhatsAppInboundStore inbound, ObjectMapper json, Clock clock) {
        this.inbound = inbound; this.json = json; this.clock = clock;
    }

    /** A text from {@code from} (any phone format), with an optional WhatsApp profile name. Synthetic data only. */
    public record SimulatedText(@NotBlank @Size(max = 32) String from, @Size(max = 80) String name, @NotBlank @Size(max = 4000) String text) {}

    public record Recorded(String messageId, String sender) {}

    @PostMapping("/inbound")
    public Recorded inbound(@Valid @RequestBody SimulatedText request) {
        String sender = PhoneDigits.of(request.from());
        if (sender == null) throw new ApiException(400, "INVALID_PHONE", "Give the sender's phone number with its country code");
        Instant now = clock.instant();
        String id = "local-sim." + UUID.randomUUID();
        ObjectNode message = json.createObjectNode().put("id", id).put("from", sender).put("timestamp", String.valueOf(now.getEpochSecond())).put("type", "text");
        message.putObject("text").put("body", request.text());
        ObjectNode stored = json.createObjectNode();
        stored.set("message", message);
        stored.put("profileName", request.name() == null || request.name().isBlank() ? null : request.name().trim());
        inbound.record(id, sender, "text", stored.toString(), now);
        return new Recorded(id, sender);
    }
}
