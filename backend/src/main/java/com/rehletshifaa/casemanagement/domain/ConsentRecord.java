package com.rehletshifaa.casemanagement.domain;

import com.rehletshifaa.shared.persistence.AssignedIdEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;

import java.time.Instant;
import java.util.UUID;

import static com.rehletshifaa.shared.persistence.SqlValues.micros;

/** A consent the patient gave: the exact text shown, its policy version, purpose, scope and how it was captured. */
@Entity
@Table(name = "consent_records")
public class ConsentRecord extends AssignedIdEntity {
    @Column(name = "patient_id", nullable = false) private UUID patientId;
    @Column(name = "case_id") private UUID caseId;
    @Column(name = "consent_type", nullable = false, length = 60) private String consentType;
    @Column(name = "policy_version", nullable = false, length = 40) private String policyVersion;
    @Column(nullable = false, length = 8) private String language;
    @Column(name = "exact_text", nullable = false, columnDefinition = "text") private String exactText;
    @Column(nullable = false, length = 500) private String purpose;
    @Column(nullable = false, length = 500) private String scope;
    @Column(nullable = false, length = 40) private String channel;
    @Column(name = "captured_by", nullable = false) private String capturedBy;
    @Column(name = "effective_from", nullable = false) private Instant effectiveFrom;
    @Column(name = "effective_until") private Instant effectiveUntil;
    @Column(name = "revoked_at") private Instant revokedAt;
    @Column(name = "created_at", nullable = false) private Instant createdAt;
    @Column(name = "related_proposal_version_id") private UUID relatedProposalVersionId;
    @Column(name = "evidence_document_id") private UUID evidenceDocumentId;
    @Column(name = "evidence_reference", length = 300) private String evidenceReference;

    protected ConsentRecord() {}

    /** What the patient consented to, in the words they saw. */
    public record Terms(String consentType, String policyVersion, String language, String exactText, String purpose, String scope) {}

    public ConsentRecord(UUID id, UUID patientId, UUID caseId, Terms terms, String channel, String capturedBy, Instant now) {
        super(id);
        this.patientId = patientId; this.caseId = caseId; this.consentType = terms.consentType(); this.policyVersion = terms.policyVersion();
        this.language = terms.language(); this.exactText = terms.exactText(); this.purpose = terms.purpose(); this.scope = terms.scope();
        this.channel = channel; this.capturedBy = capturedBy; this.effectiveFrom = micros(now); this.createdAt = micros(now);
    }

    /** Links the consent to the proposal it was given for and its signed evidence. */
    public ConsentRecord evidencedBy(UUID proposalVersionId, UUID documentId, String reference) {
        this.relatedProposalVersionId = proposalVersionId; this.evidenceDocumentId = documentId; this.evidenceReference = reference;
        return this;
    }
}
