package com.rehletshifaa.journey.domain;

import com.rehletshifaa.shared.persistence.AssignedIdEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;
import org.hibernate.annotations.DynamicUpdate;

import java.time.Instant;
import java.util.UUID;

import static com.rehletshifaa.shared.persistence.SqlValues.micros;

/**
 * A consultant's request for a transfer or a second opinion. The coordinator routes or declines it, the receiving
 * consultant accepts or declines; each step is a guarded update in {@code ConsultantReferralRepository}.
 * The clinical reason and the opinion are stored encrypted by the caller.
 */
@Entity
@DynamicUpdate
@Table(name = "consultant_referrals")
public class ConsultantReferral extends AssignedIdEntity {
    @Column(name = "case_id", nullable = false) private UUID caseId;
    @Column(name = "referral_type", nullable = false, length = 20) private String referralType;
    @Column(nullable = false, length = 30) private String status;
    @Column(name = "from_subject", nullable = false) private String fromSubject;
    @Column(name = "from_practitioner_id", nullable = false) private UUID fromPractitionerId;
    @Column(name = "source_assignment_id", nullable = false) private UUID sourceAssignmentId;
    @Column(name = "clinical_reason_encrypted", nullable = false, columnDefinition = "text") private String clinicalReasonEncrypted;
    @Column(name = "suggested_care_category", length = 60) private String suggestedCareCategory;
    @Column(name = "suggested_capability", length = 200) private String suggestedCapability;
    @Column(name = "suggested_practitioner_id") private UUID suggestedPractitionerId;
    @Column(name = "target_care_category", length = 60) private String targetCareCategory;
    @Column(name = "target_practitioner_id") private UUID targetPractitionerId;
    @Column(name = "target_assignment_id") private UUID targetAssignmentId;
    @Column(name = "coordinator_subject") private String coordinatorSubject;
    @Column(name = "coordinator_note", length = 500) private String coordinatorNote;
    @Column(name = "coordinator_decided_at") private Instant coordinatorDecidedAt;
    @Column(name = "receiver_reason", length = 500) private String receiverReason;
    @Column(name = "receiver_decided_at") private Instant receiverDecidedAt;
    @Column(name = "opinion_encrypted", columnDefinition = "text") private String opinionEncrypted;
    @Column(name = "opinion_submitted_at") private Instant opinionSubmittedAt;
    @Column(name = "created_at", nullable = false) private Instant createdAt;
    @Column(name = "updated_at", nullable = false) private Instant updatedAt;
    @Column(nullable = false) private long version;

    protected ConsultantReferral() {}

    /** A new referral, waiting for the coordinator. */
    public ConsultantReferral(UUID id, UUID caseId, String referralType, String fromSubject, UUID fromPractitionerId, UUID sourceAssignmentId,
                              String clinicalReasonEncrypted, String suggestedCareCategory, String suggestedCapability,
                              UUID suggestedPractitionerId, Instant now) {
        super(id);
        this.caseId = caseId; this.referralType = referralType; this.status = "AWAITING_COORDINATOR"; this.fromSubject = fromSubject;
        this.fromPractitionerId = fromPractitionerId; this.sourceAssignmentId = sourceAssignmentId;
        this.clinicalReasonEncrypted = clinicalReasonEncrypted; this.suggestedCareCategory = suggestedCareCategory;
        this.suggestedCapability = suggestedCapability; this.suggestedPractitionerId = suggestedPractitionerId;
        this.createdAt = micros(now); this.updatedAt = micros(now);
    }
}
