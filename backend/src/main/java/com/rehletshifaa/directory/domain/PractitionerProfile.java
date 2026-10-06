package com.rehletshifaa.directory.domain;

import com.rehletshifaa.shared.persistence.AssignedIdEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;

import java.time.Instant;
import java.util.UUID;

import static com.rehletshifaa.shared.persistence.SqlValues.micros;

/**
 * A consultant's profile: identity binding, account and credentialing state, clinical profile. Lives in the
 * low-level {@code directory} module because authority, access, identity, clinic and journey all read it.
 * {@code version} is the record revision clients send back as {@code expectedVersion}; it is managed explicitly.
 */
@Entity
@Table(name = "practitioner_profiles")
public class PractitionerProfile extends AssignedIdEntity {
    @Column(name = "external_subject") private String externalSubject;
    @Column(name = "legal_name", nullable = false, length = 160) private String legalName;
    @Column(name = "display_name", nullable = false, length = 160) private String displayName;
    @Column(name = "registration_number", length = 100) private String registrationNumber;
    @Column(length = 120) private String specialty;
    @Column(length = 160) private String subspecialty;
    @Column(columnDefinition = "text") private String qualifications;
    @Column(columnDefinition = "text") private String appointments;
    @Column(name = "hospital_privileges", columnDefinition = "text") private String hospitalPrivileges;
    @Column(length = 300) private String languages;
    @Column(name = "approved_procedures", columnDefinition = "text") private String approvedProcedures;
    @Column(name = "indemnity_reference") private String indemnityReference;
    @Column(name = "contract_status", length = 40) private String contractStatus;
    @Column(name = "availability_status", length = 40) private String availabilityStatus;
    @Column(name = "expected_review_hours") private Integer expectedReviewHours;
    @Column(name = "credentialing_status", nullable = false, length = 40) private String credentialingStatus;
    @Column(name = "suspension_reason", length = 500) private String suspensionReason;
    @Column(name = "created_at", nullable = false) private Instant createdAt;
    @Column(name = "updated_at", nullable = false) private Instant updatedAt;
    @Column(nullable = false) private long version;
    @Column(name = "care_category", length = 60) private String careCategory;
    @Column(name = "practitioner_type", nullable = false, length = 20) private String practitionerType;
    @Column(name = "email_encrypted", columnDefinition = "text") private String emailEncrypted;
    @Column(name = "email_hash", length = 64) private String emailHash;
    @Column(name = "account_status", nullable = false, length = 30) private String accountStatus;
    @Column(name = "invited_at") private Instant invitedAt;
    @Column(name = "disabled_at") private Instant disabledAt;
    @Column(name = "consultant_lifecycle_status", nullable = false, length = 30) private String consultantLifecycleStatus;

    protected PractitionerProfile() {}

    /** A new consultant under credentialing review; invited when created from an email (no identity yet). */
    public static PractitionerProfile onboard(UUID id, String externalSubject, Clinical clinical, String availabilityStatus, String practitionerType,
                                              String careCategory, String emailEncrypted, String emailHash, String accountStatus,
                                              Instant invitedAt, Instant now) {
        PractitionerProfile p = new PractitionerProfile(id);
        p.externalSubject = externalSubject; p.legalName = clinical.legalName(); p.displayName = clinical.displayName();
        p.registrationNumber = clinical.registrationNumber(); p.specialty = clinical.specialty(); p.subspecialty = clinical.subspecialty();
        p.qualifications = clinical.qualifications(); p.appointments = clinical.appointments(); p.hospitalPrivileges = clinical.hospitalPrivileges();
        p.languages = clinical.languages(); p.approvedProcedures = clinical.approvedProcedures(); p.indemnityReference = clinical.indemnityReference();
        p.contractStatus = clinical.contractStatus(); p.expectedReviewHours = clinical.expectedReviewHours();
        p.availabilityStatus = availabilityStatus; p.credentialingStatus = "UNDER_REVIEW"; p.practitionerType = practitionerType;
        p.careCategory = careCategory; p.emailEncrypted = emailEncrypted; p.emailHash = emailHash; p.accountStatus = accountStatus;
        p.invitedAt = micros(invitedAt); p.createdAt = micros(now); p.updatedAt = micros(now);
        p.consultantLifecycleStatus = "ACTIVE";
        return p;
    }

    private PractitionerProfile(UUID id) { super(id); }

    /** The clinical profile fields entered at onboarding. */
    public record Clinical(String legalName, String displayName, String registrationNumber, String specialty, String subspecialty,
                           String qualifications, String appointments, String hospitalPrivileges, String languages,
                           String approvedProcedures, String indemnityReference, String contractStatus, Integer expectedReviewHours) {}

    public String getExternalSubject() { return externalSubject; }
    public String getPractitionerType() { return practitionerType; }
    public String getLegalName() { return legalName; }
    public String getDisplayName() { return displayName; }
    public String getAvailabilityStatus() { return availabilityStatus; }
    public String getCredentialingStatus() { return credentialingStatus; }
    public String getCareCategory() { return careCategory; }
    public String getEmailEncrypted() { return emailEncrypted; }
    public String getAccountStatus() { return accountStatus; }
    public Instant getDisabledAt() { return disabledAt; }
    public String getSpecialty() { return specialty; }
    public String getSubspecialty() { return subspecialty; }
    public String getLanguages() { return languages; }
    public Integer getExpectedReviewHours() { return expectedReviewHours; }
    public Instant getInvitedAt() { return invitedAt; }

    /** The consultant account is not disabled (a disabled account closes its clinic to delegates). */
    public boolean isAccountEnabled() { return !"DISABLED".equals(accountStatus) && disabledAt == null; }
    public long getVersion() { return version; }
}
