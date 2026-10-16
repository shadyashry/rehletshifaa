package com.rehletshifaa.clinic.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import org.hibernate.annotations.Immutable;

import java.util.UUID;

/**
 * A Consultant's public profile, held on the platform's own Consultant profile (V105). It is the only source of the
 * doctors the public site shows: there is no separate directory, so a doctor shown publicly always exists as a
 * {@code practitioner_profiles} row, routed by that row's care area from the {@code care_categories} lookup.
 * <p>The content is CV-sourced bilingual JSON; the care area and its label are never stored here.
 */
@Entity
@Immutable
@Table(name = "consultant_directory_profiles")
public class ConsultantDirectoryProfile {
    @Id @Column(name = "practitioner_id") private UUID practitionerId;
    @Column(nullable = false, length = 80) private String slug;
    @Column(nullable = false) private boolean published;
    @Column(name = "sort_order", nullable = false) private int sortOrder;
    @Column(name = "content_en", nullable = false, columnDefinition = "text") private String contentEn;
    @Column(name = "content_ar", nullable = false, columnDefinition = "text") private String contentAr;

    protected ConsultantDirectoryProfile() {}

    public UUID getPractitionerId() { return practitionerId; }
    public String getSlug() { return slug; }
    public boolean isPublished() { return published; }
    public int getSortOrder() { return sortOrder; }
    public String getContentEn() { return contentEn; }
    public String getContentAr() { return contentAr; }
}
