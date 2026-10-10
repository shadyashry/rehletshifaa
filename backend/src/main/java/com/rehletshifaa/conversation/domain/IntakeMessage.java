package com.rehletshifaa.conversation.domain;

import com.rehletshifaa.shared.persistence.AssignedIdEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;

import java.time.Instant;
import java.util.UUID;

import static com.rehletshifaa.shared.persistence.SqlValues.micros;

/** One message of an intake conversation, either way. The body is stored encrypted by the caller. */
@Entity
@Table(name = "intake_messages")
public class IntakeMessage extends AssignedIdEntity {
    @Column(name = "conversation_id", nullable = false) private UUID conversationId;
    @Column(nullable = false, length = 10) private String direction;
    @Column(name = "sender_subject") private String senderSubject;
    @Column(nullable = false, length = 20) private String kind;
    @Column(nullable = false, columnDefinition = "text") private String body;
    @Column(nullable = false, length = 8) private String language;
    @Column(name = "external_message_id") private String externalMessageId;
    @Column(name = "media_id") private UUID mediaId;
    @Column(name = "attachment_status", length = 30) private String attachmentStatus;
    @Column(name = "created_at", nullable = false) private Instant createdAt;

    protected IntakeMessage() {}

    public static IntakeMessage inbound(UUID id, UUID conversationId, String body, String language, String externalMessageId,
                                        UUID mediaId, String attachmentStatus, Instant sentAt) {
        IntakeMessage m = new IntakeMessage(id, conversationId, "IN", null, "TEXT", body, language, sentAt);
        m.externalMessageId = externalMessageId; m.mediaId = mediaId; m.attachmentStatus = attachmentStatus;
        return m;
    }

    public static IntakeMessage outbound(UUID id, UUID conversationId, String sender, String kind, String body, String language, Instant now) {
        return new IntakeMessage(id, conversationId, "OUT", sender, kind, body, language, now);
    }

    private IntakeMessage(UUID id, UUID conversationId, String direction, String senderSubject, String kind, String body, String language, Instant at) {
        super(id);
        this.conversationId = conversationId; this.direction = direction; this.senderSubject = senderSubject; this.kind = kind;
        this.body = body; this.language = language; this.createdAt = micros(at);
    }

    public UUID getConversationId() { return conversationId; }
    public String getDirection() { return direction; }
    public String getSenderSubject() { return senderSubject; }
    public String getKind() { return kind; }
    public String getBody() { return body; }
    public String getLanguage() { return language; }
    public UUID getMediaId() { return mediaId; }
    public String getAttachmentStatus() { return attachmentStatus; }
    public Instant getCreatedAt() { return createdAt; }
}
