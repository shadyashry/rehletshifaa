package com.rehletshifaa.coordination.infrastructure;

import com.rehletshifaa.coordination.domain.CoordinationRoutingLock;
import com.rehletshifaa.shared.persistence.BaseRepository;

public interface CoordinationRoutingLockRepository extends BaseRepository<CoordinationRoutingLock, Integer> {
    /** Blocks until this transaction holds the routing lock; released at commit or rollback. */
    default void acquire() {
        lockById(CoordinationRoutingLock.ID).orElseThrow(() -> new IllegalStateException("coordination_routing_lock row is missing"));
    }
}
