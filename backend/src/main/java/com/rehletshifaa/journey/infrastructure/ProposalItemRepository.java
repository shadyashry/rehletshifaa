package com.rehletshifaa.journey.infrastructure;

import com.rehletshifaa.journey.domain.ProposalItem;
import com.rehletshifaa.shared.persistence.BaseRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.math.BigDecimal;
import java.util.UUID;

public interface ProposalItemRepository extends BaseRepository<ProposalItem, UUID> {
    interface ItemRow { UUID getId(); String getCategory(); String getDescription(); BigDecimal getQuantity(); BigDecimal getUnitPrice(); Boolean getOptionalItem(); }

    /** The lines of one proposal version, in document order. */
    @Query("""
            select i.id as id, i.category as category, i.description as description, i.quantity as quantity, i.unitPrice as unitPrice,
                i.optional as optionalItem
            from ProposalItem i where i.proposalVersionId = :versionId order by i.sortOrder, i.id""")
    java.util.List<ItemRow> findRowsOf(@Param("versionId") UUID versionId);

    /** A line with its EGP prices: what Finance approves (QA #19) and what the patient's totals are summed from (QA #12). */
    interface PricedRow {
        UUID getId(); String getDescription(); String getSource(); BigDecimal getQuantity(); BigDecimal getUnitPrice(); Boolean getOptionalItem();
        BigDecimal getUnitPriceEgp(); BigDecimal getProviderPriceEgp(); BigDecimal getUnitPriceMinEgp(); BigDecimal getUnitPriceMaxEgp(); UUID getFacilityPackageId();
    }

    @Query("""
            select i.id as id, i.description as description, i.source as source, i.quantity as quantity, i.unitPrice as unitPrice,
                i.optional as optionalItem, i.unitPriceEgp as unitPriceEgp, i.providerPriceEgp as providerPriceEgp,
                i.unitPriceMinEgp as unitPriceMinEgp, i.unitPriceMaxEgp as unitPriceMaxEgp, i.facilityPackageId as facilityPackageId
            from ProposalItem i where i.proposalVersionId = :versionId order by i.sortOrder, i.id""")
    java.util.List<PricedRow> findPricedRowsOf(@Param("versionId") UUID versionId);

    boolean existsByIdAndProposalVersionIdAndOptionalTrue(UUID id, UUID proposalVersionId);

    java.util.List<ProposalItem> findByProposalVersionId(UUID proposalVersionId);

    /**
     * Fixes the display unit prices at the release rate (EGP-priced lines only). Computed in Java: a JPQL {@code round(unitPriceEgp * :rate, 2)}
     * binds the rate as a scale-2 decimal on H2, so a rate such as 0.0204 priced the lines at 0.02 (found in P1-10).
     */
    default int priceAt(UUID versionId, BigDecimal rate) {
        var lines = findByProposalVersionId(versionId);
        lines.forEach(line -> line.priceAt(rate));
        saveAllAndFlush(lines);
        return lines.size();
    }
}
