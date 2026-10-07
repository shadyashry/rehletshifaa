package com.rehletshifaa.journey.infrastructure;

import com.rehletshifaa.journey.domain.ClinicalReviewCostEstimate;
import com.rehletshifaa.shared.persistence.BaseRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.math.BigDecimal;
import java.util.List;
import java.util.UUID;

public interface ClinicalReviewCostEstimateRepository extends BaseRepository<ClinicalReviewCostEstimate, UUID> {
    /** An estimate line as the case page shows it under its review. */
    interface CaseEstimateRow { UUID getClinicalReviewId(); String getServiceDescription(); BigDecimal getEstimatedCost(); String getCurrency(); UUID getCatalogServiceId(); }

    /** The estimate lines of every review of the case, in their sort order. */
    @Query("""
            select e.clinicalReviewId as clinicalReviewId, e.serviceDescription as serviceDescription, e.estimatedCost as estimatedCost,
                e.currency as currency, e.catalogServiceId as catalogServiceId
            from ClinicalReviewCostEstimate e join ClinicalReviewVersion v on v.id = e.clinicalReviewId
            where v.caseId = :caseId order by e.sortOrder""")
    List<CaseEstimateRow> findRowsForCase(@Param("caseId") UUID caseId);

    /** An estimate line with the prices a proposal is calculated from. */
    interface PricedLine {
        String getServiceDescription(); BigDecimal getEstimatedCost(); String getCurrency(); UUID getCatalogServiceId(); BigDecimal getPriceEgp();
        BigDecimal getPriceEgpMin(); BigDecimal getPriceEgpMax(); Boolean getRequiresFinanceApproval();
    }

    @Query("""
            select e.serviceDescription as serviceDescription, e.estimatedCost as estimatedCost, e.currency as currency,
                e.catalogServiceId as catalogServiceId, e.priceEgp as priceEgp, e.priceEgpMin as priceEgpMin, e.priceEgpMax as priceEgpMax,
                e.requiresFinanceApproval as requiresFinanceApproval
            from ClinicalReviewCostEstimate e where e.clinicalReviewId = :reviewId order by e.sortOrder, e.id""")
    List<PricedLine> findPricedLinesOf(@Param("reviewId") UUID reviewId);
}
