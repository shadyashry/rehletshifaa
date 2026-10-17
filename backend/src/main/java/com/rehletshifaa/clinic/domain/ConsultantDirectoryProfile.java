package com.rehletshifaa.clinic.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.Version;
import java.time.Instant;

import java.util.UUID;

/**
 * A Consultant's public profile, held on the platform's own Consultant profile (V105). It is the only source of the
 * doctors the public site shows: there is no separate directory, so a doctor shown publicly always exists as a
 * {@code practitioner_profiles} row, routed by that row's care area from the {@code care_categories} lookup.
 * <p>The content is CV-sourced bilingual JSON; the care area and its label are never stored here.
 */
@Entity
@Table(name = "consultant_directory_profiles")
public class ConsultantDirectoryProfile {
    @Id @Column(name = "practitioner_id") private UUID practitionerId;
    @Column(nullable = false, length = 80) private String slug;
    @Column(nullable = false) private boolean published;
    @Column(name = "sort_order", nullable = false) private int sortOrder;
    @Column(name = "content_en", nullable = false, columnDefinition = "text") private String contentEn;
    @Column(name = "content_ar", nullable = false, columnDefinition = "text") private String contentAr;

    @Version @Column(nullable = false) private Long version;
    @Column(name = "ever_published", nullable = false) private boolean everPublished;
    @Column(name = "created_at", nullable = false) private Instant createdAt;
    @Column(name = "updated_at", nullable = false) private Instant updatedAt;

    protected ConsultantDirectoryProfile() {}

    public static ConsultantDirectoryProfile create(UUID id, String slug, String en, String ar, Instant now) {
        var profile = new ConsultantDirectoryProfile();
        profile.practitionerId = id; profile.slug = slug; profile.contentEn = en; profile.contentAr = ar;
        profile.createdAt = now; profile.updatedAt = now;
        return profile;
    }
    public void editContent(String slug, String en, String ar, Instant now) {
        if (everPublished && !this.slug.equals(slug))
            throw new IllegalStateException("A previously published profile keeps its URL");
        this.slug = slug; contentEn = en; contentAr = ar; touch(now);
    }
    public void publish(Instant now) { published = true; everPublished = true; touch(now); }
    public void unpublish(Instant now) { published = false; touch(now); }
    public void reorder(int order, Instant now) { sortOrder = order; touch(now); }
    public void touch(Instant now) { updatedAt = now.isAfter(updatedAt) ? now : updatedAt.plusNanos(1000); }
    public long getVersion() { return version == null ? -1 : version; }
    public boolean isEverPublished() { return everPublished; }


    public UUID getPractitionerId() { return practitionerId; }
    public String getSlug() { return slug; }
    public boolean isPublished() { return published; }
    public int getSortOrder() { return sortOrder; }
    public String getContentEn() { return contentEn; }
    public String getContentAr() { return contentAr; }
}
