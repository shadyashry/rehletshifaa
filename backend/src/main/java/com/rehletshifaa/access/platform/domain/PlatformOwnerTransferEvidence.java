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

/** Evidence rows of an owner transfer, one per request and step. Append-only. */
public final class PlatformOwnerTransferEvidence {
    private PlatformOwnerTransferEvidence() {}

    /** The incoming owner's acceptance, made with phishing-resistant authentication. */
    @Entity(name = "PlatformOwnerTransferAcceptance")
    @Immutable
    @Table(name = "platform_owner_transfer_acceptances")
    public static class Acceptance extends PersistableEntity<UUID> {
        @Id @Column(name = "request_id") private UUID requestId;
        @Column(name = "accepted_by", nullable = false) private String acceptedBy;
        @Column(nullable = false, length = 1000) private String reason;
        @Column(name = "accepted_at", nullable = false) private Instant acceptedAt;
        @Column(name = "phishing_resistant_authentication", nullable = false) private boolean phishingResistantAuthentication;

        protected Acceptance() {}

        public Acceptance(UUID requestId, String acceptedBy, String reason, Instant acceptedAt) {
            this.requestId = requestId; this.acceptedBy = acceptedBy; this.reason = reason; this.acceptedAt = micros(acceptedAt);
            this.phishingResistantAuthentication = true;
        }

        @Override public UUID getId() { return requestId; }
        public String getAcceptedBy() { return acceptedBy; }
    }

    /** The independent administrator's verification that completed the transfer. */
    @Entity(name = "PlatformOwnerTransferVerification")
    @Immutable
    @Table(name = "platform_owner_transfer_verifications")
    public static class Verification extends PersistableEntity<UUID> {
        @Id @Column(name = "request_id") private UUID requestId;
        @Column(name = "verified_by", nullable = false) private String verifiedBy;
        @Column(nullable = false, length = 1000) private String reason;
        @Column(name = "verified_at", nullable = false) private Instant verifiedAt;

        protected Verification() {}

        public Verification(UUID requestId, String verifiedBy, String reason, Instant verifiedAt) {
            this.requestId = requestId; this.verifiedBy = verifiedBy; this.reason = reason; this.verifiedAt = micros(verifiedAt);
        }

        @Override public UUID getId() { return requestId; }
    }
}
