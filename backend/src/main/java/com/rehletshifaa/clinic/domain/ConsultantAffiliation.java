package com.rehletshifaa.clinic.domain;

import com.rehletshifaa.shared.crypto.EncryptedStringConverter;
import com.rehletshifaa.shared.persistence.AssignedIdEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Convert;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;

import java.util.UUID;

/**
 * One line of an {@link AffiliationDeclaration}: the Consultant's relationship of one kind with one facility. {@code NONE_DECLARED}
 * says the Consultant uses the facility and has no relationship with it; it is never combined with another kind for the same
 * facility. A financial interest says what it is (the note, encrypted: it may name a share or an amount).
 */
@Entity
@Table(name = "consultant_affiliations")
public class ConsultantAffiliation extends AssignedIdEntity {
    public enum Kind { PRIVILEGES, EMPLOYMENT, FINANCIAL_INTEREST, NONE_DECLARED }

    @Column(name = "declaration_id", nullable = false) private UUID declarationId;
    @Column(name = "practitioner_id", nullable = false) private UUID practitionerId;
    @Column(name = "facility_id", nullable = false) private UUID facilityId;
    @Column(nullable = false, length = 30) private String kind;
    @Convert(converter = EncryptedStringConverter.class) @Column(columnDefinition = "text") private String note;

    protected ConsultantAffiliation() {}

    public ConsultantAffiliation(UUID declarationId, UUID practitionerId, UUID facilityId, Kind kind, String note) {
        super(UUID.randomUUID());
        if (kind == Kind.FINANCIAL_INTEREST && (note == null || note.isBlank())) throw new IllegalArgumentException("A financial interest says what it is");
        this.declarationId = declarationId; this.practitionerId = practitionerId; this.facilityId = facilityId; this.kind = kind.name(); this.note = note;
    }

    public UUID getDeclarationId() { return declarationId; }
    public UUID getPractitionerId() { return practitionerId; }
    public UUID getFacilityId() { return facilityId; }
    public Kind getKind() { return Kind.valueOf(kind); }
    public String getNote() { return note; }
}
