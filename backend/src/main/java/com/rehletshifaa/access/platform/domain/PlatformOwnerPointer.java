package com.rehletshifaa.access.platform.domain;

import com.rehletshifaa.shared.persistence.PersistableEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.util.UUID;

/** Singleton (id=1) pointer to the current owner relationship; at most one owner exists at any time. */
@Entity
@Table(name = "platform_account_owner_current")
public class PlatformOwnerPointer extends PersistableEntity<Integer> {
    public static final int ID = 1;

    @Id private Integer id;
    @Column(name = "relationship_id", nullable = false, unique = true) private UUID relationshipId;

    protected PlatformOwnerPointer() {}

    public PlatformOwnerPointer(UUID relationshipId) { this.id = ID; this.relationshipId = relationshipId; }

    /** Moves the pointer only from the relationship the caller saw; returns false if it moved meanwhile. */
    public boolean move(UUID from, UUID to) {
        if (!relationshipId.equals(from)) return false;
        relationshipId = to;
        return true;
    }

    @Override public Integer getId() { return id; }
    public UUID getRelationshipId() { return relationshipId; }
}
