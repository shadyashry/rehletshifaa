package com.rehletshifaa.identity.reconciliation;

import com.rehletshifaa.shared.persistence.BaseRepository;
import org.springframework.data.domain.Limit;
import org.springframework.data.jpa.repository.Query;

import java.util.List;
import java.util.UUID;

interface IdentityReconciliationRunRepository extends BaseRepository<IdentityReconciliationRun, UUID> {
    @Query("select r from IdentityReconciliationRun r order by r.startedAt desc")
    List<IdentityReconciliationRun> findNewest(Limit limit);
}
