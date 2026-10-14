package com.rehletshifaa.facility.infrastructure;

import com.rehletshifaa.facility.domain.Facility;
import com.rehletshifaa.shared.persistence.BaseRepository;

import java.util.List;
import java.util.UUID;

public interface FacilityRepository extends BaseRepository<Facility, UUID> {
    List<Facility> findAllByOrderByNameAscCityAsc();

    boolean existsByNameIgnoreCaseAndCityIgnoreCase(String name, String city);

    boolean existsByNameIgnoreCaseAndCityIgnoreCaseAndIdNot(String name, String city, UUID id);
}
