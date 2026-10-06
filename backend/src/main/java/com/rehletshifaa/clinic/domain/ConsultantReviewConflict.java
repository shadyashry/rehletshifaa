package com.rehletshifaa.clinic.domain;

import com.rehletshifaa.shared.persistence.AssignedIdEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;
import org.hibernate.annotations.Immutable;

import java.time.Instant;
import java.util.UUID;

import static com.rehletshifaa.shared.persistence.SqlValues.micros;

/**
 * A person who may not decide a review (the consultant, or their Operations owner at the time), captured when the
 * review opens so a later ownership change cannot make them eligible. Append-only.
 */
@Entity
@Immutable
@Table(name = "consultant_review_conflicts")
public class ConsultantReviewConflict extends AssignedIdEntity {
    @Column(name = "practitioner_id", nullable = false) private UUID practitionerId;
    @Column(name = "review_kind", nullable = false, length = 30) private String reviewKind;
    @Column(name = "review_reference", nullable = false) private UUID reviewReference;
    @Column(name = "conflict_subject", nullable = false) private String conflictSubject;
    @Column(name = "conflict_source", nullable = false, length = 30) private String conflictSource;
    @Column(name = "recorded_at", nullable = false) private Instant recordedAt;

    protected ConsultantReviewConflict() {}

    public ConsultantReviewConflict(UUID practitionerId, String reviewKind, UUID reviewReference, String conflictSubject,
                                    String conflictSource, Instant recordedAt) {
        super(UUID.randomUUID());
        this.practitionerId = practitionerId; this.reviewKind = reviewKind; this.reviewReference = reviewReference;
        this.conflictSubject = conflictSubject; this.conflictSource = conflictSource; this.recordedAt = micros(recordedAt);
    }
}
