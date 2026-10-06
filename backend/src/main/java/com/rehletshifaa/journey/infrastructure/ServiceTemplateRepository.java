package com.rehletshifaa.journey.infrastructure;

import com.rehletshifaa.journey.domain.ServiceTemplate;
import com.rehletshifaa.shared.persistence.BaseRepository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface ServiceTemplateRepository extends BaseRepository<ServiceTemplate, UUID> {
    List<ServiceTemplate> findByActiveTrueOrderByCareCategory();

    List<ServiceTemplate> findByCareCategoryAndActiveTrueOrderByCareCategory(String careCategory);

    Optional<ServiceTemplate> findByIdAndActiveTrue(UUID id);

    Optional<ServiceTemplate> findFirstByCareCategoryAndActiveTrue(String careCategory);
}
