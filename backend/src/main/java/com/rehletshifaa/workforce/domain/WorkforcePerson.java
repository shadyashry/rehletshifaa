package com.rehletshifaa.workforce.domain;

import com.rehletshifaa.shared.persistence.PersistableEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.Instant;

import static com.rehletshifaa.shared.persistence.SqlValues.micros;

/**
 * A workforce person (WF-01). Display name and email are stored encrypted; callers encrypt/decrypt.
 *
 * <p>{@code revision} is the record revision shown to administrators, not an optimistic-lock counter: some
 * updates (sign-in time, MFA evidence from hygiene) deliberately leave it unchanged, so it is managed
 * explicitly rather than with {@code @Version}.
 */
@Entity
@Table(name = "workforce_people")
public class WorkforcePerson extends PersistableEntity<String> {
    @Id @Column(length = 255) private String subject;
    @Column(name = "display_name_encrypted", nullable = false, columnDefinition = "text") private String displayNameEncrypted;
    @Column(name = "email_encrypted", columnDefinition = "text") private String emailEncrypted;
    @Column(name = "email_hash", length = 64, unique = true) private String emailHash;
    @Column(nullable = false, length = 5) private String locale;
    @Column(name = "activated_at") private Instant activatedAt;
    @Column(name = "last_sign_in_at") private Instant lastSignInAt;
    @Column(name = "offboarding_started_at") private Instant offboardingStartedAt;
    @Column(name = "offboarded_at") private Instant offboardedAt;
    @Column(name = "lifecycle_reason", length = 500) private String lifecycleReason;
    @Column(name = "lifecycle_changed_at") private Instant lifecycleChangedAt;
    @Column(name = "lifecycle_status", nullable = false, length = 30) private String lifecycleStatus;
    @Column(name = "mfa_enrolled", nullable = false) private boolean mfaEnrolled;
    @Column(name = "phishing_resistant_mfa_enrolled", nullable = false) private boolean phishingResistantMfaEnrolled;
    @Column(name = "created_at", nullable = false) private Instant createdAt;
    @Column(name = "updated_at", nullable = false) private Instant updatedAt;
    @Column(nullable = false) private long revision;

    protected WorkforcePerson() {}

    /** A person created from an invitation: INVITED, no MFA evidence, revision 0. */
    public static WorkforcePerson invited(String subject, String displayNameEncrypted, String emailEncrypted, String emailHash,
                                          String locale, Instant createdAt, Instant updatedAt) {
        WorkforcePerson person = new WorkforcePerson();
        person.subject = subject; person.displayNameEncrypted = displayNameEncrypted; person.emailEncrypted = emailEncrypted;
        person.emailHash = emailHash; person.locale = locale; person.lifecycleStatus = "INVITED";
        person.createdAt = micros(createdAt); person.updatedAt = micros(updatedAt);
        return person;
    }

    /** STF-07 lifecycle change; the instant column that changes depends on the target state. */
    public void transition(String lifecycle, String reason, Instant at) {
        Instant now = micros(at);
        lifecycleStatus = lifecycle; lifecycleReason = reason; updatedAt = now;
        switch (lifecycle) {
            case "ACTIVE" -> { if (activatedAt == null) activatedAt = now; }
            case "OFFBOARDING" -> offboardingStartedAt = now;
            case "OFFBOARDED" -> offboardedAt = now;
            default -> lifecycleChangedAt = now;
        }
        revision++;
    }

    @Override public String getId() { return subject; }
    public String getSubject() { return subject; }
    public String getDisplayNameEncrypted() { return displayNameEncrypted; }
    public String getEmailEncrypted() { return emailEncrypted; }
    public String getEmailHash() { return emailHash; }
    public String getLocale() { return locale; }
    public Instant getActivatedAt() { return activatedAt; }
    public Instant getLastSignInAt() { return lastSignInAt; }
    public String getLifecycleStatus() { return lifecycleStatus; }
    public boolean isMfaEnrolled() { return mfaEnrolled; }
    public boolean isPhishingResistantMfaEnrolled() { return phishingResistantMfaEnrolled; }
    public long getRevision() { return revision; }
}
