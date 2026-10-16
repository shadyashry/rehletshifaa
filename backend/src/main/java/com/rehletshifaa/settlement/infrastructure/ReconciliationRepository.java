package com.rehletshifaa.settlement.infrastructure;

import com.rehletshifaa.settlement.domain.Reconciliation;
import com.rehletshifaa.shared.persistence.BaseRepository;

import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;
import java.util.Optional;
import java.util.UUID;

/** Reconciliations (P1-17): one per case. */
public interface ReconciliationRepository extends BaseRepository<Reconciliation, UUID> {
    Optional<Reconciliation> findByCaseId(UUID caseId);

    /**
     * P1-19 (design §7.5): the facility's reconciliations settled in [from, to) whose final invoice carried at least one unapproved
     * extra (each case counts once, however many extra lines it had).
     */
    @Query("""
            select count(distinct r.id) from Reconciliation r join com.rehletshifaa.journey.domain.FacilityAdmission a on a.caseId = r.caseId
            where a.facilityId = :facilityId and a.status <> 'CANCELLED' and r.settledAt >= :from and r.settledAt < :to
            and exists (select 1 from ReconciliationLine l where l.reconciliationId = r.id and l.varianceCode = 'UNAPPROVED_EXTRA')""")
    long countSettledWithUnapprovedExtras(@Param("facilityId") UUID facilityId, @Param("from") Instant from, @Param("to") Instant to);
}
