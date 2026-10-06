package com.rehletshifaa.clinic.domain;

import com.rehletshifaa.shared.persistence.AssignedIdEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;

import java.time.Instant;
import java.util.UUID;

import static com.rehletshifaa.shared.persistence.SqlValues.micros;

/**
 * A structured clinical capability decided by platform governance. One row per (consultant, type, code):
 * re-approving a revoked capability reuses it. {@code version} is managed explicitly.
 */
@Entity
@Table(name = "consultant_capabilities")
public class ConsultantCapability extends AssignedIdEntity {
    @Column(name = "practitioner_id", nullable = false) private UUID practitionerId;
    @Column(name = "capability_type", nullable = false, length = 30) private String capabilityType;
    @Column(name = "capability_code", nullable = false, length = 120) private String capabilityCode;
    @Column(nullable = false, length = 200) private String label;
    @Column(nullable = false, length = 20) private String status;
    @Column(name = "approved_by") private String approvedBy;
    @Column(name = "approved_at") private Instant approvedAt;
    @Column(name = "revoked_by") private String revokedBy;
    @Column(name = "revoked_at") private Instant revokedAt;
    @Column(nullable = false) private long version;

    protected ConsultantCapability() {}

    public static ConsultantCapability approved(UUID practitionerId, String type, String code, String label, String approvedBy, Instant at) {
        ConsultantCapability c = new ConsultantCapability(UUID.randomUUID());
        c.practitionerId = practitionerId; c.capabilityType = type; c.capabilityCode = code;
        c.label = label; c.status = "APPROVED"; c.approvedBy = approvedBy; c.approvedAt = micros(at);
        return c;
    }

    private ConsultantCapability(UUID id) { super(id); }

    /** Re-approves (or relabels) the capability, clearing any revocation. */
    public void approve(String label, String approvedBy, Instant at) {
        this.label = label; this.status = "APPROVED"; this.approvedBy = approvedBy; this.approvedAt = micros(at);
        this.revokedBy = null; this.revokedAt = null; this.version++;
    }

    public UUID getPractitionerId() { return practitionerId; }
    public String getCapabilityType() { return capabilityType; }
    public String getCapabilityCode() { return capabilityCode; }
    public String getLabel() { return label; }
    public String getStatus() { return status; }
    public Instant getApprovedAt() { return approvedAt; }
    public long getVersion() { return version; }
}
