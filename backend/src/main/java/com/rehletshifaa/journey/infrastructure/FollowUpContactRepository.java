package com.rehletshifaa.journey.infrastructure;

import com.rehletshifaa.journey.domain.FollowUpContact;
import com.rehletshifaa.shared.persistence.BaseRepository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface FollowUpContactRepository extends BaseRepository<FollowUpContact, UUID> {
    /** The case's schedule in date order. */
    List<FollowUpContact> findByCaseIdOrderByDueAtAscCreatedAtAsc(UUID caseId);

    /** The next contact still to hold (the Consultant's one FOLLOW_UP_CONTACT item points at it). */
    Optional<FollowUpContact> findFirstByCaseIdAndStatusOrderByDueAtAscCreatedAtAsc(UUID caseId, String status);

    boolean existsByCaseIdAndStatus(UUID caseId, String status);

    /** The plan's own first contact is scheduled once. */
    boolean existsByFollowUpPlanIdAndOrigin(UUID followUpPlanId, String origin);

    Optional<FollowUpContact> findByIdAndCaseId(UUID id, UUID caseId);
}
