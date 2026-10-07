package com.rehletshifaa.journey.infrastructure;

import com.rehletshifaa.journey.domain.ProposalVersion;
import com.rehletshifaa.shared.persistence.BaseRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.Collection;
import java.util.List;
import java.util.UUID;

/** Proposal version steps, each guarded by the statuses it may move from. */
public interface ProposalVersionRepository extends BaseRepository<ProposalVersion, UUID> {
    /** What the patient may see of a version: its identity, terms window and when it was decided. */
    interface PatientFacing {
        UUID getId(); int getVersionNumber(); String getStatus(); String getDocumentType(); String getCurrency();
        Instant getValidUntil(); Instant getReleasedAt(); Instant getDecidedAt();
    }

    /** The latest version of the case proposal first (page size 1 for the current one). */
    @Query("""
            select v.id as id, v.versionNumber as versionNumber, v.status as status, v.documentType as documentType, v.currency as currency,
                v.validUntil as validUntil, v.releasedAt as releasedAt,
                (select max(d.createdAt) from ProposalDecision d where d.proposalVersionId = v.id) as decidedAt
            from ProposalVersion v join Proposal p on p.id = v.proposalId where p.caseId = :caseId order by v.versionNumber desc""")
    List<PatientFacing> latestForCase(@Param("caseId") UUID caseId, org.springframework.data.domain.Pageable page);

    /** The currency and exchange-rate snapshot a version was released at. */
    interface FxSnapshot { String getCurrency(); BigDecimal getFxRate(); LocalDate getFxRateDate(); String getFxSource(); }

    @Query("select v.currency as currency, v.fxRate as fxRate, v.fxRateDate as fxRateDate, v.fxSource as fxSource from ProposalVersion v where v.id = :id")
    java.util.Optional<FxSnapshot> findFxSnapshot(@Param("id") UUID id);

    /** Where a version stands in internal approval before release. */
    interface ApprovalGates {
        String getStatus(); Boolean getRequiresFinanceApproval(); Instant getOperationsCompletedAt(); Instant getFinanceApprovedAt();
        String getDocumentType();
    }

    /** The approval gates of the case proposal's versions, latest first (pass {@code Limit.of(1)} for the current one). */
    @Query("""
            select v.status as status, v.requiresFinanceApproval as requiresFinanceApproval, v.operationsCompletedAt as operationsCompletedAt,
                v.financeApprovedAt as financeApprovedAt, v.documentType as documentType
            from ProposalVersion v join Proposal p on p.id = v.proposalId where p.caseId = :caseId order by v.versionNumber desc""")
    List<ApprovalGates> findApprovalGates(@Param("caseId") UUID caseId, org.springframework.data.domain.Limit limit);

    @Query("""
            select v.status as status, v.requiresFinanceApproval as requiresFinanceApproval, v.operationsCompletedAt as operationsCompletedAt,
                v.financeApprovedAt as financeApprovedAt, v.documentType as documentType
            from ProposalVersion v where v.id = :id""")
    java.util.Optional<ApprovalGates> findApprovalGatesOf(@Param("id") UUID id);

    /** A version as the staff and patient views render it (without its lines). */
    interface DocumentRow {
        UUID getProposalId(); UUID getId(); Integer getVersionNumber(); String getStatus(); String getLanguage(); String getCurrency();
        Instant getValidUntil(); String getOperationalPlan(); String getIncludedServices(); String getExcludedServices(); String getPaymentTerms();
        String getRefundTerms(); String getDisclaimers(); String getCoordinatorNotes(); String getDocumentType(); String getScopeChangeReason();
    }

    @Query("""
            select v.proposalId as proposalId, v.id as id, v.versionNumber as versionNumber, v.status as status, v.language as language,
                v.currency as currency, v.validUntil as validUntil, v.operationalPlan as operationalPlan, v.includedServices as includedServices,
                v.excludedServices as excludedServices, v.paymentTerms as paymentTerms, v.refundTerms as refundTerms,
                v.disclaimers as disclaimers, v.coordinatorNotes as coordinatorNotes, v.documentType as documentType,
                v.scopeChangeReason as scopeChangeReason
            from ProposalVersion v where v.id = :id""")
    java.util.Optional<DocumentRow> findDocument(@Param("id") UUID id);

    /** What the patient's secure view adds to the document: case, patient, clinical recommendation, totals and rate snapshot. */
    interface PatientDocument {
        String getCaseNumber(); String getPatientName(); String getDocumentType(); Integer getVersionNumber(); String getCurrency();
        Instant getValidUntil(); String getRecommendedTreatment(); String getRisksAndLimitations(); String getAssumptions();
        String getScopeChangeReason(); String getPaymentTerms(); String getRefundTerms(); String getDisclaimers(); String getIncludedServices();
        String getExcludedServices(); BigDecimal getPatientTotalMinEgp(); BigDecimal getPatientTotalExpectedEgp();
        BigDecimal getPatientTotalMaxEgp(); BigDecimal getFxRate(); LocalDate getFxRateDate(); String getConsultantName();
    }

    @Query("""
            select c.caseNumber as caseNumber, trim(concat(pt.givenName, ' ', coalesce(pt.familyName, ''))) as patientName,
                v.documentType as documentType, v.versionNumber as versionNumber, v.currency as currency, v.validUntil as validUntil,
                cr.recommendedTreatment as recommendedTreatment, cr.risksAndLimitations as risksAndLimitations, v.assumptions as assumptions,
                v.scopeChangeReason as scopeChangeReason, v.paymentTerms as paymentTerms, v.refundTerms as refundTerms,
                v.disclaimers as disclaimers, v.includedServices as includedServices, v.excludedServices as excludedServices,
                v.patientTotalMinEgp as patientTotalMinEgp, v.patientTotalExpectedEgp as patientTotalExpectedEgp,
                v.patientTotalMaxEgp as patientTotalMaxEgp, v.fxRate as fxRate, v.fxRateDate as fxRateDate, pp.displayName as consultantName
            from ProposalVersion v join Proposal pr on pr.id = v.proposalId join MedicalCase c on c.id = pr.caseId
                left join PatientProfile pt on pt.id = c.patientId
                left join ClinicalReviewVersion cr on cr.id = v.clinicalReviewId left join PractitionerProfile pp on pp.id = cr.practitionerId
            where v.id = :id""")
    java.util.Optional<PatientDocument> findPatientDocument(@Param("id") UUID id);

    /** The case's versions, latest first (pass {@code Limit.of(1)} for the current one). */
    @Query("select v.id from ProposalVersion v join Proposal p on p.id = v.proposalId where p.caseId = :caseId order by v.versionNumber desc")
    List<UUID> findLatestIdOf(@Param("caseId") UUID caseId, org.springframework.data.domain.Limit limit);

    /** The case's versions in one of the statuses, latest first (pass {@code Limit.of(1)} for the current one). */
    @Query("""
            select v.id from ProposalVersion v join Proposal p on p.id = v.proposalId where p.caseId = :caseId and v.status in :statuses
            order by v.versionNumber desc""")
    List<UUID> findLatestIdOf(@Param("caseId") UUID caseId, @Param("statuses") Collection<String> statuses,
                              org.springframework.data.domain.Limit limit);

    @Query("select count(v) > 0 from ProposalVersion v join Proposal p on p.id = v.proposalId where v.id = :id and p.caseId = :caseId")
    boolean belongsToCase(@Param("id") UUID id, @Param("caseId") UUID caseId);

    /** The commercial policy rate locked on the case's latest preliminary estimate. */
    interface LockedMargin { BigDecimal getMarginRate(); UUID getCommercialPolicyId(); Integer getCommercialPolicyVersion(); }

    @Query("""
            select v.marginRate as marginRate, v.commercialPolicyId as commercialPolicyId, v.commercialPolicyVersion as commercialPolicyVersion
            from ProposalVersion v join Proposal p on p.id = v.proposalId
            where p.caseId = :caseId and v.documentType = 'PRELIMINARY_ESTIMATE' and v.marginRate is not null
            order by v.versionNumber desc""")
    List<LockedMargin> findLockedMargin(@Param("caseId") UUID caseId, org.springframework.data.domain.Limit limit);

    /** The case's latest final treatment quote that is not superseded (pass {@code Limit.of(1)}). */
    @Query("""
            select v.id from ProposalVersion v join Proposal p on p.id = v.proposalId
            where p.caseId = :caseId and v.documentType = 'FINAL_TREATMENT_QUOTE' and v.status <> 'SUPERSEDED'
            order by v.versionNumber desc""")
    List<UUID> findLatestLiveFinalQuote(@Param("caseId") UUID caseId, org.springframework.data.domain.Limit limit);

    @Query("select count(v) > 0 from ProposalVersion v join Proposal p on p.id = v.proposalId where p.caseId = :caseId and v.status = 'ACCEPTED'")
    boolean hasAcceptedForCase(@Param("caseId") UUID caseId);

    /** A released (or viewed) version past its validity, with its case. */
    interface Expiring { UUID getVersionId(); UUID getCaseId(); }

    @Query("""
            select v.id as versionId, p.caseId as caseId from ProposalVersion v join Proposal p on p.id = v.proposalId
            where v.status in ('RELEASED', 'VIEWED') and v.validUntil is not null and v.validUntil <= :now""")
    List<Expiring> findExpiring(@Param("now") Instant now);

    /** A new version supersedes every live (in approval or released) version of the proposal. */
    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("""
            update ProposalVersion v set v.status = 'SUPERSEDED', v.supersededAt = :now
            where v.proposalId = :proposalId and v.status in ('RELEASED', 'VIEWED', 'REVISION_REQUESTED', 'EXPIRED', 'CLINICALLY_APPROVED',
                'OPERATIONS_COMPLETED', 'FINANCE_APPROVED')""")
    int supersedeLive(@Param("proposalId") UUID proposalId, @Param("now") Instant now);

    /** A new final quote supersedes the live final quotes only; the preliminary estimate stands. */
    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("""
            update ProposalVersion v set v.status = 'SUPERSEDED', v.supersededAt = :now
            where v.proposalId = :proposalId and v.documentType = 'FINAL_TREATMENT_QUOTE'
            and v.status in ('RELEASED', 'VIEWED', 'REVISION_REQUESTED', 'EXPIRED', 'CLINICALLY_APPROVED', 'FINANCE_APPROVED')""")
    int supersedeLiveFinalQuotes(@Param("proposalId") UUID proposalId, @Param("now") Instant now);

    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("""
            update ProposalVersion v set v.operationalPlan = :plan, v.status = 'OPERATIONS_COMPLETED', v.operationsCompletedBy = :by,
                v.operationsCompletedAt = :now
            where v.id = :id and v.status = 'CLINICALLY_APPROVED'""")
    int completeOperations(@Param("id") UUID id, @Param("plan") String plan, @Param("by") String by, @Param("now") Instant now);

    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("""
            update ProposalVersion v set v.status = 'FINANCE_APPROVED', v.financeApprovedBy = :by, v.financeApprovedAt = :now
            where v.id = :id and v.status in ('CLINICALLY_APPROVED', 'OPERATIONS_COMPLETED') and v.currency is not null""")
    int approveFinance(@Param("id") UUID id, @Param("by") String by, @Param("now") Instant now);

    /** Release fixes the HTML snapshot and the exchange-rate snapshot the patient sees. */
    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("""
            update ProposalVersion v set v.status = 'RELEASED', v.releasedBy = :by, v.releasedAt = :now, v.htmlSnapshot = :html,
                v.fxRate = :fxRate, v.fxRateDate = :fxDate, v.fxSource = :fxSource
            where v.id = :id and v.status in :from""")
    int release(@Param("id") UUID id, @Param("from") Collection<String> from, @Param("by") String by, @Param("html") String html,
                @Param("fxRate") BigDecimal fxRate, @Param("fxDate") LocalDate fxDate, @Param("fxSource") String fxSource,
                @Param("now") Instant now);

    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("update ProposalVersion v set v.status = 'VIEWED', v.viewedAt = :now where v.id = :id and v.status = 'RELEASED'")
    int markViewed(@Param("id") UUID id, @Param("now") Instant now);

    /** The patient's decision moves a released (or viewed) version to its outcome. */
    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("update ProposalVersion v set v.status = :status where v.id = :id and v.status in ('RELEASED', 'VIEWED')")
    int decide(@Param("id") UUID id, @Param("status") String status);

    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("update ProposalVersion v set v.status = 'EXPIRED' where v.id = :id and v.status in ('RELEASED', 'VIEWED')")
    int expire(@Param("id") UUID id);
}
