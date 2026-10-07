package com.rehletshifaa.journey.infrastructure;

import com.rehletshifaa.journey.domain.TreatmentEpisode;
import com.rehletshifaa.shared.persistence.BaseRepository;

import java.util.UUID;

public interface TreatmentEpisodeRepository extends BaseRepository<TreatmentEpisode, UUID> {
    boolean existsByIdAndCaseId(UUID id, UUID caseId);
}
