package com.rehletshifaa.journey.infrastructure;

import com.rehletshifaa.journey.domain.DepositComponent;
import com.rehletshifaa.shared.persistence.BaseRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.math.BigDecimal;
import java.util.List;
import java.util.UUID;

public interface DepositComponentRepository extends BaseRepository<DepositComponent, UUID> {
    interface Line {
        String getBeneficiary(); String getPurpose(); BigDecimal getAmountEgp(); String getRefundability(); String getCancellationTerms();
        Boolean getCreditedToFinal();
    }

    /** What the deposit pays for, in display order. */
    @Query("""
            select c.beneficiary as beneficiary, c.purpose as purpose, c.amountEgp as amountEgp, c.refundability as refundability,
                c.cancellationTerms as cancellationTerms, c.creditedToFinal as creditedToFinal
            from DepositComponent c where c.depositId = :depositId order by c.sortOrder""")
    List<Line> findLinesOf(@Param("depositId") UUID depositId);
}
