package com.rehletshifaa.casemanagement.domain;

import com.rehletshifaa.shared.persistence.AssignedIdEntity;
import jakarta.persistence.*;
import org.hibernate.annotations.DynamicUpdate;

import java.time.Instant;
import java.util.UUID;

import static com.rehletshifaa.shared.persistence.SqlValues.micros;

/**
 * A medical case. {@code version} is the case revision clients send back as {@code expectedVersion}; it is managed
 * explicitly (status, care-area and claim changes bump it, bookkeeping such as the waiting-on marker does not).
 * Updates write only changed columns, so a case loaded here never overwrites a guarded JPQL update on another column.
 */
@Entity
@DynamicUpdate
@Table(name = "medical_cases")
public class MedicalCase extends AssignedIdEntity {
    @Column(name="case_number", nullable=false, unique=true, length=20) private String caseNumber;
    @Column(nullable=false, length=80) private String country;
    @Column(name="condition_description", length=2000) private String conditionDescription;
    @Column(name="care_category", length=60) private String careCategory;
    @Column(name="preferred_language", nullable=false, length=8) private String preferredLanguage;
    @Enumerated(EnumType.STRING) @Column(nullable=false, length=40) private CaseStatus status;
    @Column(name="travel_package_requested", nullable=false) private boolean travelPackageRequested;
    @Column(name="consent_timestamp", nullable=false) private Instant consentTimestamp;
    @Column(name="submitted_at") private Instant submittedAt;
    @Column(name="created_at", nullable=false) private Instant createdAt;
    @Column(name="updated_at", nullable=false) private Instant updatedAt;
    @Column(nullable=false) private long version;
    @Column(name="patient_id", nullable=false) private UUID patientId;
    @Column(name="claimed_at") private Instant claimedAt;
    @Column(name="waiting_on", nullable=false, length=20) private String waitingOn;
    @Column(name="waiting_reason", length=240) private String waitingReason;
    @Column(name="waiting_reason_code", length=120) private String waitingReasonCode;
    @Column(name="waiting_since") private Instant waitingSince;
    @Enumerated(EnumType.STRING) @Column(nullable=false, length=20) private CaseUrgency urgency;
    /** P1-13 (A-05): the patient's age band as stated at intake or recorded in intake review; null = not stated. */
    @Enumerated(EnumType.STRING) @Column(name="age_band", length=20) private AgeBand ageBand;
    /** P1-7: when an abandoned draft was purged; the row stays as a contentless tombstone. */
    @Column(name="purged_at") private Instant purgedAt;

    protected MedicalCase() {}
    /**
     * A draft case of an existing canonical patient. The patient's name and channels live on {@code patient_profiles}
     * and the case's submission contact, never on the case row.
     */
    public MedicalCase(UUID id, String caseNumber, UUID patientId, String country, String conditionDescription, String preferredLanguage, String careCategory, Instant now) {
        super(id);
        this.caseNumber = caseNumber; this.patientId = java.util.Objects.requireNonNull(patientId, "patientId"); this.country = country.trim();
        this.conditionDescription = conditionDescription == null || conditionDescription.isBlank() ? null : conditionDescription.trim();
        this.careCategory = careCategory;
        this.preferredLanguage = preferredLanguage; this.status = CaseStatus.DRAFT; this.waitingOn = "STAFF"; this.urgency = CaseUrgency.ROUTINE;
        this.consentTimestamp = micros(now); this.createdAt = micros(now); this.updatedAt = micros(now);
    }
    public void submit(Instant now) { if (status != CaseStatus.DRAFT || purgedAt != null) throw new IllegalStateException("Case is not in draft state"); status = CaseStatus.RECEIVED; submittedAt = micros(now); updatedAt = micros(now); version++; }
    /**
     * P1-7 (design §7.13): an abandoned draft keeps only its number, country, language and dates. Its audit and consent rows
     * (LEGAL_RECORD) reference it, so the row stays and everything the person wrote goes.
     */
    public void purgeDraft(Instant now) {
        if (status != CaseStatus.DRAFT) throw new IllegalStateException("Only a draft is purged");
        conditionDescription = null; careCategory = null; ageBand = null; waitingReason = null; waitingReasonCode = null;
        purgedAt = micros(now); updatedAt = micros(now); version++;
    }
    public Instant getPurgedAt() { return purgedAt; }
    public Instant getCreatedAt() { return createdAt; }
    public UUID getPatientId() { return patientId; }
    public String getCaseNumber() { return caseNumber; }
    public String getCountry() { return country; } public String getConditionDescription() { return conditionDescription; }
    public String getCareCategory() { return careCategory; }
    public String getPreferredLanguage() { return preferredLanguage; } public CaseStatus getStatus() { return status; } public Instant getSubmittedAt() { return submittedAt; }
    public long getVersion() { return version; }
    public boolean isTravelPackageRequested() { return travelPackageRequested; }
    public void setTravelPackageRequested(boolean value) { this.travelPackageRequested = value; }
    public CaseUrgency getUrgency() { return urgency; }
    public AgeBand getAgeBand() { return ageBand; }
    /** Intake states it; a coordinator corrects it in intake review (audited by the caller). Not a case revision, like urgency. */
    public void recordAgeBand(AgeBand band, Instant now) { this.ageBand = band; this.updatedAt = micros(now); }
    /**
     * The coordinator's urgency judgement. Bookkeeping like the waiting-on marker, not a case revision: it never bumps
     * {@code version}, so a coordinator raising urgency never invalidates someone else's open form.
     */
    public void changeUrgency(CaseUrgency to, Instant now) { this.urgency = java.util.Objects.requireNonNull(to, "urgency"); this.updatedAt = micros(now); }
}
