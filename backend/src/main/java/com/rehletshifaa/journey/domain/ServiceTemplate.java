package com.rehletshifaa.journey.domain;

import com.rehletshifaa.shared.persistence.AssignedIdEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;

import java.time.Instant;

import static com.rehletshifaa.shared.persistence.SqlValues.micros;

/** The price-list template of one care area (one per care area); consultant price lists are derived from it. */
@Entity
@Table(name = "service_templates")
public class ServiceTemplate extends AssignedIdEntity {
    @Column(name = "care_category", nullable = false, length = 60) private String careCategory;
    @Column(nullable = false, length = 160) private String name;
    @Column(nullable = false) private boolean active;
    @Column(name = "created_at", nullable = false) private Instant createdAt;
    @Column(name = "updated_at", nullable = false) private Instant updatedAt;
    @Column(name = "reference_standard", length = 300) private String referenceStandard;
    @Column(name = "guidance_note", length = 1000) private String guidanceNote;

    protected ServiceTemplate() {}

    public void describe(String name, String referenceStandard, String guidanceNote, Instant now) {
        this.name = name; this.referenceStandard = referenceStandard; this.guidanceNote = guidanceNote; this.updatedAt = micros(now);
    }

    public String getCareCategory() { return careCategory; }
    public String getName() { return name; }
    public boolean isActive() { return active; }
    public String getReferenceStandard() { return referenceStandard; }
    public String getGuidanceNote() { return guidanceNote; }
}
