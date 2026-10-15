package com.rehletshifaa.journey.infrastructure;

import com.rehletshifaa.journey.domain.ChangeOrder;
import com.rehletshifaa.shared.persistence.BaseRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.math.BigDecimal;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

/** Change orders (P1-16). */
public interface ChangeOrderRepository extends BaseRepository<ChangeOrder, UUID> {
    /** The case's change orders, oldest first. */
    List<ChangeOrder> findByCaseIdOrderBySeqNoAsc(UUID caseId);

    Optional<ChangeOrder> findByIdAndCaseId(UUID id, UUID caseId);

    Optional<ChangeOrder> findFirstByCaseIdOrderBySeqNoDesc(UUID caseId);

    boolean existsByCaseIdAndStatusIn(UUID caseId, Collection<String> statuses);

    /** The priced total of the case's orders that count (accepted, or done in an emergency); zero when none. */
    @Query("select coalesce(sum(o.totalEgp), 0) from ChangeOrder o where o.caseId = :caseId and o.status in ('ACCEPTED', 'EMERGENCY') and o.totalEgp is not null")
    BigDecimal sumCounted(@Param("caseId") UUID caseId);
}
