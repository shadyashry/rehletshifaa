package com.rehletshifaa.coordination.domain;

import com.rehletshifaa.shared.persistence.AssignedIdEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;
import org.hibernate.annotations.Immutable;

import java.time.Instant;
import java.util.UUID;

import static com.rehletshifaa.shared.persistence.SqlValues.micros;

/** One published version of a Consultant's coordinator preference (person, team, fallback team) for a period. Never edited. */
@Entity
@Immutable
@Table(name = "consultant_routing_preferences")
public class ConsultantRoutingPreference extends AssignedIdEntity {
    @Column(name = "consultant_id", nullable = false) private UUID consultantId;
    @Column(name = "version_number", nullable = false) private int versionNumber;
    @Column(name = "effective_from", nullable = false) private Instant effectiveFrom;
    @Column(name = "effective_to") private Instant effectiveTo;
    @Column(name = "coordinator_subject") private String coordinatorSubject;
    @Column(name = "team_id") private UUID teamId;
    @Column(name = "fallback_team_id") private UUID fallbackTeamId;
    @Column(name = "created_by", nullable = false) private String createdBy;
    @Column(name = "created_at", nullable = false) private Instant createdAt;

    protected ConsultantRoutingPreference() {}

    /** Who the Consultant prefers, and when. */
    public record Choice(String coordinatorSubject, UUID teamId, UUID fallbackTeamId) {}

    public ConsultantRoutingPreference(UUID id, UUID consultantId, int versionNumber, Instant effectiveFrom, Instant effectiveTo, Choice choice,
                                       String createdBy, Instant now) {
        super(id);
        this.consultantId = consultantId; this.versionNumber = versionNumber; this.effectiveFrom = micros(effectiveFrom);
        this.effectiveTo = micros(effectiveTo); this.coordinatorSubject = choice.coordinatorSubject(); this.teamId = choice.teamId();
        this.fallbackTeamId = choice.fallbackTeamId(); this.createdBy = createdBy; this.createdAt = micros(now);
    }
}
