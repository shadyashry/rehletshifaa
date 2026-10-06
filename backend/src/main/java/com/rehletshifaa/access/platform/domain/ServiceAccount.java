package com.rehletshifaa.access.platform.domain;

import com.rehletshifaa.shared.persistence.PersistableEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.Instant;

import static com.rehletshifaa.shared.persistence.SqlValues.micros;

/** IAM-17: a registered machine client with an accountable owner and tracked secret rotation. */
@Entity
@Table(name = "service_accounts")
public class ServiceAccount extends PersistableEntity<String> {
    @Id @Column(name = "client_id", length = 120) private String clientId;
    @Column(name = "owner_subject", nullable = false) private String ownerSubject;
    @Column(nullable = false, length = 500) private String purpose;
    @Column(nullable = false, length = 1000) private String scopes;
    @Column(name = "secret_rotated_at", nullable = false) private Instant secretRotatedAt;
    @Column(nullable = false, length = 20) private String status;
    @Column(name = "registered_by", nullable = false) private String registeredBy;
    @Column(name = "registered_at", nullable = false) private Instant registeredAt;
    @Column(nullable = false) private long revision;

    protected ServiceAccount() {}

    public ServiceAccount(String clientId, String ownerSubject, String purpose, String scopes, Instant secretRotatedAt,
                          String registeredBy, Instant registeredAt) {
        this.clientId = clientId; this.ownerSubject = ownerSubject; this.purpose = purpose; this.scopes = scopes;
        this.secretRotatedAt = micros(secretRotatedAt); this.status = "ACTIVE"; this.registeredBy = registeredBy; this.registeredAt = micros(registeredAt);
    }

    @Override public String getId() { return clientId; }
    public String getOwnerSubject() { return ownerSubject; }
    public String getPurpose() { return purpose; }
    public String getScopes() { return scopes; }
    public Instant getSecretRotatedAt() { return secretRotatedAt; }
    public String getStatus() { return status; }
    public long getRevision() { return revision; }
}
