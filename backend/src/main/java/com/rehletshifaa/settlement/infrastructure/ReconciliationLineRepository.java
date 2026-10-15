package com.rehletshifaa.settlement.infrastructure;

import com.rehletshifaa.settlement.domain.ReconciliationLine;
import com.rehletshifaa.shared.persistence.BaseRepository;

import java.util.List;
import java.util.UUID;

/** The invoice lines of a reconciliation (P1-17); replaced as a whole on each submission. */
public interface ReconciliationLineRepository extends BaseRepository<ReconciliationLine, UUID> {
    List<ReconciliationLine> findByReconciliationIdOrderByLineNoAsc(UUID reconciliationId);

    void deleteByReconciliationId(UUID reconciliationId);
}
