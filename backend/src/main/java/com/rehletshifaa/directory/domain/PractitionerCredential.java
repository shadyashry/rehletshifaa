package com.rehletshifaa.directory.domain;

import com.rehletshifaa.shared.persistence.AssignedIdEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;

import java.time.Instant;
import java.util.UUID;

import static com.rehletshifaa.shared.persistence.SqlValues.micros;

/** A credential a consultant holds (licence, board certificate…), reviewed during credentialing and expiring. */
@Entity
@Table(name = "practitioner_credentials")
public class PractitionerCredential extends AssignedIdEntity {
    @Column(name = "practitioner_id", nullable = false) private UUID practitionerId;
    @Column(name = "credential_type", nullable = false, length = 80) private String credentialType;
    @Column(name = "reference_number", length = 160) private String referenceNumber;
    @Column(length = 500) private String source;
    @Column(name = "evidence_document_id") private UUID evidenceDocumentId;
    @Column(name = "issued_at") private Instant issuedAt;
    @Column(name = "expires_at") private Instant expiresAt;
    @Column(name = "verified_at") private Instant verifiedAt;
    @Column(name = "verified_by") private String verifiedBy;
    @Column(nullable = false, length = 40) private String status;
    @Column(name = "created_at", nullable = false) private Instant createdAt;

    protected PractitionerCredential() {}

    public PractitionerCredential(UUID id, UUID practitionerId, String credentialType, String referenceNumber, String source,
                                  UUID evidenceDocumentId, Instant issuedAt, Instant expiresAt, Instant now) {
        super(id);
        this.practitionerId = practitionerId; this.credentialType = credentialType; this.referenceNumber = referenceNumber;
        this.source = source; this.evidenceDocumentId = evidenceDocumentId; this.issuedAt = micros(issuedAt); this.expiresAt = micros(expiresAt);
        this.status = "UNDER_REVIEW"; this.createdAt = micros(now);
    }
}
