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
 * A patient's request that their coordinator go through a proposal's deposit, refund and cancellation terms with them in
 * Arabic and record their decision (at most one per proposal version). Made from the portal or the secure link.
 */
@Entity
@Immutable
@Table(name = "proposal_assistance_requests")
public class ProposalAssistanceRequest extends AssignedIdEntity {
    @Column(name = "proposal_version_id", nullable = false, unique = true) private UUID proposalVersionId;
    @Column(name = "case_id", nullable = false) private UUID caseId;
    @Column(name = "requested_by", nullable = false) private String requestedBy;
    @Column(name = "request_channel", nullable = false, length = 20) private String requestChannel;
    @Column(name = "requested_at", nullable = false) private Instant requestedAt;

    protected ProposalAssistanceRequest() {}

    public ProposalAssistanceRequest(UUID id, UUID proposalVersionId, UUID caseId, String requestedBy, String requestChannel, Instant now) {
        super(id);
        this.proposalVersionId = proposalVersionId; this.caseId = caseId; this.requestedBy = requestedBy;
        this.requestChannel = requestChannel; this.requestedAt = micros(now);
    }

    public UUID getProposalVersionId() { return proposalVersionId; }
    public Instant getRequestedAt() { return requestedAt; }
}
