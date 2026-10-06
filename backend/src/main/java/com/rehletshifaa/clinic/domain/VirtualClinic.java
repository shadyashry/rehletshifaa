package com.rehletshifaa.clinic.domain;

import com.rehletshifaa.shared.persistence.PersistableEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.Instant;
import java.util.UUID;

import static com.rehletshifaa.shared.persistence.SqlValues.micros;

/**
 * A consultant's virtual clinic (one per consultant, keyed by the practitioner): the published public profile, the
 * pending profile draft and the clinic settings. {@code version} is the revision clients send back as
 * {@code expectedVersion}; every change bumps it. Rows are created by {@code VirtualClinicRepository.open}.
 */
@Entity
@Table(name = "virtual_clinics")
public class VirtualClinic extends PersistableEntity<UUID> {
    @Id @Column(name = "practitioner_id") private UUID practitionerId;
    @Column(name = "public_display_name", length = 160) private String publicDisplayName;
    @Column(name = "public_headline", length = 300) private String publicHeadline;
    @Column(name = "public_bio", columnDefinition = "text") private String publicBio;
    @Column(name = "public_languages", length = 300) private String publicLanguages;
    @Column(name = "published_at") private Instant publishedAt;
    @Column(name = "published_by") private String publishedBy;
    @Column(name = "draft_display_name", length = 160) private String draftDisplayName;
    @Column(name = "draft_headline", length = 300) private String draftHeadline;
    @Column(name = "draft_bio", columnDefinition = "text") private String draftBio;
    @Column(name = "draft_languages", length = 300) private String draftLanguages;
    @Column(name = "draft_status", nullable = false, length = 30) private String draftStatus;
    @Column(name = "draft_updated_by") private String draftUpdatedBy;
    @Column(name = "draft_updated_at") private Instant draftUpdatedAt;
    @Column(name = "manager_changes_require_approval", nullable = false) private boolean managerChangesRequireApproval;
    @Column(name = "created_at", nullable = false) private Instant createdAt;
    @Column(name = "updated_at", nullable = false) private Instant updatedAt;
    @Column(nullable = false) private long version;

    protected VirtualClinic() {}

    @Override public UUID getId() { return practitionerId; }

    public void requireManagerApproval(boolean required, Instant now) {
        managerChangesRequireApproval = required;
        touch(now);
    }

    public void saveDraft(String displayName, String headline, String bio, String languages, String by, Instant now) {
        draftDisplayName = displayName; draftHeadline = headline; draftBio = bio; draftLanguages = languages;
        draftStatus = "PENDING_APPROVAL"; draftUpdatedBy = by; draftUpdatedAt = micros(now);
        touch(now);
    }

    /** Publishes the pending draft. @return false when no draft is waiting for approval */
    public boolean publishDraft(String by, Instant now) {
        if (!"PENDING_APPROVAL".equals(draftStatus)) return false;
        publicDisplayName = draftDisplayName; publicHeadline = draftHeadline; publicBio = draftBio; publicLanguages = draftLanguages;
        publishedAt = micros(now); publishedBy = by;
        discardDraft(now);
        return true;
    }

    public void discardDraft(Instant now) {
        draftDisplayName = null; draftHeadline = null; draftBio = null; draftLanguages = null;
        draftStatus = "NONE"; draftUpdatedBy = null; draftUpdatedAt = null;
        touch(now);
    }

    private void touch(Instant now) { updatedAt = micros(now); version++; }

    public String getPublicDisplayName() { return publicDisplayName; }
    public String getPublicHeadline() { return publicHeadline; }
    public String getPublicBio() { return publicBio; }
    public String getPublicLanguages() { return publicLanguages; }
    public Instant getPublishedAt() { return publishedAt; }
    public String getDraftDisplayName() { return draftDisplayName; }
    public String getDraftHeadline() { return draftHeadline; }
    public String getDraftBio() { return draftBio; }
    public String getDraftLanguages() { return draftLanguages; }
    public String getDraftStatus() { return draftStatus; }
    public String getDraftUpdatedBy() { return draftUpdatedBy; }
    public Instant getDraftUpdatedAt() { return draftUpdatedAt; }
    public boolean isManagerChangesRequireApproval() { return managerChangesRequireApproval; }
    public long getVersion() { return version; }
}
