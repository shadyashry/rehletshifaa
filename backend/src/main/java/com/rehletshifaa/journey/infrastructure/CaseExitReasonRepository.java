package com.rehletshifaa.journey.infrastructure;

import com.rehletshifaa.journey.domain.CaseExitReason;
import com.rehletshifaa.shared.persistence.BaseRepository;

import java.util.Optional;
import java.util.UUID;

public interface CaseExitReasonRepository extends BaseRepository<CaseExitReason, UUID> {
    /** The most recent exit recorded on the case (a case re-opened from EXPIRED may exit again later). */
    Optional<CaseExitReason> findFirstByCaseIdOrderByRecordedAtDesc(UUID caseId);
}
