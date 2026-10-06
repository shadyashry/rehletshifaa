package com.rehletshifaa.access.platform.domain;

import com.rehletshifaa.shared.persistence.PersistableEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import org.hibernate.annotations.Immutable;

import java.time.Instant;
import java.util.UUID;

import static com.rehletshifaa.shared.persistence.SqlValues.micros;

/** The single decision on a privileged change request (keyed by the request). Append-only. */
@Entity
@Immutable
@Table(name = "privileged_access_change_decisions")
public class PrivilegedAccessChangeDecision extends PersistableEntity<UUID> {
    @Id @Column(name = "request_id") private UUID requestId;
    @Column(nullable = false, length = 20) private String decision;
    @Column(name = "decided_by", nullable = false) private String decidedBy;
    @Column(nullable = false, length = 1000) private String reason;
    @Column(name = "decided_at", nullable = false) private Instant decidedAt;

    protected PrivilegedAccessChangeDecision() {}

    public PrivilegedAccessChangeDecision(UUID requestId, String decision, String decidedBy, String reason, Instant decidedAt) {
        this.requestId = requestId; this.decision = decision; this.decidedBy = decidedBy; this.reason = reason; this.decidedAt = micros(decidedAt);
    }

    @Override public UUID getId() { return requestId; }
}
