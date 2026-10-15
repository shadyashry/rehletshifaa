package com.rehletshifaa.journey.infrastructure;

import com.rehletshifaa.journey.domain.ChangeOrderLine;
import com.rehletshifaa.shared.persistence.BaseRepository;

import java.util.Collection;
import java.util.List;
import java.util.UUID;

/** Change-order lines (P1-16). */
public interface ChangeOrderLineRepository extends BaseRepository<ChangeOrderLine, UUID> {
    List<ChangeOrderLine> findByChangeOrderIdOrderByLineNoAsc(UUID changeOrderId);

    List<ChangeOrderLine> findByChangeOrderIdInOrderByLineNoAsc(Collection<UUID> changeOrderIds);
}
