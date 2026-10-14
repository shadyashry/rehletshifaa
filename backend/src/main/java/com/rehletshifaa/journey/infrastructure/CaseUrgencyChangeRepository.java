package com.rehletshifaa.journey.infrastructure;

import com.rehletshifaa.journey.domain.CaseUrgencyChange;
import com.rehletshifaa.shared.persistence.BaseRepository;

import java.util.Optional;
import java.util.UUID;

public interface CaseUrgencyChangeRepository extends BaseRepository<CaseUrgencyChange, UUID> {
    /** The change that set the case's current level, with its reason. */
    Optional<CaseUrgencyChange> findFirstByCaseIdOrderBySetAtDesc(UUID caseId);
}
