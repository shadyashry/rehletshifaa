package com.rehletshifaa.clinic.domain;

import com.rehletshifaa.shared.persistence.AssignedIdEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;

import java.time.Instant;
import java.util.UUID;

import static com.rehletshifaa.shared.persistence.SqlValues.micros;

/**
 * A case reserved at a facility its Consultant had not declared (P1-19, design §7.2, architecture §5.7): {@code UNDECLARED_FACILITY}.
 * The reservation went ahead (care is never blocked on paperwork); the flag makes it visible to Compliance. A later declaration
 * naming the facility clears it, and the row stays as the record that the facility was used before it was declared.
 */
@Entity
@Table(name = "affiliation_flags")
public class AffiliationFlag extends AssignedIdEntity {
    public static final String UNDECLARED_FACILITY = "UNDECLARED_FACILITY";

    @Column(name = "case_id", nullable = false) private UUID caseId;
    @Column(name = "practitioner_id", nullable = false) private UUID practitionerId;
    @Column(name = "facility_id", nullable = false) private UUID facilityId;
    @Column(nullable = false, length = 30) private String code;
    @Column(name = "raised_at", nullable = false) private Instant raisedAt;
    @Column(name = "cleared_at") private Instant clearedAt;
    @Column(name = "cleared_by_declaration_id") private UUID clearedByDeclarationId;

    protected AffiliationFlag() {}

    public AffiliationFlag(UUID caseId, UUID practitionerId, UUID facilityId, Instant now) {
        super(UUID.randomUUID());
        this.caseId = caseId; this.practitionerId = practitionerId; this.facilityId = facilityId; this.code = UNDECLARED_FACILITY; this.raisedAt = micros(now);
    }

    public void clear(UUID declarationId, Instant at) { clearedByDeclarationId = declarationId; clearedAt = micros(at); }

    public UUID getCaseId() { return caseId; }
    public UUID getPractitionerId() { return practitionerId; }
    public UUID getFacilityId() { return facilityId; }
    public String getCode() { return code; }
    public Instant getRaisedAt() { return raisedAt; }
    public Instant getClearedAt() { return clearedAt; }
    public UUID getClearedByDeclarationId() { return clearedByDeclarationId; }
}
