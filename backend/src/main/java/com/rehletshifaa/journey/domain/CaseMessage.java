package com.rehletshifaa.journey.domain;

import com.rehletshifaa.shared.persistence.AssignedIdEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;

import java.time.Instant;
import java.util.UUID;

import static com.rehletshifaa.shared.persistence.SqlValues.micros;

/** A message in one of a case's threads. The body is stored encrypted by the caller. */
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

    protected CaseMessage() {}

    public CaseMessage(UUID id, UUID caseId, String threadType, String senderSubject, String senderRole, String body, String language,
                       boolean internalOnly, Instant now) {
        super(id);
        this.caseId = caseId; this.threadType = threadType; this.senderSubject = senderSubject; this.senderRole = senderRole;
        this.body = body; this.language = language; this.internalOnly = internalOnly; this.createdAt = micros(now);
    }

    public UUID getCaseId() { return caseId; }
}
