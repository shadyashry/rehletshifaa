package com.rehletshifaa.journey.domain;

import com.rehletshifaa.shared.persistence.PersistableEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import org.hibernate.annotations.Immutable;

import java.time.Instant;
import java.util.UUID;

import static com.rehletshifaa.shared.persistence.SqlValues.micros;

/** Immutable admission evidence: how a submitted case was admitted (or not) to the journey runtime, once per case. */
@Entity
@Immutable
@Table(name = "journey_case_admissions")
public class JourneyCaseAdmission extends PersistableEntity<UUID> {
    @Id @Column(name = "case_id") private UUID caseId;
    @Column(nullable = false, length = 12) private String decision;
    @Column(nullable = false, length = 40) private String reason;
    @Column(name = "policy_id", length = 60) private String policyId;
    @Column(name = "policy_revision", nullable = false, length = 64) private String policyRevision;
    @Column(name = "journey_version_id") private UUID journeyVersionId;
    @Column(name = "care_category", length = 60) private String careCategory;
    @Column(name = "evaluated_at", nullable = false) private Instant evaluatedAt;

    protected JourneyCaseAdmission() {}

    public JourneyCaseAdmission(UUID caseId, String decision, String reason, String policyId, String policyRevision, UUID journeyVersionId,
                                String careCategory, Instant evaluatedAt) {
        this.caseId = caseId; this.decision = decision; this.reason = reason; this.policyId = policyId; this.policyRevision = policyRevision;
        this.journeyVersionId = journeyVersionId; this.careCategory = careCategory; this.evaluatedAt = micros(evaluatedAt);
    }

    @Override public UUID getId() { return caseId; }
    public String getDecision() { return decision; }
    public String getReason() { return reason; }
    public String getPolicyId() { return policyId; }
    public String getPolicyRevision() { return policyRevision; }
    public UUID getJourneyVersionId() { return journeyVersionId; }
    public String getCareCategory() { return careCategory; }
    public Instant getEvaluatedAt() { return evaluatedAt; }
}
