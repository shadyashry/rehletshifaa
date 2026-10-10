package com.rehletshifaa.journey.domain;

import com.rehletshifaa.shared.persistence.AssignedIdEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;

import java.time.Instant;
import java.util.UUID;

import static com.rehletshifaa.shared.persistence.SqlValues.micros;

/**
 * A message in one of a case's threads. The body is stored encrypted by the caller. {@code channel} is how it arrived
 * (PORTAL, SECURE_LINK, WHATSAPP); a WhatsApp message keeps its provider id (unique, so a redelivery is never stored
 * twice) and, when it carried a file, the case document it became or why it did not ({@code attachmentStatus}).
 */
@Entity
@Table(name = "case_messages")
public class CaseMessage extends AssignedIdEntity {
    @Column(name = "case_id", nullable = false) private UUID caseId;
    @Column(name = "thread_type", nullable = false, length = 40) private String threadType;
    @Column(name = "sender_subject", nullable = false) private String senderSubject;
    @Column(name = "sender_role", nullable = false, length = 40) private String senderRole;
    @Column(nullable = false, columnDefinition = "text") private String body;
    @Column(nullable = false, length = 8) private String language;
    @Column(name = "internal_only", nullable = false) private boolean internalOnly;
    @Column(name = "created_at", nullable = false) private Instant createdAt;
    @Column(name = "read_at") private Instant readAt;
    @Column(nullable = false, length = 20) private String channel;
    @Column(name = "external_message_id") private String externalMessageId;
    @Column(name = "attachment_document_id") private UUID attachmentDocumentId;
    @Column(name = "attachment_status", length = 30) private String attachmentStatus;

    protected CaseMessage() {}

    public CaseMessage(UUID id, UUID caseId, String threadType, String senderSubject, String senderRole, String body, String language,
                       boolean internalOnly, Instant now) {
        super(id);
        this.caseId = caseId; this.threadType = threadType; this.senderSubject = senderSubject; this.senderRole = senderRole;
        this.body = body; this.language = language; this.internalOnly = internalOnly; this.createdAt = micros(now);
        this.channel = "SECURE_LINK".equals(senderSubject) ? "SECURE_LINK" : "PORTAL";
    }

    /** A patient-thread message that arrived on WhatsApp. */
    public static CaseMessage fromWhatsApp(UUID id, UUID caseId, String senderRole, String body, String language, String externalMessageId,
                                           UUID attachmentDocumentId, String attachmentStatus, Instant receivedAt) {
        CaseMessage m = new CaseMessage(id, caseId, "PATIENT_COORDINATOR", "WHATSAPP", senderRole, body, language, false, receivedAt);
        m.channel = "WHATSAPP"; m.externalMessageId = externalMessageId;
        m.attachmentDocumentId = attachmentDocumentId; m.attachmentStatus = attachmentStatus;
        return m;
    }

    public UUID getCaseId() { return caseId; }
}
