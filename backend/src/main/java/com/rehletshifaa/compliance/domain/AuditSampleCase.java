package com.rehletshifaa.compliance.domain;

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
 * One sampled closed case (P1-19, design §7.8): the money record assembled when it was drawn (statement, final invoice, receipts,
 * the accepted final quote's lines by payee, the reconciliation; amounts and references only, never clinical content: AUD-05), the
 * mismatches found in it, then Compliance's review: no finding, or a finding (note encrypted) that became a case incident.
 */
@Entity
@Table(name = "audit_sample_cases")
public class AuditSampleCase extends AssignedIdEntity {
    public enum ReviewStatus { PENDING, NO_FINDING, FINDING }

    @Column(name = "sample_id", nullable = false) private UUID sampleId;
    @Column(name = "case_id", nullable = false) private UUID caseId;
    @Column(name = "closed_at", nullable = false) private Instant closedAt;
    @Column(name = "practitioner_id") private UUID practitionerId;
    @Column(name = "facility_id") private UUID facilityId;
    @Column(nullable = false, columnDefinition = "text") private String record;
    @Column(nullable = false, length = 400) private String mismatches;
    @Column(name = "review_status", nullable = false, length = 20) private String reviewStatus;
    @Column(name = "reviewed_by") private String reviewedBy;
    @Column(name = "reviewed_at") private Instant reviewedAt;
    @Convert(converter = EncryptedStringConverter.class) @Column(name = "finding_note", columnDefinition = "text") private String findingNote;
    @Column(name = "incident_id") private UUID incidentId;
    @Column(nullable = false) private long version;

    protected AuditSampleCase() {}

    public AuditSampleCase(UUID sampleId, UUID caseId, Instant closedAt, UUID practitionerId, UUID facilityId, String record, String mismatches) {
        super(UUID.randomUUID());
        this.sampleId = sampleId; this.caseId = caseId; this.closedAt = micros(closedAt); this.practitionerId = practitionerId;
        this.facilityId = facilityId; this.record = record; this.mismatches = mismatches; this.reviewStatus = ReviewStatus.PENDING.name();
    }

    public void noFinding(String by, Instant at) { review(ReviewStatus.NO_FINDING, null, null, by, at); }

    public void finding(String note, UUID incidentId, String by, Instant at) { review(ReviewStatus.FINDING, note, incidentId, by, at); }

    private void review(ReviewStatus outcome, String note, UUID incident, String by, Instant at) {
        if (getReviewStatus() != ReviewStatus.PENDING) throw new IllegalStateException("Already reviewed");
        reviewStatus = outcome.name(); findingNote = note; incidentId = incident; reviewedBy = by; reviewedAt = micros(at); version++;
    }

    public UUID getSampleId() { return sampleId; }
    public UUID getCaseId() { return caseId; }
    public Instant getClosedAt() { return closedAt; }
    public UUID getPractitionerId() { return practitionerId; }
    public UUID getFacilityId() { return facilityId; }
    public String getRecord() { return record; }
    public String getMismatches() { return mismatches; }
    public ReviewStatus getReviewStatus() { return ReviewStatus.valueOf(reviewStatus); }
    public String getReviewedBy() { return reviewedBy; }
    public Instant getReviewedAt() { return reviewedAt; }
    public String getFindingNote() { return findingNote; }
    public UUID getIncidentId() { return incidentId; }
}
