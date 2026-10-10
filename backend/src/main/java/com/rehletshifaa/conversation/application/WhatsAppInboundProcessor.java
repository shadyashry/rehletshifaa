package com.rehletshifaa.conversation.application;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.rehletshifaa.document.application.DocumentScanUnavailableException;
import com.rehletshifaa.journey.application.PatientChannelService;
import com.rehletshifaa.journey.application.PatientChannelService.InboundFile;
import com.rehletshifaa.notification.application.WhatsAppInboundStore;
import com.rehletshifaa.notification.application.WhatsAppInboundStore.InboundMessage;
import com.rehletshifaa.notification.application.WhatsAppMediaPort;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.event.ContextClosedEvent;
import org.springframework.context.event.EventListener;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

import java.util.Set;

/**
 * Files inbound WhatsApp messages (S1/S3 of docs/patient-communication-whatsapp-design.md). A sender with an open case
 * gets the message, and any file, in that case's patient thread; a sender with none gets it in their intake
 * conversation, which routing gives an owner or leaves in the intake queue. Media is fetched now, while Meta still has it. A scanner with no verdict, or any other transient
 * failure, retries the whole message later; a redelivery is never filed twice.
 */
@Service
public class WhatsAppInboundProcessor {
    private static final Logger log = LoggerFactory.getLogger(WhatsAppInboundProcessor.class);
    private static final int BATCH_SIZE = 20;
    /** Files are accepted as images or documents; other kinds are noted in the thread so the coordinator can ask again. */
    private static final Set<String> FILE_TYPES = Set.of("image", "document");
    private static final Set<String> UNSUPPORTED_MEDIA = Set.of("audio", "video", "sticker", "contacts");

    private final WhatsAppInboundStore store;
    private final PatientChannelService channel;
    private final IntakeConversationService intake;
    private final ObjectProvider<WhatsAppMediaPort> media;
    private final ObjectMapper json;
    private final long maxBytes;
    private volatile boolean stopping;

    public WhatsAppInboundProcessor(WhatsAppInboundStore store, PatientChannelService channel, IntakeConversationService intake,
                                    ObjectProvider<WhatsAppMediaPort> media, ObjectMapper json, @Value("${app.storage.max-bytes}") long maxBytes) {
        this.store = store; this.channel = channel; this.intake = intake; this.media = media; this.json = json; this.maxBytes = maxBytes;
    }

    @EventListener(ContextClosedEvent.class) void stop() { stopping = true; }

    @Scheduled(fixedDelayString = "${app.whatsapp.inbound.poll-milliseconds:5000}")
    public void dispatch() {
        if (stopping) return;
        for (InboundMessage message : store.claim(BATCH_SIZE)) {
            if (stopping) return; // the lease expires and another instance takes it
            handle(message);
        }
    }

    void handle(InboundMessage message) {
        try {
            var target = channel.caseFor(message.senderDigits());
            Parsed parsed = parse(message);
            if (parsed.ignored()) { store.processed(message, null, "IGNORED_" + parsed.type().toUpperCase()); return; }
            InboundFile file = null;
            String attachmentStatus = parsed.attachmentStatus();
            if (parsed.mediaId() != null) {
                WhatsAppMediaPort port = media.getIfAvailable();
                if (port == null) attachmentStatus = "UNAVAILABLE";
                else {
                    try {
                        var fetched = port.fetch(parsed.mediaId(), maxBytes);
                        file = new InboundFile(fetched.content(), parsed.mimeType() != null ? parsed.mimeType() : fetched.contentType(), parsed.fileName());
                    } catch (WhatsAppMediaPort.MediaGoneException e) { attachmentStatus = "EXPIRED"; }
                    catch (WhatsAppMediaPort.MediaTooLargeException e) { attachmentStatus = "TOO_LARGE"; }
                }
            }
            if (target.isEmpty()) {
                var conversation = intake.receive(message.providerMessageId(), message.senderDigits(), parsed.profileName(), parsed.text(), attachmentStatus,
                        file == null ? null : new IntakeConversationService.InboundFile(file.content(), file.contentType(), file.fileName()), message.sentAt());
                store.processed(message, null, conversation.isPresent() ? "INTAKE" : "ALREADY_FILED");
                return;
            }
            var filed = channel.fileWhatsAppMessage(target.get(), message.providerMessageId(), parsed.text(), attachmentStatus, file, message.sentAt());
            store.processed(message, target.get().caseId(), filed.isPresent() ? "FILED" : "ALREADY_FILED");
        } catch (DocumentScanUnavailableException e) {
            store.retryLater(message, "SCAN_UNAVAILABLE");
        } catch (RuntimeException e) {
            log.warn("Inbound WhatsApp message not filed yet: id={} attempt={} error={}", message.id(), message.attempt(), e.getClass().getSimpleName());
            store.retryLater(message, "PROCESSING_ERROR");
        }
    }

    /** What the thread shows: text (or caption), a file to fetch, or why a kind of content is not kept. */
    record Parsed(String type, String text, String mediaId, String mimeType, String fileName, String attachmentStatus, boolean ignored, String profileName) {
        Parsed(String type, String text, String mediaId, String mimeType, String fileName, String attachmentStatus, boolean ignored) {
            this(type, text, mediaId, mimeType, fileName, attachmentStatus, ignored, null);
        }
        Parsed named(String name) { return new Parsed(type, text, mediaId, mimeType, fileName, attachmentStatus, ignored, name); }
    }

    Parsed parse(InboundMessage message) {
        JsonNode root;
        try { root = json.readTree(message.payload()); }
        catch (Exception e) { throw new IllegalStateException("Stored inbound message is unreadable", e); }
        return parseMessage(root.path("message"), message.messageType()).named(root.path("profileName").asText(null));
    }

    private Parsed parseMessage(JsonNode m, String storedType) {
        String type = m.path("type").asText(storedType);
        return switch (type) {
            case "text" -> new Parsed(type, m.path("text").path("body").asText(""), null, null, null, null, false);
            case "button" -> new Parsed(type, m.path("button").path("text").asText(""), null, null, null, null, false);
            case "interactive" -> {
                JsonNode reply = m.path("interactive").path(m.path("interactive").path("type").asText());
                yield new Parsed(type, reply.path("title").asText(""), null, null, null, null, false);
            }
            case "location" -> {
                JsonNode l = m.path("location");
                String place = String.join(", ", java.util.stream.Stream.of(l.path("name").asText(""), l.path("address").asText(""))
                        .filter(v -> !v.isBlank()).toList());
                yield new Parsed(type, ("📍 " + place + " (" + l.path("latitude").asText() + ", " + l.path("longitude").asText() + ")").trim(),
                        null, null, null, null, false);
            }
            case "reaction" -> new Parsed(type, null, null, null, null, null, true);
            default -> {
                JsonNode content = m.path(type);
                String caption = content.path("caption").asText("");
                if (FILE_TYPES.contains(type)) {
                    String mediaId = content.path("id").asText(null);
                    yield new Parsed(type, caption, mediaId, content.path("mime_type").asText(null), content.path("filename").asText(null),
                            mediaId == null ? "UNAVAILABLE" : null, false);
                }
                yield new Parsed(type, caption, null, null, null, UNSUPPORTED_MEDIA.contains(type) ? "UNSUPPORTED_TYPE" : "UNSUPPORTED_CONTENT", false);
            }
        };
    }
}
