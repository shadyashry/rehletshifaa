package com.rehletshifaa.journey.infrastructure;

import com.rehletshifaa.journey.domain.ServiceTemplateItem;
import com.rehletshifaa.shared.persistence.BaseRepository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface ServiceTemplateItemRepository extends BaseRepository<ServiceTemplateItem, UUID> {
    List<ServiceTemplateItem> findByTemplateIdOrderByActiveDescSortOrderAscServiceNameAsc(UUID templateId);

    List<ServiceTemplateItem> findByTemplateIdAndActiveTrueOrderBySortOrderAscServiceNameAsc(UUID templateId);

    Optional<ServiceTemplateItem> findByTemplateIdAndServiceCode(UUID templateId, String serviceCode);

    boolean existsByTemplateIdAndServiceCode(UUID templateId, String serviceCode);
}
