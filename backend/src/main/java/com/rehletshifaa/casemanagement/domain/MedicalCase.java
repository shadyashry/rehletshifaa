package com.rehletshifaa.casemanagement.domain;

import jakarta.persistence.*;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "medical_cases")
public class MedicalCase {
    @Id private UUID id;
    @Column(name="case_number", nullable=false, unique=true, length=20) private String caseNumber;
    @Column(name="full_name", nullable=false, length=120) private String fullName;
    @Column(nullable=false, length=80) private String country;
    @Column(name="whatsapp_number", nullable=false, length=32) private String whatsappNumber;
    @Column(name="condition_description", length=2000) private String conditionDescription;
    @Column(name="preferred_language", nullable=false, length=8) private String preferredLanguage;
    @Enumerated(EnumType.STRING) @Column(nullable=false, length=40) private CaseStatus status;
    @Column(name="consent_timestamp", nullable=false) private Instant consentTimestamp;
    @Column(name="submitted_at") private Instant submittedAt;
    @Column(name="created_at", nullable=false) private Instant createdAt;
    @Column(name="updated_at", nullable=false) private Instant updatedAt;
    @Version @Column(nullable=false) private long version;

    protected MedicalCase() {}

    public MedicalCase(UUID id, String caseNumber, String fullName, String country, String whatsappNumber, String conditionDescription, String preferredLanguage, Instant now) {
        this.id = id; this.caseNumber = caseNumber; this.fullName = fullName.trim(); this.country = country.trim(); this.whatsappNumber = whatsappNumber.trim();
        this.conditionDescription = conditionDescription == null || conditionDescription.isBlank() ? null : conditionDescription.trim();
        this.preferredLanguage = preferredLanguage; this.status = CaseStatus.DRAFT; this.consentTimestamp = now; this.createdAt = now; this.updatedAt = now;
    }

    public void submit(Instant now) { if (status != CaseStatus.DRAFT) throw new IllegalStateException("Case is not in draft state"); status = CaseStatus.RECEIVED; submittedAt = now; updatedAt = now; }
    public UUID getId() { return id; } public String getCaseNumber() { return caseNumber; } public String getFullName() { return fullName; }
    public String getCountry() { return country; } public String getWhatsappNumber() { return whatsappNumber; } public String getConditionDescription() { return conditionDescription; }
    public String getPreferredLanguage() { return preferredLanguage; } public CaseStatus getStatus() { return status; } public Instant getSubmittedAt() { return submittedAt; }
}
