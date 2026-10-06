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
    @Column(name="waiting_since") private Instant waitingSince;

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
        this.preferredLanguage = preferredLanguage; this.status = CaseStatus.DRAFT; this.waitingOn = "STAFF";
        this.consentTimestamp = micros(now); this.createdAt = micros(now); this.updatedAt = micros(now);
    }
    public void submit(Instant now) { if (status != CaseStatus.DRAFT) throw new IllegalStateException("Case is not in draft state"); status = CaseStatus.RECEIVED; submittedAt = micros(now); updatedAt = micros(now); version++; }
    public UUID getPatientId() { return patientId; }
    public String getCaseNumber() { return caseNumber; }
    public String getCountry() { return country; } public String getConditionDescription() { return conditionDescription; }
    public String getCareCategory() { return careCategory; }
    public String getPreferredLanguage() { return preferredLanguage; } public CaseStatus getStatus() { return status; } public Instant getSubmittedAt() { return submittedAt; }
    public long getVersion() { return version; }
    public boolean isTravelPackageRequested() { return travelPackageRequested; }
    public void setTravelPackageRequested(boolean value) { this.travelPackageRequested = value; }
}
