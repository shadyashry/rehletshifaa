package com.rehletshifaa.workforce.domain;

import com.rehletshifaa.shared.persistence.AssignedIdEntity;
import jakarta.persistence.CollectionTable;
import jakarta.persistence.Column;
import jakarta.persistence.ElementCollection;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.OrderBy;
import jakarta.persistence.Table;
import org.hibernate.annotations.BatchSize;

import java.time.Instant;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import java.util.UUID;

import static com.rehletshifaa.shared.persistence.SqlValues.micros;

/**
 * STF-01/02: an invitation exists before the identity does. Single-use, bound to one email, expiring, and it grants
 * nothing by itself: its roles become INVITATION-sourced assignments of an INVITED person. Name and email are stored
 * encrypted. {@code revision} is managed explicitly (see {@link WorkforcePerson}).
 */
@Entity
@Table(name = "workforce_invitations")
public class WorkforceInvitation extends AssignedIdEntity {
    @Column(name = "display_name_encrypted", nullable = false, columnDefinition = "text") private String displayNameEncrypted;
    @Column(name = "email_encrypted", nullable = false, columnDefinition = "text") private String emailEncrypted;
    @Column(name = "email_hash", nullable = false, length = 64) private String emailHash;
    @Column(nullable = false, length = 5) private String locale;
    @Column(nullable = false, length = 20) private String status;
    @Column(length = 255) private String subject;
    @Column(name = "invited_by", nullable = false, length = 255) private String invitedBy;
    @Column(nullable = false, length = 500) private String reason;
    @Column(name = "created_at", nullable = false) private Instant createdAt;
    @Column(name = "expires_at", nullable = false) private Instant expiresAt;
    @Column(name = "completed_at") private Instant completedAt;
    @Column(nullable = false) private long revision;
    @Column(name = "identity_adopted", nullable = false) private boolean identityAdopted;

    /** Fixed at creation; loaded in batches so a list of invitations does not query once per row. */
    @ElementCollection(fetch = FetchType.LAZY)
    @CollectionTable(name = "workforce_invitation_roles", joinColumns = @JoinColumn(name = "invitation_id"))
    @Column(name = "role_key", length = 80)
    @OrderBy
    @BatchSize(size = 100)
    private Set<String> roles = new LinkedHashSet<>();

    protected WorkforceInvitation() {}

    public WorkforceInvitation(UUID id, String displayNameEncrypted, String emailEncrypted, String emailHash, String locale,
                               String invitedBy, String reason, Instant createdAt, Instant expiresAt, List<String> roles) {
        super(id);
        this.displayNameEncrypted = displayNameEncrypted; this.emailEncrypted = emailEncrypted; this.emailHash = emailHash;
        this.locale = locale; this.status = "QUEUED"; this.invitedBy = invitedBy; this.reason = reason;
        this.createdAt = micros(createdAt); this.expiresAt = micros(expiresAt); this.roles.addAll(roles);
    }

    public String getDisplayNameEncrypted() { return displayNameEncrypted; }
    public String getEmailEncrypted() { return emailEncrypted; }
    public String getEmailHash() { return emailHash; }
    public String getLocale() { return locale; }
    public String getStatus() { return status; }
    public String getSubject() { return subject; }
    public String getInvitedBy() { return invitedBy; }
    public String getReason() { return reason; }
    public Instant getCreatedAt() { return createdAt; }
    public Instant getExpiresAt() { return expiresAt; }
    public long getRevision() { return revision; }
    public boolean isIdentityAdopted() { return identityAdopted; }
    /** Sorted by role key. */
    public List<String> getRoles() { return roles.stream().sorted().toList(); }
}
