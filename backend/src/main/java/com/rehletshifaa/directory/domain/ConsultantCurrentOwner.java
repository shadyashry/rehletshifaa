package com.rehletshifaa.directory.domain;

import com.rehletshifaa.shared.persistence.PersistableEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.util.UUID;

/** Current pointer: at most one Consultant Operations owner per consultant. */
@Entity
@Table(name = "consultant_current_operations_owners")
public class ConsultantCurrentOwner extends PersistableEntity<UUID> {
    @Id @Column(name = "practitioner_id") private UUID practitionerId;
    @Column(name = "ownership_id", nullable = false) private UUID ownershipId;
    @Column(name = "owner_subject", nullable = false) private String ownerSubject;

    protected ConsultantCurrentOwner() {}

    public ConsultantCurrentOwner(UUID practitionerId, UUID ownershipId, String ownerSubject) {
        this.practitionerId = practitionerId; this.ownershipId = ownershipId; this.ownerSubject = ownerSubject;
    }

    @Override public UUID getId() { return practitionerId; }
    public UUID getOwnershipId() { return ownershipId; }
    public String getOwnerSubject() { return ownerSubject; }
}
