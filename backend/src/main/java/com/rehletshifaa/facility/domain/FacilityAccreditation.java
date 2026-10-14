package com.rehletshifaa.facility.domain;

import com.rehletshifaa.shared.persistence.AssignedIdEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;

import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

import static com.rehletshifaa.shared.persistence.SqlValues.micros;

/**
 * One accreditation a facility holds (JCI, GAHAR, ISO 9001, ...) with its expiry date. CURRENT becomes EXPIRED by the
 * expiry job once {@code expiresOn} has passed; WITHDRAWN is Consultant Operations ending it early. Mirrors the
 * consultant credential (C-05).
 */
@Entity
@Table(name = "facility_accreditations")
public class FacilityAccreditation extends AssignedIdEntity {
    public enum Status { CURRENT, EXPIRED, WITHDRAWN }

    @Column(name = "facility_id", nullable = false) private UUID facilityId;
    @Column(nullable = false, length = 80) private String body;
    @Column(name = "reference_number", length = 160) private String referenceNumber;
    @Column(name = "issued_on") private LocalDate issuedOn;
    @Column(name = "expires_on", nullable = false) private LocalDate expiresOn;
    @Column(nullable = false, length = 20) private String status;
    @Column(name = "recorded_by", nullable = false, length = 120) private String recordedBy;
    @Column(name = "created_at", nullable = false) private Instant createdAt;
    @Column(name = "withdrawn_by", length = 120) private String withdrawnBy;
    @Column(name = "withdrawn_at") private Instant withdrawnAt;

    protected FacilityAccreditation() {}

    public FacilityAccreditation(UUID id, UUID facilityId, String body, String referenceNumber, LocalDate issuedOn, LocalDate expiresOn,
                                 String actor, Instant now) {
        super(id);
        this.facilityId = facilityId; this.body = body; this.referenceNumber = referenceNumber; this.issuedOn = issuedOn;
        this.expiresOn = expiresOn; this.status = Status.CURRENT.name(); this.recordedBy = actor; this.createdAt = micros(now);
    }

    public void withdraw(String actor, Instant now) {
        this.status = Status.WITHDRAWN.name(); this.withdrawnBy = actor; this.withdrawnAt = micros(now);
    }

    /** The expiry job's single-row path; the bulk path is the repository's update query. */
    public void expire() { this.status = Status.EXPIRED.name(); }

    public UUID getFacilityId() { return facilityId; }
    public String getBody() { return body; }
    public String getReferenceNumber() { return referenceNumber; }
    public LocalDate getIssuedOn() { return issuedOn; }
    public LocalDate getExpiresOn() { return expiresOn; }
    public Status getStatus() { return Status.valueOf(status); }
    public String getRecordedBy() { return recordedBy; }
    public Instant getCreatedAt() { return createdAt; }
    public String getWithdrawnBy() { return withdrawnBy; }
    public Instant getWithdrawnAt() { return withdrawnAt; }
}
