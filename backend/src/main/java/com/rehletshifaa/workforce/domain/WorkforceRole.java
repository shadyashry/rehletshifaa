package com.rehletshifaa.workforce.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import org.hibernate.annotations.Immutable;

import java.time.Instant;

/** A business role in the WF-02 catalogue (reference data owned by migrations). */
@Entity
@Immutable
@Table(name = "workforce_role_catalogue")
public class WorkforceRole {
    @Id @Column(name = "role_key", length = 80) private String key;
    @Column(name = "display_name", nullable = false, length = 160) private String displayName;
    @Column(name = "function_key", nullable = false, length = 50) private String functionKey;
    @Column(nullable = false) private boolean active;
    @Column(name = "created_at", nullable = false) private Instant createdAt;

    protected WorkforceRole() {}

    public String getKey() { return key; }
    public String getDisplayName() { return displayName; }
    public String getFunctionKey() { return functionKey; }
}
