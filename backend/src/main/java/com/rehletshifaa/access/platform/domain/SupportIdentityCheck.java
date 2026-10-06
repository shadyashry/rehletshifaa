package com.rehletshifaa.access.platform.domain;

import com.rehletshifaa.shared.persistence.AssignedIdEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;
import org.hibernate.annotations.Immutable;

import java.time.Instant;
import java.util.UUID;

import static com.rehletshifaa.shared.persistence.SqlValues.micros;

/** SUP-02: evidence that a support officer verified a caller before acting. Append-only. */
@Entity
@Immutable
@Table(name = "support_identity_checks")
public class SupportIdentityCheck extends AssignedIdEntity {
    @Column(nullable = false) private String subject;
    @Column(name = "performed_by", nullable = false) private String performedBy;
    @Column(nullable = false, length = 1000) private String checklist;
    @Column(nullable = false, length = 30) private String action;
    @Column(name = "performed_at", nullable = false) private Instant performedAt;

    protected SupportIdentityCheck() {}

    public SupportIdentityCheck(String subject, String performedBy, String checklist, String action, Instant performedAt) {
        super(UUID.randomUUID());
        this.subject = subject; this.performedBy = performedBy; this.checklist = checklist; this.action = action; this.performedAt = micros(performedAt);
    }
}
