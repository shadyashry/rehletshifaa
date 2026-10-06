package com.rehletshifaa.workforce.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.IdClass;
import jakarta.persistence.Table;
import org.hibernate.annotations.Immutable;

import java.io.Serializable;

/** SOD-04 rule: holding {@code roleKey} conflicts with {@code conflictingRoleKey}. Stored in both directions; migration-owned. */
@Entity
@Immutable
@IdClass(WorkforceRoleConflict.Key.class)
@Table(name = "workforce_role_conflicts")
public class WorkforceRoleConflict {
    @Id @Column(name = "role_key", length = 80) private String roleKey;
    @Id @Column(name = "conflicting_role_key", length = 80) private String conflictingRoleKey;
    @Column(name = "rule_reason", nullable = false, length = 300) private String ruleReason;

    public record Key(String roleKey, String conflictingRoleKey) implements Serializable {}

    protected WorkforceRoleConflict() {}

    public String getRoleKey() { return roleKey; }
    public String getConflictingRoleKey() { return conflictingRoleKey; }
    public String getRuleReason() { return ruleReason; }
}
