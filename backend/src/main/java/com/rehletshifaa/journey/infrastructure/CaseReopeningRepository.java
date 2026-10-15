package com.rehletshifaa.journey.infrastructure;

import com.rehletshifaa.journey.domain.CaseReopening;
import com.rehletshifaa.shared.persistence.BaseRepository;

import java.util.List;
import java.util.UUID;

public interface CaseReopeningRepository extends BaseRepository<CaseReopening, UUID> {
    List<CaseReopening> findByCaseIdOrderByReopenedAtDesc(UUID caseId);
}
