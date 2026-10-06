package com.rehletshifaa.directory.domain;

import com.rehletshifaa.shared.persistence.AssignedIdEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;

import java.time.Instant;
import java.time.LocalDate;
import java.util.Locale;
import java.util.Objects;
import java.util.UUID;

import static com.rehletshifaa.shared.persistence.SqlValues.micros;

/**
 * The canonical patient: structured name, contact channels and their verification, profile activation and the
 * identity-provider account binding. Each mutator mirrors one guarded state change and reports whether its guard
 * held, so callers keep their "changed or not" decisions. Callers hold the row lock ({@code lockById}).
 * {@code version} is the record revision; only the changes that bumped it before bump it now.
 */
@Entity
@Table(name = "patient_profiles")
public class PatientProfile extends AssignedIdEntity {
    @Column(name = "external_subject") private String externalSubject;
    @Column(nullable = false, length = 80) private String country;
    @Column(name = "whatsapp_number", length = 32) private String whatsappNumber;
    @Column(length = 254) private String email;
    @Column(name = "preferred_language", nullable = false, length = 8) private String preferredLanguage;
    @Column(name = "time_zone", length = 80) private String timeZone;
    @Column(name = "phone_verified_at") private Instant phoneVerifiedAt;
    @Column(name = "email_verified_at") private Instant emailVerifiedAt;
    @Column(name = "created_at", nullable = false) private Instant createdAt;
    @Column(name = "updated_at", nullable = false) private Instant updatedAt;
    @Column(nullable = false) private long version;
    @Column(name = "date_of_birth") private LocalDate dateOfBirth;
    @Column(length = 2) private String nationality;
    @Column(length = 16) private String sex;
    @Column(name = "profile_status", nullable = false, length = 24) private String profileStatus;
    @Column(name = "activated_at") private Instant activatedAt;
    @Column(name = "given_name", nullable = false, length = 80) private String givenName;
    @Column(name = "family_name", length = 80) private String familyName;
    @Column(name = "preferred_name", length = 80) private String preferredName;
    @Column(name = "account_status", nullable = false, length = 24) private String accountStatus;
    @Column(name = "account_setup_requested_at") private Instant accountSetupRequestedAt;
    @Column(name = "account_activated_at") private Instant accountActivatedAt;
    @Column(name = "profile_completed_at") private Instant profileCompletedAt;
    @Column(name = "merged_into_patient_id") private UUID mergedIntoPatientId;

    protected PatientProfile() {}

    /**
     * A patient as submitted at intake: PENDING profile, no account. Contact channels only when the submitter is the
     * patient: a number stored here is always the patient's own (a representative's stays on the submission contact).
     */
    public static PatientProfile submitted(UUID id, String givenName, String familyName, String country, String whatsappNumber,
                                           String email, String preferredLanguage, String timeZone, Instant now) {
        PatientProfile p = new PatientProfile(id);
        p.givenName = givenName; p.familyName = familyName; p.country = country; p.whatsappNumber = whatsappNumber;
        p.email = email; p.preferredLanguage = preferredLanguage; p.timeZone = timeZone; p.createdAt = micros(now); p.updatedAt = micros(now);
        p.profileStatus = "PENDING"; p.accountStatus = "NOT_PROVISIONED";
        return p;
    }

    private PatientProfile(UUID id) { super(id); }

    /** A new identity account awaits setup; only an unbound profile can be bound. */
    public boolean bindPendingSetup(String subject, Instant at) {
        if (externalSubject != null) return false;
        Instant now = micros(at);
        externalSubject = subject; accountStatus = "SETUP_PENDING"; accountSetupRequestedAt = now; updatedAt = now; version++;
        return true;
    }

    /**
     * The address owner confirmed the profile is theirs. The supplied (lower-case) email becomes the account email when
     * none is on file, and is marked verified when it matches the address on file. A profile bound to another identity
     * is never re-bound.
     */
    public boolean bindConfirmedOwner(String subject, String confirmedEmail, Instant at) {
        if (externalSubject != null && !externalSubject.equals(subject)) return false;
        Instant now = micros(at);
        String previousEmail = email;
        String effective = previousEmail != null ? previousEmail : confirmedEmail;
        if (effective != null && effective.toLowerCase(Locale.ROOT).equals(confirmedEmail) && emailVerifiedAt == null) emailVerifiedAt = now;
        externalSubject = subject; accountStatus = "ACTIVE";
        if (accountActivatedAt == null) accountActivatedAt = now;
        if (previousEmail == null) email = confirmedEmail;
        updatedAt = now; version++;
        return true;
    }

    /** A completed profile that is not yet ACTIVE becomes ACTIVE (no record revision). */
    public boolean activateCompletedProfile(Instant at) {
        if (profileCompletedAt == null || "ACTIVE".equals(profileStatus)) return false;
        profileStatus = "ACTIVE";
        if (activatedAt == null) activatedAt = micros(at);
        return true;
    }

    /**
     * First authenticated sign-in: the account becomes ACTIVE; the email is marked verified when the provider proved
     * it; a completed profile becomes ACTIVE too.
     */
    public boolean activateAccount(boolean emailProven, Instant at) {
        if ("ACTIVE".equals(accountStatus)) return false;
        Instant now = micros(at);
        accountStatus = "ACTIVE";
        if (accountActivatedAt == null) accountActivatedAt = now;
        if (emailProven && emailVerifiedAt == null) emailVerifiedAt = now;
        if (profileCompletedAt != null) {
            profileStatus = "ACTIVE";
            if (activatedAt == null) activatedAt = now;
        }
        updatedAt = now; version++;
        return true;
    }

    public boolean markEmailVerified(Instant at) {
        if (emailVerifiedAt != null) return false;
        emailVerifiedAt = micros(at); updatedAt = micros(at);
        return true;
    }

    /** A verification code delivered to the patient's own channel proves that channel. */
    public void markChannelVerified(String channel, Instant at) {
        Instant now = micros(at);
        if ("WHATSAPP".equals(channel)) phoneVerifiedAt = now;
        else if ("EMAIL".equals(channel)) emailVerifiedAt = now;
        else throw new IllegalArgumentException("Unknown verification channel: " + channel);
        updatedAt = now;
    }

    /** Withdraws the email when it is {@code address} (lower-case), optionally only while no account is bound. */
    public boolean withdrawEmail(String address, boolean onlyWhileUnbound, Instant at) {
        if (email == null || !email.toLowerCase(Locale.ROOT).equals(address)) return false;
        if (onlyWhileUnbound && externalSubject != null) return false;
        email = null; emailVerifiedAt = null; updatedAt = micros(at);
        return true;
    }

    /** Withdraws the mobile number when it was in fact the submitter's. */
    public boolean withdrawPhone(java.util.Collection<String> submitterNumbers, Instant at) {
        if (whatsappNumber == null || !submitterNumbers.contains(whatsappNumber)) return false;
        whatsappNumber = null; phoneVerifiedAt = null; updatedAt = micros(at);
        return true;
    }

    /** Folded into {@code canonical}: this profile keeps its history but no longer identifies anyone. */
    public void mergeInto(UUID canonical, Instant at) {
        mergedIntoPatientId = canonical; profileStatus = "MERGED"; accountStatus = "NOT_PROVISIONED"; email = null; whatsappNumber = null;
        updatedAt = micros(at); version++;
    }

    public void touch(Instant at) { updatedAt = micros(at); }

    public void recordSetupRequested(Instant at) { accountSetupRequestedAt = micros(at); updatedAt = micros(at); }

    /** The patient's first completion of their own profile; a profile that is already ACTIVE is not changed. */
    public boolean complete(Completion c, boolean resetEmailVerification, boolean resetPhoneVerification, Instant at) {
        if ("ACTIVE".equals(profileStatus)) return false;
        Instant now = micros(at);
        givenName = c.givenName(); familyName = c.familyName(); preferredName = c.preferredName(); email = c.email();
        whatsappNumber = c.phone(); country = c.country();
        nationality = c.nationality(); dateOfBirth = c.dateOfBirth(); sex = c.sex(); preferredLanguage = c.language();
        if (resetEmailVerification) emailVerifiedAt = null;
        if (resetPhoneVerification) phoneVerifiedAt = null;
        profileStatus = "ACTIVE";
        if (profileCompletedAt == null) profileCompletedAt = now;
        if (activatedAt == null) activatedAt = now;
        updatedAt = now; version++;
        return true;
    }

    /** The profile fields the patient completes themselves. */
    public record Completion(String givenName, String familyName, String preferredName, String email, String phone, String country,
                             String nationality, LocalDate dateOfBirth, String sex, String language) {}

    public String getExternalSubject() { return externalSubject; }
    public String getEmail() { return email; }
    public String getCountry() { return country; }
    public Instant getPhoneVerifiedAt() { return phoneVerifiedAt; }
    public Instant getEmailVerifiedAt() { return emailVerifiedAt; }
    public String getProfileStatus() { return profileStatus; }
    public String getGivenName() { return givenName; }
    public String getFamilyName() { return familyName; }
    public String getWhatsappNumber() { return whatsappNumber; }
    public String getPreferredLanguage() { return preferredLanguage; }
    /** Given name and family name, as {@code PatientNames.DISPLAY_SQL} composes it. */
    public String getDisplayName() { return (givenName + " " + (familyName == null ? "" : familyName)).trim(); }
    public String getAccountStatus() { return accountStatus; }
    public UUID getMergedIntoPatientId() { return mergedIntoPatientId; }
    public boolean sameEmail(String other) { return Objects.equals(email, other); }
}
