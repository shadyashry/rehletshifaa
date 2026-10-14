package com.rehletshifaa.journey.infrastructure;

import com.rehletshifaa.journey.domain.TravelPlan;
import com.rehletshifaa.shared.persistence.BaseRepository;

import java.util.Optional;
import java.util.UUID;

public interface TravelPlanRepository extends BaseRepository<TravelPlan, UUID> {
    Optional<TravelPlan> findByCaseId(UUID caseId);

    /** The plan's status alone (PLANNING, CONFIRMED, ARRIVED): whether the patient may still withdraw on their own. */
    @org.springframework.data.jpa.repository.Query("select p.status from TravelPlan p where p.caseId = :caseId")
    Optional<String> findStatusByCaseId(@org.springframework.data.repository.query.Param("caseId") UUID caseId);
}
