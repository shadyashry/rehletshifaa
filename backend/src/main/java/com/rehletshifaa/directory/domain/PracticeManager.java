package com.rehletshifaa.directory.domain;

import com.rehletshifaa.shared.persistence.AssignedIdEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;

import java.time.Instant;
import java.util.UUID;

import static com.rehletshifaa.shared.persistence.SqlValues.micros;

/** A practice manager delegated by a consultant, with per-area permissions. Name and email are stored encrypted. */
@Entity
@Table(name = "practice_managers")
public class PracticeManager extends AssignedIdEntity {
    @Column(name = "practitioner_id", nullable = false) private UUID practitionerId;
    @Column(name = "manager_subject", nullable = false) private String managerSubject;
    @Column(name = "display_name_encrypted", nullable = false, columnDefinition = "text") private String displayNameEncrypted;
    @Column(name = "email_encrypted", columnDefinition = "text") private String emailEncrypted;
    @Column(name = "email_hash", length = 64) private String emailHash;
    @Column(nullable = false, length = 20) private String status;
    @Column(name = "can_manage_schedule", nullable = false) private boolean canManageSchedule;
    @Column(name = "can_manage_profile", nullable = false) private boolean canManageProfile;
    @Column(name = "can_manage_services", nullable = false) private boolean canManageServices;
    @Column(name = "invited_by", nullable = false) private String invitedBy;
    @Column(name = "invited_at", nullable = false) private Instant invitedAt;
    @Column(name = "revoked_by") private String revokedBy;
    @Column(name = "revoked_at") private Instant revokedAt;
    @Column(name = "updated_at", nullable = false) private Instant updatedAt;
    @Column(nullable = false) private long version;
    @Column(name = "accepted_invitation_id") private UUID acceptedInvitationId;
    @Column(name = "accepted_at") private Instant acceptedAt;
    @Column(name = "accepted_by_subject") private String acceptedBySubject;
    @Column(name = "accepted_mfa_acr", length = 40) private String acceptedMfaAcr;
    @Column(name = "suspended_at") private Instant suspendedAt;
    @Column(name = "suspension_reason", length = 500) private String suspensionReason;
    @Column(name = "revocation_reason", length = 500) private String revocationReason;

    protected PracticeManager() {}

    public PracticeManager(UUID id, UUID practitionerId, String managerSubject, String displayNameEncrypted, String emailEncrypted,
                           String emailHash, boolean schedule, boolean profile, boolean services, String invitedBy, Instant now) {
        super(id);
        this.practitionerId = practitionerId; this.managerSubject = managerSubject; this.displayNameEncrypted = displayNameEncrypted;
        this.emailEncrypted = emailEncrypted; this.emailHash = emailHash; this.status = "ACTIVE"; this.canManageSchedule = schedule;
        this.canManageProfile = profile; this.canManageServices = services; this.invitedBy = invitedBy; this.invitedAt = micros(now);
        this.updatedAt = micros(now);
    }

    public UUID getPractitionerId() { return practitionerId; }
    public String getManagerSubject() { return managerSubject; }
    public String getStatus() { return status; }
    public String getDisplayNameEncrypted() { return displayNameEncrypted; }
    public String getEmailEncrypted() { return emailEncrypted; }
    public boolean canManageSchedule() { return canManageSchedule; }
    public boolean canManageProfile() { return canManageProfile; }
    public boolean canManageServices() { return canManageServices; }
    public Instant getInvitedAt() { return invitedAt; }
    public long getVersion() { return version; }
}
