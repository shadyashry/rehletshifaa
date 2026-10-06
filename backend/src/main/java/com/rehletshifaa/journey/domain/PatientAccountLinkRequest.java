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
 * A request to the owner of an existing account to confirm (or refuse) a link to this patient. One live request per
 * (patient, email): a repeat rotates its token. Only the token hash is stored.
 */
@Entity
@DynamicUpdate
@Table(name = "patient_account_link_requests")
public class PatientAccountLinkRequest extends AssignedIdEntity {
    @Column(name = "patient_id", nullable = false) private UUID patientId;
    @Column(name = "case_id", nullable = false) private UUID caseId;
    @Column(nullable = false, length = 254) private String email;
    @Column(nullable = false, length = 20) private String origin;
    @Column(name = "token_hash", nullable = false, length = 128) private String tokenHash;
    @Column(name = "expires_at", nullable = false) private Instant expiresAt;
    @Column(name = "consumed_at") private Instant consumedAt;
    @Column(name = "resolved_subject") private String resolvedSubject;
    @Column(length = 20) private String resolution;
    @Column(length = 40) private String relationship;
    @Column(name = "created_at", nullable = false) private Instant createdAt;
    @Column(name = "updated_at", nullable = false) private Instant updatedAt;

    protected PatientAccountLinkRequest() {}

    public PatientAccountLinkRequest(UUID patientId, UUID caseId, String email, String origin, String tokenHash, Instant expiresAt, Instant now) {
        super(UUID.randomUUID());
        this.patientId = patientId; this.caseId = caseId; this.email = email; this.origin = origin; this.tokenHash = tokenHash;
        this.expiresAt = micros(expiresAt); this.createdAt = micros(now); this.updatedAt = micros(now);
    }
}
