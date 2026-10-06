package com.rehletshifaa.journey.domain;

import com.rehletshifaa.shared.persistence.AssignedIdEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;
import org.hibernate.annotations.DynamicUpdate;

import java.time.Instant;
import java.util.UUID;

import static com.rehletshifaa.shared.persistence.SqlValues.micros;

/**
 * An identity check of the patient (or their representative). Legal name and date of birth are stored encrypted and
 * the document reference masked by the caller; a reviewer's decision is a guarded update.
 */
@Entity
@DynamicUpdate
@Table(name = "patient_identity_verifications")
public class PatientIdentityVerification extends AssignedIdEntity {
    @Column(name = "patient_id", nullable = false) private UUID patientId;
    @Column(name = "onboarding_id") private UUID onboardingId;
    @Column(name = "subject_type", nullable = false, length = 20) private String subjectType;
    @Column(name = "representative_id") private UUID representativeId;
    @Column(name = "representative_relationship", length = 80) private String representativeRelationship;
    @Column(name = "assurance_level", length = 20) private String assuranceLevel;
    @Column(length = 40) private String method;
    @Column(length = 60) private String provider;
    @Column(name = "provider_reference", length = 200) private String providerReference;
    @Column(nullable = false, length = 20) private String status;
    @Column(name = "legal_name_encrypted", columnDefinition = "text") private String legalNameEncrypted;
    @Column(name = "date_of_birth_encrypted", columnDefinition = "text") private String dateOfBirthEncrypted;
    @Column(length = 80) private String nationality;
    @Column(name = "document_type", length = 40) private String documentType;
    @Column(name = "issuing_country", length = 80) private String issuingCountry;
    @Column(name = "document_reference_masked", length = 60) private String documentReferenceMasked;
    @Column(name = "requested_at") private Instant requestedAt;
    @Column(name = "verified_at") private Instant verifiedAt;
    @Column(name = "expires_at") private Instant expiresAt;
    @Column(name = "reviewed_by", length = 120) private String reviewedBy;
    @Column(name = "rejection_reason", columnDefinition = "text") private String rejectionReason;
    @Column(name = "created_at", nullable = false) private Instant createdAt;
    @Column(name = "updated_at", nullable = false) private Instant updatedAt;
    @Column(nullable = false) private long version;

    protected PatientIdentityVerification() {}

    /** Who is being verified, for whom. */
    public record Subject(UUID patientId, UUID onboardingId, String subjectType, UUID representativeId, String representativeRelationship) {}

    /** The evidence presented and how the provider assessed it. */
    public record Evidence(String method, String provider, String providerReference, String assuranceLevel, String status,
                           String legalNameEncrypted, String dateOfBirthEncrypted, String nationality, String documentType,
                           String issuingCountry, String documentReferenceMasked) {}

    public PatientIdentityVerification(UUID id, Subject s, Evidence e, Instant now) {
        super(id);
        this.patientId = s.patientId(); this.onboardingId = s.onboardingId(); this.subjectType = s.subjectType();
        this.representativeId = s.representativeId(); this.representativeRelationship = s.representativeRelationship();
        this.method = e.method(); this.provider = e.provider(); this.providerReference = e.providerReference();
        this.assuranceLevel = e.assuranceLevel(); this.status = e.status(); this.legalNameEncrypted = e.legalNameEncrypted();
        this.dateOfBirthEncrypted = e.dateOfBirthEncrypted(); this.nationality = e.nationality(); this.documentType = e.documentType();
        this.issuingCountry = e.issuingCountry(); this.documentReferenceMasked = e.documentReferenceMasked();
        this.requestedAt = micros(now); this.createdAt = micros(now); this.updatedAt = micros(now);
    }
}
