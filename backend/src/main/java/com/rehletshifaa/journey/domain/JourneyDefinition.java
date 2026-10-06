package com.rehletshifaa.journey.domain;

import com.rehletshifaa.shared.persistence.AssignedIdEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;

import java.time.Instant;
import java.util.UUID;

import static com.rehletshifaa.shared.persistence.SqlValues.micros;

/** The stored journey definition (the canonical International Care Journey). The API shape is {@link JourneyModel.Definition}. */
@Entity
@Table(name = "journey_definitions")
public class JourneyDefinition extends AssignedIdEntity {
    @Column(name = "journey_key", nullable = false, unique = true, length = 60) private String journeyKey;
    @Column(name = "display_name", nullable = false, length = 120) private String displayName;
    @Column(name = "created_at", nullable = false) private Instant createdAt;

    protected JourneyDefinition() {}

    public JourneyDefinition(UUID id, String journeyKey, String displayName, Instant now) {
        super(id);
        this.journeyKey = journeyKey; this.displayName = displayName; this.createdAt = micros(now);
    }

    public JourneyModel.Definition toModel() { return new JourneyModel.Definition(getId(), journeyKey, displayName, createdAt); }
}
