package com.rehletshifaa.journey.domain;

import com.rehletshifaa.shared.crypto.EncryptedStringConverter;
import com.rehletshifaa.shared.persistence.AssignedIdEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Convert;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;

import java.time.Instant;
import java.util.UUID;

import static com.rehletshifaa.shared.persistence.SqlValues.micros;

/**
 * The patient's outcome at day 30 or day 90 after discharge (P1-18; architecture §4.6; PROMs-light: pain, function and satisfaction
 * 0-10, complication yes/no). Health data under PDPL: read by the case's Consultant and coordinator (the free text by the
 * Consultant only) and, for a complication, by the incident's owner and Compliance through the incident; the free text (what the
 * complication is, the Consultant's review) is encrypted, the scores and the flag stay plain for the schema's checks and P1-19's counts. The row is
 * created when the question is asked and answered once; a complication links the incident it opened and waits for the
 * Consultant's review.
 */
@Entity
@Table(name = "case_outcomes")
public class CaseOutcome extends AssignedIdEntity {
    public enum Point { D30, D90 }
    public enum Channel { MY_CARE, SECURE_LINK }
    /** The answer, one value object so the call stays short. */
    public record Answer(int pain, int function, int satisfaction, boolean complication, String complicationNote, String noticeVersion) {}

    @Column(name = "case_id", nullable = false) private UUID caseId;
    @Column(nullable = false, length = 4) private String point;
    @Column(name = "requested_at", nullable = false) private Instant requestedAt;
    @Column(name = "link_id") private UUID linkId;
    @Column(name = "pain_score") private Short painScore;
    @Column(name = "function_score") private Short functionScore;
    @Column(name = "satisfaction_score") private Short satisfactionScore;
    @Column private Boolean complication;
    @Convert(converter = EncryptedStringConverter.class) @Column(name = "complication_note", columnDefinition = "text") private String complicationNote;
    @Column(length = 20) private String channel;
    @Column(name = "reported_by") private String reportedBy;
    @Column(name = "reported_role", length = 40) private String reportedRole;
    @Column(name = "reported_at") private Instant reportedAt;
    @Column(name = "notice_version", length = 40) private String noticeVersion;
    @Column(name = "incident_id") private UUID incidentId;
    @Column(name = "reviewed_by") private String reviewedBy;
    @Column(name = "reviewed_at") private Instant reviewedAt;
    @Convert(converter = EncryptedStringConverter.class) @Column(name = "review_note", columnDefinition = "text") private String reviewNote;
    @Column(nullable = false) private long version;

    protected CaseOutcome() {}

    public CaseOutcome(UUID caseId, Point point, UUID linkId, Instant at) {
        super(UUID.randomUUID());
        this.caseId = caseId; this.point = point.name(); this.linkId = linkId; this.requestedAt = micros(at);
    }

    public void answer(Answer a, Channel channel, String subject, String role, Instant at) {
        if (answered()) throw new IllegalStateException("The outcome is already reported");
        painScore = (short) a.pain(); functionScore = (short) a.function(); satisfactionScore = (short) a.satisfaction();
        complication = a.complication(); complicationNote = a.complication() ? a.complicationNote() : null; noticeVersion = a.noticeVersion();
        this.channel = channel.name(); reportedBy = subject; reportedRole = role; reportedAt = micros(at);
    }

    public void linkIncident(UUID incidentId) { this.incidentId = incidentId; }

    public void review(String note, String subject, Instant at) {
        if (!Boolean.TRUE.equals(complication) || reviewedAt != null) throw new IllegalStateException("Only an unreviewed complication is reviewed");
        reviewNote = note; reviewedBy = subject; reviewedAt = micros(at);
    }

    public boolean answered() { return reportedAt != null; }
    /** A reported complication the Consultant has not reviewed yet. */
    public boolean awaitingReview() { return Boolean.TRUE.equals(complication) && reviewedAt == null; }

    public UUID getCaseId() { return caseId; }
    public Point getPoint() { return Point.valueOf(point); }
    public Instant getRequestedAt() { return requestedAt; }
    public UUID getLinkId() { return linkId; }
    public Integer getPainScore() { return painScore == null ? null : painScore.intValue(); }
    public Integer getFunctionScore() { return functionScore == null ? null : functionScore.intValue(); }
    public Integer getSatisfactionScore() { return satisfactionScore == null ? null : satisfactionScore.intValue(); }
    public Boolean getComplication() { return complication; }
    public String getComplicationNote() { return complicationNote; }
    public String getChannel() { return channel; }
    public String getReportedBy() { return reportedBy; }
    public String getReportedRole() { return reportedRole; }
    public Instant getReportedAt() { return reportedAt; }
    public String getNoticeVersion() { return noticeVersion; }
    public UUID getIncidentId() { return incidentId; }
    public String getReviewedBy() { return reviewedBy; }
    public Instant getReviewedAt() { return reviewedAt; }
    public String getReviewNote() { return reviewNote; }
}
