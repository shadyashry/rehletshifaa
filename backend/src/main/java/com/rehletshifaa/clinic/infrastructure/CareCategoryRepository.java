package com.rehletshifaa.clinic.infrastructure;

import com.rehletshifaa.clinic.domain.CareCategory;
import org.springframework.data.repository.Repository;

import java.util.List;

/** Read-only: care areas are reference data owned by migrations. */
public interface CareCategoryRepository extends Repository<CareCategory, String> {
    List<CareCategory> findAllByOrderBySortOrderAscNameEnAsc();

    boolean existsBySlug(String slug);

    java.util.Optional<CareCategory> findBySlug(String slug);
}
