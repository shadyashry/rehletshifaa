package com.rehletshifaa.journey.domain;

import com.rehletshifaa.shared.persistence.AssignedIdEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;
import org.hibernate.annotations.DynamicUpdate;

import java.time.Instant;
import java.util.UUID;

import static com.rehletshifaa.shared.persistence.SqlValues.micros;

/** A numbered version of the consultant's clinical review of a case: DRAFT, APPROVED or SUPERSEDED. */
@Entity
@DynamicUpdate
@Table(name = "clinical_review_versions")
public class ClinicalReviewVersion extends AssignedIdEntity {
    @Column(name = "case_id", nullable = false) private UUID caseId;
    @Column(name = "practitioner_id", nullable = false) private UUID practitionerId;
    @Column(name = "version_number", nullable = false) private int versionNumber;
    @Column(nullable = false, length = 30) private String status;
    @Column(name = "case_summary", columnDefinition = "text") private String caseSummary;
    @Column(length = 80) private String suitability;
    @Column(name = "missing_information", columnDefinition = "text") private String missingInformation;
    @Column(name = "recommended_investigations", columnDefinition = "text") private String recommendedInvestigations;
    @Column(name = "recommended_treatment", columnDefinition = "text") private String recommendedTreatment;
    @Column(columnDefinition = "text") private String alternatives;
    @Column(name = "risks_and_limitations", columnDefinition = "text") private String risksAndLimitations;
    @Column(name = "expected_sequence", columnDefinition = "text") private String expectedSequence;
    @Column(name = "expected_duration", length = 200) private String expectedDuration;
    @Column(name = "follow_up_recommendation", columnDefinition = "text") private String followUpRecommendation;
    @Column(name = "created_by", nullable = false) private String createdBy;
    @Column(name = "created_at", nullable = false) private Instant createdAt;
    @Column(name = "approved_by") private String approvedBy;
    @Column(name = "approved_at") private Instant approvedAt;
    @Column(name = "proposal_currency", length = 3) private String proposalCurrency;

    protected ClinicalReviewVersion() {}

    /** The clinical content of a review. */
    public record Content(String caseSummary, String suitability, String missingInformation, String recommendedInvestigations,
                          String recommendedTreatment, String alternatives, String risksAndLimitations, String expectedSequence,
                          String expectedDuration, String followUpRecommendation) {}

    private ClinicalReviewVersion(UUID id, UUID caseId, UUID practitionerId, int versionNumber, String status, Content c, String proposalCurrency,
                                  String createdBy, Instant now) {
        super(id);
        this.caseId = caseId; this.practitionerId = practitionerId; this.versionNumber = versionNumber; this.status = status;
        this.caseSummary = c.caseSummary(); this.suitability = c.suitability(); this.missingInformation = c.missingInformation();
        this.recommendedInvestigations = c.recommendedInvestigations(); this.recommendedTreatment = c.recommendedTreatment();
        this.alternatives = c.alternatives(); this.risksAndLimitations = c.risksAndLimitations(); this.expectedSequence = c.expectedSequence();
        this.expectedDuration = c.expectedDuration(); this.followUpRecommendation = c.followUpRecommendation();
        this.proposalCurrency = proposalCurrency; this.createdBy = createdBy; this.createdAt = micros(now);
    }

    /** A draft the consultant is still writing. */
    public static ClinicalReviewVersion draft(UUID id, UUID caseId, UUID practitionerId, int versionNumber, Content content,
                                              String proposalCurrency, String createdBy, Instant now) {
        return new ClinicalReviewVersion(id, caseId, practitionerId, versionNumber, "DRAFT", content, proposalCurrency, createdBy, now);
    }

    /** A review recorded and approved in one step (the consultant's SUITABLE decision). */
    public static ClinicalReviewVersion approvedSuitable(UUID id, UUID caseId, UUID practitionerId, int versionNumber, String recommendedTreatment,
                                                         String risksAndLimitations, String proposalCurrency, String consultant, Instant now) {
        Content content = new Content(null, "SUITABLE", null, null, recommendedTreatment, null, risksAndLimitations, null, null, null);
        ClinicalReviewVersion v = new ClinicalReviewVersion(id, caseId, practitionerId, versionNumber, "APPROVED", content, proposalCurrency,
                consultant, now);
        v.approvedBy = consultant; v.approvedAt = micros(now);
        return v;
    }

    public String getApprovedBy() { return approvedBy; }
    public Instant getApprovedAt() { return approvedAt; }
}
