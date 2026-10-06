package com.rehletshifaa.journey.domain;

import com.rehletshifaa.shared.persistence.AssignedIdEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;

import java.time.Instant;
import java.util.UUID;

import static com.rehletshifaa.shared.persistence.SqlValues.micros;

/** A treatment episode at a facility, with its procedures, milestones and discharge evidence. */
@Entity
@Table(name = "treatment_episodes")
public class TreatmentEpisode extends AssignedIdEntity {
    @Column(name = "case_id", nullable = false) private UUID caseId;
    @Column(nullable = false, length = 300) private String facility;
    @Column(name = "practitioner_id") private UUID practitionerId;
    @Column(name = "start_at") private Instant startAt;
    @Column(name = "end_at") private Instant endAt;
    @Column(nullable = false, length = 40) private String status;
    @Column(name = "planned_procedures", columnDefinition = "text") private String plannedProcedures;
    @Column(name = "actual_procedures", columnDefinition = "text") private String actualProcedures;
    @Column(columnDefinition = "text") private String milestones;
    @Column(columnDefinition = "text") private String complications;
    @Column(name = "discharge_ready", nullable = false) private boolean dischargeReady;
    @Column(name = "discharge_document_id") private UUID dischargeDocumentId;
    @Column(name = "created_at", nullable = false) private Instant createdAt;
    @Column(name = "updated_at", nullable = false) private Instant updatedAt;
    @Column(nullable = false) private long version;

    protected TreatmentEpisode() {}

    /** What was planned and done in the episode. */
    public record Record(String facility, Instant startAt, Instant endAt, String status, String plannedProcedures, String actualProcedures,
                         String milestones, String complications, boolean dischargeReady, UUID dischargeDocumentId) {}

    public TreatmentEpisode(UUID id, UUID caseId, UUID practitionerId, Record r, Instant now) {
        super(id);
        this.caseId = caseId; this.practitionerId = practitionerId; this.facility = r.facility(); this.startAt = micros(r.startAt());
        this.endAt = micros(r.endAt()); this.status = r.status(); this.plannedProcedures = r.plannedProcedures();
        this.actualProcedures = r.actualProcedures(); this.milestones = r.milestones(); this.complications = r.complications();
        this.dischargeReady = r.dischargeReady(); this.dischargeDocumentId = r.dischargeDocumentId();
        this.createdAt = micros(now); this.updatedAt = micros(now);
    }
}
