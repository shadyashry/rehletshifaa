package com.rehletshifaa.journey.infrastructure;

import com.rehletshifaa.journey.domain.JourneyDefinition;
import com.rehletshifaa.shared.persistence.BaseRepository;

import java.util.UUID;

public interface JourneyDefinitionRepository extends BaseRepository<JourneyDefinition, UUID> {
}
