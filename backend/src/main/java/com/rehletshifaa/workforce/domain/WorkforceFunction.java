package com.rehletshifaa.workforce.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.Instant;

/**
 * A workforce function (reference data owned by migrations; no mutators). Its row is also the per-function hierarchy
 * lock, which is why it is not {@code @Immutable}: Hibernate refuses a pessimistic lock on an immutable entity.
 */
@Entity
@Table(name = "workforce_functions")
public class WorkforceFunction {
    @Id @Column(name = "function_key", length = 50) private String key;
    @Column(name = "display_name", nullable = false, length = 160) private String displayName;
    @Column(nullable = false) private boolean active;
    @Column(name = "created_at", nullable = false) private Instant createdAt;

    protected WorkforceFunction() {}

    public String getKey() { return key; }
    public String getDisplayName() { return displayName; }
}
