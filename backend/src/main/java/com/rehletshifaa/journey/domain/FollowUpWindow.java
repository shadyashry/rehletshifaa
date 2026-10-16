package com.rehletshifaa.journey.domain;

import com.rehletshifaa.shared.persistence.AssignedIdEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;

import java.time.Duration;
import java.time.Instant;
import java.util.UUID;

import static com.rehletshifaa.shared.persistence.SqlValues.micros;

/**
 * The follow-up window of a discharged case (P1-18, decision D-G; one per case). The check-ins and the outcome questions count
 * from {@code dischargedAt}; the window ends {@code freeDays} after it (frozen at discharge from the care area's policy, so a later
 * policy change never moves a running window). {@code closedAt} is when the scheduler closed it; {@code completedAt} when nothing
 * more is scheduled on it (the day-90 question asked, or the case cancelled).
 */
@Entity
@Table(name = "follow_up_windows")
public class FollowUpWindow extends AssignedIdEntity {
    @Column(name = "case_id", nullable = false) private UUID caseId;
    @Column(name = "discharged_at", nullable = false) private Instant dischargedAt;
    @Column(name = "free_days", nullable = false) private int freeDays;
    @Column(name = "ends_at", nullable = false) private Instant endsAt;
    @Column(name = "closed_at") private Instant closedAt;
    @Column(name = "completed_at") private Instant completedAt;
    @Column(nullable = false) private long version;

    protected FollowUpWindow() {}

    public FollowUpWindow(UUID caseId, Instant dischargedAt, int freeDays) {
        super(UUID.randomUUID());
        this.caseId = caseId; this.dischargedAt = micros(dischargedAt); this.freeDays = freeDays;
        this.endsAt = micros(dischargedAt.plus(Duration.ofDays(freeDays)));
    }

    /** The instant {@code days} calendar days after discharge (the check-ins and outcome questions count this way). */
    public Instant day(int days) { return dischargedAt.plus(Duration.ofDays(days)); }

    public void close(Instant at) { if (closedAt == null) closedAt = micros(at); }

    public void complete(Instant at) { if (completedAt == null) completedAt = micros(at); }

    public UUID getCaseId() { return caseId; }
    public Instant getDischargedAt() { return dischargedAt; }
    public int getFreeDays() { return freeDays; }
    public Instant getEndsAt() { return endsAt; }
    public Instant getClosedAt() { return closedAt; }
    public Instant getCompletedAt() { return completedAt; }
}
