package com.rehletshifaa.settlement.infrastructure;

import com.rehletshifaa.settlement.domain.Reconciliation;
import com.rehletshifaa.shared.persistence.BaseRepository;

import java.util.Optional;
import java.util.UUID;

/** Reconciliations (P1-17): one per case. */
public interface ReconciliationRepository extends BaseRepository<Reconciliation, UUID> {
    Optional<Reconciliation> findByCaseId(UUID caseId);
}
