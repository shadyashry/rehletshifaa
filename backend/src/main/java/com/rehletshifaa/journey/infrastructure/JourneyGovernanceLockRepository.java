package com.rehletshifaa.journey.infrastructure;

import com.rehletshifaa.journey.domain.JourneyGovernanceLock;
import com.rehletshifaa.shared.persistence.BaseRepository;

public interface JourneyGovernanceLockRepository extends BaseRepository<JourneyGovernanceLock, Integer> {
    /** Blocks until this transaction holds the journey governance lock; released at commit or rollback. */
    default void acquire() {
        lockById(JourneyGovernanceLock.ID).orElseThrow(() -> new IllegalStateException("journey_governance_lock row is missing"));
    }
}
