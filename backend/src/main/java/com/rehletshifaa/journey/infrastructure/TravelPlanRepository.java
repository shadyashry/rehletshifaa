package com.rehletshifaa.journey.infrastructure;

import com.rehletshifaa.journey.domain.TravelPlan;
import com.rehletshifaa.shared.persistence.BaseRepository;

import java.util.Optional;
import java.util.UUID;

public interface TravelPlanRepository extends BaseRepository<TravelPlan, UUID> {
    Optional<TravelPlan> findByCaseId(UUID caseId);
}
