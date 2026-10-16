package com.rehletshifaa.facility.infrastructure;

import com.rehletshifaa.facility.domain.FacilityPackageSuspension;
import com.rehletshifaa.shared.persistence.BaseRepository;

import java.util.List;
import java.util.UUID;

public interface FacilityPackageSuspensionRepository extends BaseRepository<FacilityPackageSuspension, UUID> {
    List<FacilityPackageSuspension> findByFacilityIdAndLiftedAtIsNull(UUID facilityId);

    boolean existsByFacilityIdAndLiftedAtIsNull(UUID facilityId);

    List<FacilityPackageSuspension> findByLiftedAtIsNull();

    List<FacilityPackageSuspension> findByFacilityIdOrderBySuspendedAtDesc(UUID facilityId);
}
