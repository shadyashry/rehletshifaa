package com.rehletshifaa.shared.persistence;

import jakarta.persistence.Id;
import jakarta.persistence.MappedSuperclass;

import java.util.Objects;
import java.util.UUID;

/** Base for entities whose UUID is minted by the application before the row exists (most tables here). */
@MappedSuperclass
public abstract class AssignedIdEntity extends PersistableEntity<UUID> {
    @Id
    private UUID id;

    protected AssignedIdEntity() {}

    protected AssignedIdEntity(UUID id) { this.id = Objects.requireNonNull(id, "id"); }

    @Override
    public UUID getId() { return id; }
}
