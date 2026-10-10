package com.rehletshifaa.conversation.domain;

import com.rehletshifaa.shared.persistence.AssignedIdEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;

import java.time.Instant;
import java.util.UUID;

import static com.rehletshifaa.shared.persistence.SqlValues.micros;

/**
 * A patient waiting for an answer in one conversation (a case's patient thread, or an intake conversation). Open while
 * {@code resolvedAt} is null. The first unanswered message starts the clock; later messages do not restart it.
 */
@Entity
@Table(name = "reply_obligations")
public class ReplyObligation extends AssignedIdEntity {
    @Column(name = "target_type", nullable = false, length = 10) private String targetType;
    @Column(name = "target_id", nullable = false) private UUID targetId;
    @Column(name = "awaiting_since", nullable = false) private Instant awaitingSince;
    @Column(name = "remind_at", nullable = false) private Instant remindAt;
    @Column(name = "escalate_at", nullable = false) private Instant escalateAt;
    @Column(name = "reminded_at") private Instant remindedAt;
    @Column(name = "escalated_at") private Instant escalatedAt;
    @Column(name = "resolved_at") private Instant resolvedAt;
    @Column(nullable = false) private long revision;

    protected ReplyObligation() {}

    public ReplyObligation(UUID id, String targetType, UUID targetId) {
        super(id);
        this.targetType = targetType; this.targetId = targetId; this.resolvedAt = Instant.EPOCH;
    }

    /** A message arrived: start waiting, unless the patient is already waiting (the first unanswered message counts). */
    public boolean await(Instant since, Instant remind, Instant escalate) {
        if (isOpen()) return false;
        awaitingSince = micros(since); remindAt = micros(remind); escalateAt = micros(escalate);
        remindedAt = null; escalatedAt = null; resolvedAt = null; revision++;
        return true;
    }

    public void resolve(Instant now) { if (isOpen()) { resolvedAt = micros(now); revision++; } }
    public void reminded(Instant now) { remindedAt = micros(now); revision++; }
    public void escalated(Instant now) { escalatedAt = micros(now); revision++; }

    public boolean isOpen() { return resolvedAt == null; }
    public String getTargetType() { return targetType; }
    public UUID getTargetId() { return targetId; }
    public Instant getAwaitingSince() { return awaitingSince; }
    public Instant getRemindAt() { return remindAt; }
    public Instant getEscalateAt() { return escalateAt; }
    public Instant getRemindedAt() { return remindedAt; }
    public Instant getEscalatedAt() { return escalatedAt; }
}
