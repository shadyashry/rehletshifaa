package com.rehletshifaa.shared.persistence;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

/**
 * The single row that serializes platform-governance changes (invitations, role grants, administrator decisions,
 * identity attachment, reconciliation). It carries no data; holding its row lock is the point.
 */
@Entity
@Table(name = "platform_governance_lock")
public class PlatformGovernanceLock {
    static final int ID = 1;

    @Id private Integer id;
    @Column(nullable = false) private long revision;

    protected PlatformGovernanceLock() {}
}
