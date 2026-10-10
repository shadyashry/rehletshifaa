package com.rehletshifaa.conversation.domain;

import com.rehletshifaa.shared.persistence.AssignedIdEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;

import java.time.Duration;
import java.time.Instant;
import java.util.UUID;

import static com.rehletshifaa.shared.persistence.SqlValues.micros;

/**
 * A WhatsApp conversation with someone who has no open case. At most one owner; while it has none it waits in the
 * intake queue. WhatsApp allows free-text replies for 24 hours after the person's last message ({@code windowExpiresAt}).
 */
@Entity
@Table(name = "intake_conversations")
public class IntakeConversation extends AssignedIdEntity {
    public static final Duration REPLY_WINDOW = Duration.ofHours(24);

    @Column(name = "wa_digits", nullable = false, length = 20) private String waDigits;
    @Column(name = "profile_name", columnDefinition = "text") private String profileName;
    @Column(nullable = false, length = 8) private String language;
    @Column(nullable = false, length = 20) private String status;
    @Column(name = "owner_subject") private String ownerSubject;
    @Column(name = "opened_at", nullable = false) private Instant openedAt;
    @Column(name = "last_inbound_at") private Instant lastInboundAt;
    @Column(name = "last_outbound_at") private Instant lastOutboundAt;
    @Column(name = "window_expires_at") private Instant windowExpiresAt;
    @Column(name = "linked_case_id") private UUID linkedCaseId;
    @Column(name = "closed_at") private Instant closedAt;
    @Column(name = "closed_reason", length = 40) private String closedReason;
    @Column(nullable = false) private long revision;

    protected IntakeConversation() {}

    /** {@code profileName} is stored encrypted by the caller. */
    public IntakeConversation(UUID id, String waDigits, String profileName, String language, Instant now) {
        super(id);
        this.waDigits = waDigits; this.profileName = profileName; this.language = language; this.status = "OPEN"; this.openedAt = micros(now);
    }

    /** A message from the person: the reply window restarts from when they sent it. */
    public void inbound(Instant sentAt, String encryptedProfileName) {
        Instant at = micros(sentAt);
        if (lastInboundAt == null || at.isAfter(lastInboundAt)) { lastInboundAt = at; windowExpiresAt = at.plus(REPLY_WINDOW); }
        if (encryptedProfileName != null) this.profileName = encryptedProfileName;
        revision++;
    }

    public void outbound(Instant now) { lastOutboundAt = micros(now); revision++; }

    public void assign(String owner) { this.ownerSubject = owner; revision++; }

    public void reopen() { status = "OPEN"; closedAt = null; closedReason = null; revision++; }

    public void close(String reason, Instant now) { status = "CLOSED"; closedReason = reason; closedAt = micros(now); revision++; }

    public boolean windowOpen(Instant now) { return windowExpiresAt != null && now.isBefore(windowExpiresAt); }

    public boolean isOpen() { return "OPEN".equals(status); }
    public String getWaDigits() { return waDigits; }
    public String getProfileName() { return profileName; }
    public String getLanguage() { return language; }
    public String getStatus() { return status; }
    public String getOwnerSubject() { return ownerSubject; }
    public Instant getOpenedAt() { return openedAt; }
    public Instant getLastInboundAt() { return lastInboundAt; }
    public Instant getLastOutboundAt() { return lastOutboundAt; }
    public Instant getWindowExpiresAt() { return windowExpiresAt; }
    public UUID getLinkedCaseId() { return linkedCaseId; }
    public String getClosedReason() { return closedReason; }
}
