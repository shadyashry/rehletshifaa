package com.rehletshifaa.coordination.domain;

import com.rehletshifaa.shared.persistence.AssignedIdEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;
import org.hibernate.annotations.Immutable;

import java.time.Instant;
import java.util.UUID;

import static com.rehletshifaa.shared.persistence.SqlValues.micros;

/**
 * Durable evidence of one routing decision: the command that asked for it and the full result (candidates, scores, path),
 * both as JSON. Unique per (case, actor, command key), which makes a repeated command a replay. Append-only.
 */
@Entity
@Immutable
@Table(name = "coordination_decisions")
public class CoordinationDecision extends AssignedIdEntity {
    @Column(name = "case_id", nullable = false) private UUID caseId;
    @Column(name = "actor_subject", nullable = false) private String actorSubject;
    @Column(name = "command_key", nullable = false, length = 150) private String commandKey;
    @Column(name = "request_data", nullable = false, columnDefinition = "text") private String requestData;
    @Column(name = "policy_id") private UUID policyId;
    @Column(name = "result_data", nullable = false, columnDefinition = "text") private String resultData;
    @Column(name = "created_at", nullable = false) private Instant createdAt;

    protected CoordinationDecision() {}

    public CoordinationDecision(UUID id, UUID caseId, String actorSubject, String commandKey, String requestData, UUID policyId,
                                String resultData, Instant evaluatedAt) {
        super(id);
        this.caseId = caseId; this.actorSubject = actorSubject; this.commandKey = commandKey; this.requestData = requestData;
        this.policyId = policyId; this.resultData = resultData; this.createdAt = micros(evaluatedAt);
    }
}
