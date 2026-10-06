package com.rehletshifaa.journey.domain;

import com.rehletshifaa.shared.persistence.AssignedIdEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;
import org.hibernate.annotations.Immutable;

import java.time.Instant;
import java.util.UUID;

import static com.rehletshifaa.shared.persistence.SqlValues.micros;

/** The patient's decision on a released proposal version (at most one per version). */
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
}
