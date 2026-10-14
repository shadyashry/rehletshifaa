package com.rehletshifaa.journey.domain;

import com.rehletshifaa.casemanagement.domain.CaseUrgency;
import com.rehletshifaa.shared.crypto.EncryptedStringConverter;
import com.rehletshifaa.shared.persistence.AssignedIdEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Convert;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;
import org.hibernate.annotations.Immutable;

import java.time.Instant;
import java.util.UUID;

import static com.rehletshifaa.shared.persistence.SqlValues.micros;

/**
 * One change of a case's urgency (append-only). The case row carries the current level; this says who changed it, in
 * which stage and why. The reason is the coordinator's clinical judgement ("suspected bleed on the latest scan"), so it
 * is stored encrypted like patient PII and never copied into audit.
 */
@Entity
@Immutable
@Table(name = "case_urgency_changes")
public class CaseUrgencyChange extends AssignedIdEntity {
    @Column(name = "case_id", nullable = false) private UUID caseId;
    @Column(name = "from_urgency", nullable = false, length = 20) private String fromUrgency;
    @Column(name = "to_urgency", nullable = false, length = 20) private String toUrgency;
    @Convert(converter = EncryptedStringConverter.class) @Column(nullable = false, length = 2000) private String reason;
    @Column(nullable = false, length = 40) private String stage;
    @Column(name = "set_by", nullable = false) private String setBy;
    @Column(name = "set_by_role", nullable = false, length = 40) private String setByRole;
    @Column(name = "set_at", nullable = false) private Instant setAt;

    protected CaseUrgencyChange() {}

    public CaseUrgencyChange(UUID caseId, CaseUrgency from, CaseUrgency to, String reason, String stage, String setBy, String setByRole, Instant at) {
        super(UUID.randomUUID());
        this.caseId = caseId; this.fromUrgency = from.name(); this.toUrgency = to.name(); this.reason = reason; this.stage = stage;
        this.setBy = setBy; this.setByRole = setByRole; this.setAt = micros(at);
    }

    public UUID getCaseId() { return caseId; }
    public CaseUrgency getFromUrgency() { return CaseUrgency.valueOf(fromUrgency); }
    public CaseUrgency getToUrgency() { return CaseUrgency.valueOf(toUrgency); }
    public String getReason() { return reason; }
    public String getStage() { return stage; }
    public String getSetBy() { return setBy; }
    public String getSetByRole() { return setByRole; }
    public Instant getSetAt() { return setAt; }
}
