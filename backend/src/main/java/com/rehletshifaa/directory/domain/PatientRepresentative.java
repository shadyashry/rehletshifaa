package com.rehletshifaa.directory.domain;

import com.rehletshifaa.shared.persistence.AssignedIdEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;

import java.time.Instant;
import java.util.UUID;

import static com.rehletshifaa.shared.persistence.SqlValues.micros;

/** A person acting for a patient with a bounded permission set, until revoked or expired. */
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

    protected PatientRepresentative() {}

    public PatientRepresentative(UUID patientId, String representativeSubject, String relationship, String permissions,
                                 Instant effectiveFrom, Instant expiresAt, Instant createdAt) {
        super(UUID.randomUUID());
        this.patientId = patientId; this.representativeSubject = representativeSubject; this.relationship = relationship;
        this.permissions = permissions; this.effectiveFrom = micros(effectiveFrom); this.expiresAt = micros(expiresAt); this.createdAt = micros(createdAt);
    }
}
