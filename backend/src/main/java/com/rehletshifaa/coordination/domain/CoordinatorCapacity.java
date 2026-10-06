package com.rehletshifaa.coordination.domain;

import com.rehletshifaa.shared.persistence.PersistableEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.Instant;

import static com.rehletshifaa.shared.persistence.SqlValues.micros;

/**
 * A Coordinator's routing capacity: how many active cases they take, whether they are on duty, and the languages and care
 * areas they cover (comma-separated; empty means every value). Edits are guarded by {@code revision}.
 */
@Entity
@Table(name = "coordinator_capacity")
public class CoordinatorCapacity extends PersistableEntity<String> {
    @Id private String subject;
    @Column(nullable = false) private int maximum;
    @Column(name = "on_duty", nullable = false) private boolean onDuty;
    @Column(nullable = false, length = 500) private String languages;
    @Column(name = "care_areas", nullable = false, length = 1000) private String careAreas;
    @Column(name = "updated_by", nullable = false) private String updatedBy;
    @Column(name = "updated_at", nullable = false) private Instant updatedAt;
    @Column(nullable = false) private long revision;

    protected CoordinatorCapacity() {}

    public CoordinatorCapacity(String subject, int maximum, boolean onDuty, String languages, String careAreas, String updatedBy, Instant now) {
        this.subject = subject; this.maximum = maximum; this.onDuty = onDuty; this.languages = languages; this.careAreas = careAreas;
        this.updatedBy = updatedBy; this.updatedAt = micros(now);
    }

    @Override public String getId() { return subject; }
}
