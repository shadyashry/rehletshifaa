package com.rehletshifaa.clinic.domain;

import com.rehletshifaa.shared.crypto.EncryptedStringConverter;
import com.rehletshifaa.shared.persistence.AssignedIdEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Convert;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;

import java.time.Instant;
import java.time.ZoneOffset;
import java.util.UUID;

import static com.rehletshifaa.shared.persistence.SqlValues.micros;

/**
 * A Consultant's yearly declaration of their relationship with the facilities they use (P1-19, design §7.2, decision D-H). The
 * Consultant files it themselves with an attestation that it is complete and true; it holds for a year from filing and is replaced
 * by the next one. A current declaration ({@link #isCurrent}) is a condition of eligibility for new cases
 * ({@code ConsultantEligibilityRepository#ELIGIBLE}); Compliance's review afterwards ({@code CLEARED} or {@code FINDING} with a
 * note) is the audit of what was declared and never blocks care. The lines are {@link ConsultantAffiliation} rows.
 */
@Entity
@Table(name = "affiliation_declarations")
public class AffiliationDeclaration extends AssignedIdEntity {
    public enum ReviewStatus { PENDING, CLEARED, FINDING }

    @Column(name = "practitioner_id", nullable = false) private UUID practitionerId;
    @Column(name = "declared_by", nullable = false) private String declaredBy;
    @Column(name = "declared_at", nullable = false) private Instant declaredAt;
    @Column(name = "valid_until", nullable = false) private Instant validUntil;
    @Column(name = "attestation_version", nullable = false, length = 40) private String attestationVersion;
    @Column(name = "superseded_at") private Instant supersededAt;
    @Column(name = "reminded_at") private Instant remindedAt;
    @Column(name = "review_status", nullable = false, length = 20) private String reviewStatus;
    @Column(name = "reviewed_by") private String reviewedBy;
    @Column(name = "reviewed_at") private Instant reviewedAt;
    @Convert(converter = EncryptedStringConverter.class) @Column(name = "review_note", columnDefinition = "text") private String reviewNote;
    @Column(nullable = false) private long version;

    protected AffiliationDeclaration() {}

    /** Filed now; it holds for one calendar year (UTC) from now. */
    public AffiliationDeclaration(UUID practitionerId, String declaredBy, String attestationVersion, Instant now) {
        super(UUID.randomUUID());
        this.practitionerId = practitionerId; this.declaredBy = declaredBy; this.attestationVersion = attestationVersion;
        this.declaredAt = micros(now); this.validUntil = micros(now.atOffset(ZoneOffset.UTC).plusYears(1).toInstant());
        this.reviewStatus = ReviewStatus.PENDING.name();
    }

    public boolean isCurrent(Instant now) { return supersededAt == null && validUntil.isAfter(now); }

    /** A newer declaration replaced this one. */
    public void supersede(Instant at) { supersededAt = micros(at); version++; }

    /** The renewal reminder went out (once per declaration). */
    public void reminded(Instant at) { remindedAt = micros(at); version++; }

    /** Compliance's review: CLEARED, or a FINDING with what was found. Final once recorded. */
    public void review(ReviewStatus outcome, String note, String reviewer, Instant at) {
        if (outcome == ReviewStatus.PENDING) throw new IllegalArgumentException("A review records CLEARED or FINDING");
        if (getReviewStatus() != ReviewStatus.PENDING) throw new IllegalStateException("This declaration is already reviewed");
        reviewStatus = outcome.name(); reviewNote = note; reviewedBy = reviewer; reviewedAt = micros(at); version++;
    }

    public UUID getPractitionerId() { return practitionerId; }
    public String getDeclaredBy() { return declaredBy; }
    public Instant getDeclaredAt() { return declaredAt; }
    public Instant getValidUntil() { return validUntil; }
    public String getAttestationVersion() { return attestationVersion; }
    public Instant getSupersededAt() { return supersededAt; }
    public Instant getRemindedAt() { return remindedAt; }
    public ReviewStatus getReviewStatus() { return ReviewStatus.valueOf(reviewStatus); }
    public String getReviewedBy() { return reviewedBy; }
    public Instant getReviewedAt() { return reviewedAt; }
    public String getReviewNote() { return reviewNote; }
    public long getVersion() { return version; }
}
