package com.rehletshifaa.journey.domain;

import com.rehletshifaa.shared.persistence.AssignedIdEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;
import org.hibernate.annotations.Immutable;

import java.time.Instant;
import java.util.UUID;

import static com.rehletshifaa.shared.persistence.SqlValues.micros;

/**
 * The patient's decision on a released proposal version (at most one per version). Usually the patient's own, on the
 * page; on the Arabic assisted path a coordinator records it after going through the terms with the patient
 * ({@code RECORDED_ON_BEHALF}), and the row keeps who recorded it, how and when the conversation took place.
 */
@Entity
@Immutable
@Table(name = "proposal_decisions")
public class ProposalDecision extends AssignedIdEntity {
    @Column(name = "proposal_version_id", nullable = false, unique = true) private UUID proposalVersionId;
    @Column(name = "patient_subject", nullable = false) private String patientSubject;
    @Column(nullable = false, length = 30) private String decision;
    @Column(name = "selected_optional_item_ids", columnDefinition = "text") private String selectedOptionalItemIds;
    @Column(columnDefinition = "text") private String comment;
    @Column(name = "reauthenticated_at", nullable = false) private Instant reauthenticatedAt;
    @Column(name = "created_at", nullable = false) private Instant createdAt;
    @Column private Boolean acknowledged;
    @Column(name = "acknowledged_at") private Instant acknowledgedAt;
    @Column(name = "acknowledgement_version", length = 40) private String acknowledgementVersion;
    @Column(name = "decision_source", nullable = false, length = 30) private String decisionSource = SOURCE_PATIENT;
    @Column(name = "recorded_by") private String recordedBy;
    @Column(name = "decision_channel", length = 20) private String decisionChannel;
    @Column(name = "confirmed_by", length = 20) private String confirmedBy;
    @Column(name = "conversation_at") private Instant conversationAt;
    @Column(name = "terms_language", length = 8) private String termsLanguage;

    public static final String SOURCE_PATIENT = "PATIENT_SELF";
    public static final String SOURCE_RECORDED = "RECORDED_ON_BEHALF";

    protected ProposalDecision() {}

    public ProposalDecision(UUID id, UUID proposalVersionId, String patientSubject, String decision, String selectedOptionalItemIds,
                            String comment, Instant reauthenticatedAt, Instant now) {
        super(id);
        this.proposalVersionId = proposalVersionId; this.patientSubject = patientSubject; this.decision = decision;
        this.selectedOptionalItemIds = selectedOptionalItemIds; this.comment = comment; this.reauthenticatedAt = micros(reauthenticatedAt);
        this.createdAt = micros(now);
    }

    /** Records the patient's acknowledgement of the terms (secure-link decisions). */
    public ProposalDecision acknowledged(boolean acknowledged, Instant at, String version) {
        this.acknowledged = acknowledged; this.acknowledgedAt = micros(at); this.acknowledgementVersion = version;
        return this;
    }

    /** Marks the decision as recorded by staff for the patient, after an assisted conversation in {@code termsLanguage}. */
    public ProposalDecision recordedOnBehalf(String recordedBy, String channel, String confirmedBy, Instant conversationAt, String termsLanguage) {
        this.decisionSource = SOURCE_RECORDED; this.recordedBy = recordedBy; this.decisionChannel = channel;
        this.confirmedBy = confirmedBy; this.conversationAt = micros(conversationAt); this.termsLanguage = termsLanguage;
        return this;
    }

    public UUID getProposalVersionId() { return proposalVersionId; }
    public String getDecision() { return decision; }
    public Instant getCreatedAt() { return createdAt; }
    public String getDecisionSource() { return decisionSource; }
    public String getRecordedBy() { return recordedBy; }
    public String getDecisionChannel() { return decisionChannel; }
    public String getConfirmedBy() { return confirmedBy; }
    public Instant getConversationAt() { return conversationAt; }
}
