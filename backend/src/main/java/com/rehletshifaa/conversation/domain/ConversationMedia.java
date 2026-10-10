package com.rehletshifaa.conversation.domain;

import com.rehletshifaa.shared.persistence.AssignedIdEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;

import java.time.Instant;
import java.util.UUID;

import static com.rehletshifaa.shared.persistence.SqlValues.micros;

/** A clean file received in an intake conversation, stored at a server-only key until it becomes a case document. */
@Entity
@Table(name = "conversation_media")
public class ConversationMedia extends AssignedIdEntity {
    @Column(name = "conversation_id", nullable = false) private UUID conversationId;
    @Column(name = "object_key", nullable = false) private String objectKey;
    @Column(name = "original_file_name", nullable = false) private String originalFileName;
    @Column(name = "content_type", nullable = false, length = 100) private String contentType;
    @Column(name = "size_bytes", nullable = false) private long sizeBytes;
    @Column(name = "created_at", nullable = false) private Instant createdAt;

    protected ConversationMedia() {}

    public ConversationMedia(UUID id, UUID conversationId, String objectKey, String originalFileName, String contentType, long sizeBytes, Instant now) {
        super(id);
        this.conversationId = conversationId; this.objectKey = objectKey; this.originalFileName = originalFileName;
        this.contentType = contentType; this.sizeBytes = sizeBytes; this.createdAt = micros(now);
    }

    public UUID getConversationId() { return conversationId; }
    public String getObjectKey() { return objectKey; }
    public String getOriginalFileName() { return originalFileName; }
    public String getContentType() { return contentType; }
    public long getSizeBytes() { return sizeBytes; }
}
