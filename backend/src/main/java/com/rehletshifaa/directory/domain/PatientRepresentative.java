package com.rehletshifaa.directory.domain;

import com.rehletshifaa.shared.persistence.AssignedIdEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;

import java.time.Instant;
import java.util.UUID;

import static com.rehletshifaa.shared.persistence.SqlValues.micros;

/**
 * A person acting for a patient with a bounded permission set, until revoked or expired.
 *
 * <p>P1-13 (A-05) gives the delegation a type. A {@code REPRESENTATIVE} acts for an adult who authorised it. A
 * {@code GUARDIAN} acts under a legal basis ({@link LegalBasis}: a parent, a legal guardian, a court order) for a minor, or
 * for an adult who cannot decide. A guardian's authority is not taken on trust: it names an evidence document of the case
 * (a birth certificate, a custody or guardianship order) and counts only once a coordinator has verified that evidence
 * ({@link #evidenceVerified()}). Re-attaching or rejecting evidence clears the verification. The guardian also gives their own
 * consent type (GUARDIAN_AUTHORIZATION), recorded in the existing consent records.
 */
@Entity
@Table(name = "patient_representatives")
public class PatientRepresentative extends AssignedIdEntity {
    @Column(name = "patient_id", nullable = false) private UUID patientId;
    @Column(name = "representative_subject", nullable = false) private String representativeSubject;
    @Column(nullable = false, length = 80) private String relationship;
    @Column(nullable = false, length = 500) private String permissions;
    @Column(name = "effective_from", nullable = false) private Instant effectiveFrom;
    @Column(name = "expires_at") private Instant expiresAt;
    @Column(name = "revoked_at") private Instant revokedAt;
    @Column(name = "created_at", nullable = false) private Instant createdAt;
    @Column(name = "delegation_type", nullable = false, length = 20) private String delegationType = DelegationType.REPRESENTATIVE.name();
    @Column(name = "legal_basis", length = 30) private String legalBasis;
    @Column(name = "evidence_document_id") private UUID evidenceDocumentId;
    @Column(name = "evidence_verified_at") private Instant evidenceVerifiedAt;
    @Column(name = "evidence_verified_by") private String evidenceVerifiedBy;

    public enum DelegationType { REPRESENTATIVE, GUARDIAN }
    /** Why the guardian may decide for the patient; the CHECK constraint on the table mirrors this list. */
    public enum LegalBasis { PARENT, LEGAL_GUARDIAN, COURT_ORDER }

    protected PatientRepresentative() {}

    public PatientRepresentative(UUID patientId, String representativeSubject, String relationship, String permissions,
                                 Instant effectiveFrom, Instant expiresAt, Instant createdAt) {
        super(UUID.randomUUID());
        this.patientId = patientId; this.representativeSubject = representativeSubject; this.relationship = relationship;
        this.permissions = permissions; this.effectiveFrom = micros(effectiveFrom); this.expiresAt = micros(expiresAt); this.createdAt = micros(createdAt);
    }

    /** A guardian delegation: same scope and term fields as a representative, plus the legal basis; evidence follows. */
    public static PatientRepresentative guardian(UUID patientId, String subject, String relationship, LegalBasis basis, String permissions,
                                                 Instant effectiveFrom, Instant expiresAt, Instant createdAt) {
        PatientRepresentative r = new PatientRepresentative(patientId, subject, relationship, permissions, effectiveFrom, expiresAt, createdAt);
        r.delegationType = DelegationType.GUARDIAN.name(); r.legalBasis = basis.name();
        return r;
    }

    /**
     * The same person declares themselves a guardian (they were a representative, or a guardian under another basis, or the
     * delegation was revoked or has expired): the term restarts. Evidence already verified under the same basis is kept; any
     * other change starts the evidence again.
     */
    public void reGrantAsGuardian(String relationship, LegalBasis basis, String permissions, Instant from, Instant expires) {
        boolean keepEvidence = getDelegationType() == DelegationType.GUARDIAN && getLegalBasis() == basis && revokedAt == null;
        this.relationship = relationship; this.permissions = permissions; this.effectiveFrom = micros(from); this.expiresAt = micros(expires); this.revokedAt = null;
        this.delegationType = DelegationType.GUARDIAN.name(); this.legalBasis = basis.name();
        if (!keepEvidence) { evidenceDocumentId = null; evidenceVerifiedAt = null; evidenceVerifiedBy = null; }
    }

    /** Attaches (or replaces) the evidence document; whatever was verified before no longer is. */
    public void attachEvidence(UUID documentId) {
        requireGuardian();
        evidenceDocumentId = documentId; evidenceVerifiedAt = null; evidenceVerifiedBy = null;
    }

    public void verifyEvidence(String by, Instant at) {
        requireGuardian();
        if (evidenceDocumentId == null) throw new IllegalStateException("There is no evidence to verify");
        evidenceVerifiedAt = micros(at); evidenceVerifiedBy = by;
    }

    /** The evidence was refused: the document link is dropped so the guardian provides another. */
    public void rejectEvidence() {
        requireGuardian();
        evidenceDocumentId = null; evidenceVerifiedAt = null; evidenceVerifiedBy = null;
    }

    private void requireGuardian() { if (getDelegationType() != DelegationType.GUARDIAN) throw new IllegalStateException("Not a guardian delegation"); }

    public UUID getPatientId() { return patientId; }
    public String getRepresentativeSubject() { return representativeSubject; }
    public String getRelationship() { return relationship; }
    public DelegationType getDelegationType() { return DelegationType.valueOf(delegationType); }
    public LegalBasis getLegalBasis() { return legalBasis == null ? null : LegalBasis.valueOf(legalBasis); }
    public UUID getEvidenceDocumentId() { return evidenceDocumentId; }
    public Instant getEvidenceVerifiedAt() { return evidenceVerifiedAt; }
    public String getEvidenceVerifiedBy() { return evidenceVerifiedBy; }
    public boolean evidenceVerified() { return evidenceVerifiedAt != null; }
    public Instant getRevokedAt() { return revokedAt; }
    public Instant getExpiresAt() { return expiresAt; }
    public Instant getEffectiveFrom() { return effectiveFrom; }
}
