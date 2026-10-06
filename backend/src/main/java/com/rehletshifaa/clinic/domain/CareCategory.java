package com.rehletshifaa.clinic.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import org.hibernate.annotations.Immutable;

/** A managed care area (reference data, changed only by migrations). */
@Entity
@Immutable
@Table(name = "care_categories")
public class CareCategory {
    @Id @Column(length = 60) private String slug;
    @Column(name = "name_en", nullable = false, length = 120) private String nameEn;
    @Column(name = "name_ar", nullable = false, length = 120) private String nameAr;
    @Column(name = "sort_order", nullable = false) private int sortOrder;

    protected CareCategory() {}

    public String getSlug() { return slug; }
    public String getNameEn() { return nameEn; }
    public String getNameAr() { return nameAr; }
}
