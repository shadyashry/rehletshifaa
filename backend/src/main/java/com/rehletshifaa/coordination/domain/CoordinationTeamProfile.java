package com.rehletshifaa.coordination.domain;

import com.rehletshifaa.shared.persistence.PersistableEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.Instant;
import java.util.UUID;

import static com.rehletshifaa.shared.persistence.SqlValues.micros;

/**
 * The routing profile of a care-coordination team: the care areas and languages it serves (comma-separated; empty means
 * every value) and its fallback team. Edits are guarded by {@code revision} in {@code CoordinationTeamProfileRepository}.
 */
@Entity
@Table(name = "coordination_team_profiles")
public class CoordinationTeamProfile extends PersistableEntity<UUID> {
    @Id @Column(name = "team_id") private UUID teamId;
    @Column(name = "care_areas", nullable = false, length = 1000) private String careAreas;
    @Column(nullable = false, length = 500) private String languages;
    @Column(name = "fallback_team_id") private UUID fallbackTeamId;
    @Column(name = "updated_by", nullable = false) private String updatedBy;
    @Column(name = "updated_at", nullable = false) private Instant updatedAt;
    @Column(nullable = false) private long revision;

    protected CoordinationTeamProfile() {}

    public CoordinationTeamProfile(UUID teamId, String careAreas, String languages, UUID fallbackTeamId, String updatedBy, Instant now) {
        this.teamId = teamId; this.careAreas = careAreas; this.languages = languages; this.fallbackTeamId = fallbackTeamId;
        this.updatedBy = updatedBy; this.updatedAt = micros(now);
    }

    @Override public UUID getId() { return teamId; }
}
