package com.rehletshifaa.journey.infrastructure;

import com.rehletshifaa.journey.domain.JourneyDeployment;
import com.rehletshifaa.shared.persistence.BaseRepository;

import java.util.UUID;

public interface JourneyDeploymentRepository extends BaseRepository<JourneyDeployment, UUID> {
}
