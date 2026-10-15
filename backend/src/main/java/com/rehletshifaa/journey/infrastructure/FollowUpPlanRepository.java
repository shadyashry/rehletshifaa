package com.rehletshifaa.journey.infrastructure;

import com.rehletshifaa.journey.domain.FollowUpPlan;
import com.rehletshifaa.shared.persistence.BaseRepository;

import java.util.UUID;

public interface FollowUpPlanRepository extends BaseRepository<FollowUpPlan, UUID> {
    /** P1-17: the case's latest follow-up plan (the discharge pack's last item). */
    java.util.Optional<FollowUpPlan> findFirstByCaseIdOrderByCreatedAtDesc(UUID caseId);
}
