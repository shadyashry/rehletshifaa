package com.rehletshifaa.journey.infrastructure;

import com.rehletshifaa.journey.domain.CaseOutcome;
import com.rehletshifaa.shared.persistence.BaseRepository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface CaseOutcomeRepository extends BaseRepository<CaseOutcome, UUID> {
    List<CaseOutcome> findByCaseIdOrderByRequestedAtAsc(UUID caseId);

    Optional<CaseOutcome> findByCaseIdAndPoint(UUID caseId, String point);

    /** A reported complication still waiting for the Consultant's review (holds the window and the closure). */
    boolean existsByCaseIdAndComplicationTrueAndReviewedAtIsNull(UUID caseId);

    /** An outcome question asked after {@code since} and not answered yet (the patient's REPORT_OUTCOME). */
    Optional<CaseOutcome> findFirstByCaseIdAndReportedAtIsNullAndRequestedAtAfterOrderByRequestedAtAsc(UUID caseId, java.time.Instant since);
}
