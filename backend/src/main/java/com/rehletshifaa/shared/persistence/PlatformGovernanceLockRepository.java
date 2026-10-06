package com.rehletshifaa.shared.persistence;

public interface PlatformGovernanceLockRepository extends BaseRepository<PlatformGovernanceLock, Integer> {
    /** Blocks until this transaction holds the governance lock; released at commit or rollback. */
    default void acquire() {
        lockById(PlatformGovernanceLock.ID).orElseThrow(() -> new IllegalStateException("platform_governance_lock row is missing"));
    }
}
