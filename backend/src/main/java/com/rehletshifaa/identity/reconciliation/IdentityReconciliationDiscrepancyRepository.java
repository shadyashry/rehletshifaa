package com.rehletshifaa.identity.reconciliation;

import com.rehletshifaa.shared.persistence.BaseRepository;

import java.util.List;
import java.util.UUID;

interface IdentityReconciliationDiscrepancyRepository extends BaseRepository<IdentityReconciliationDiscrepancy, UUID> {
    List<IdentityReconciliationDiscrepancy> findByRunIdOrderBySubjectAscDiscrepancyTypeAscIdAsc(UUID runId);
}
