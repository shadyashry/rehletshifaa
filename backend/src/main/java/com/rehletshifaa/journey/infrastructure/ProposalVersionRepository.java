package com.rehletshifaa.journey.infrastructure;

import com.rehletshifaa.journey.domain.ProposalVersion;
import com.rehletshifaa.shared.persistence.BaseRepository;
import com.rehletshifaa.shared.util.PatientNameParts;
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
    interface FxSnapshot { String getCurrency(); BigDecimal getFxRate(); LocalDate getFxRateDate(); String getFxSource(); BigDecimal getPatientTotalExpectedEgp(); }

    @Query("""
            select v.currency as currency, v.fxRate as fxRate, v.fxRateDate as fxRateDate, v.fxSource as fxSource,
                v.patientTotalExpectedEgp as patientTotalExpectedEgp
            from ProposalVersion v where v.id = :id""")
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
        Instant getReleasedAt(); Boolean getAboveEstimateMaximum(); String getFxReapprovalStatus();
    }

    @Query("""
            select v.proposalId as proposalId, v.id as id, v.versionNumber as versionNumber, v.status as status, v.language as language,
                v.currency as currency, v.validUntil as validUntil, v.operationalPlan as operationalPlan, v.includedServices as includedServices,
                v.excludedServices as excludedServices, v.paymentTerms as paymentTerms, v.refundTerms as refundTerms,
                v.disclaimers as disclaimers, v.coordinatorNotes as coordinatorNotes, v.documentType as documentType,
                v.scopeChangeReason as scopeChangeReason, v.releasedAt as releasedAt, v.aboveEstimateMaximum as aboveEstimateMaximum,
                v.fxReapprovalStatus as fxReapprovalStatus
            from ProposalVersion v where v.id = :id""")
    java.util.Optional<DocumentRow> findDocument(@Param("id") UUID id);

    /** What the patient's secure view adds to the document: case, patient, clinical recommendation, totals and rate snapshot. */
    interface PatientDocument extends PatientNameParts {
        String getCaseNumber(); String getDocumentType(); Integer getVersionNumber(); String getCurrency();
        Instant getValidUntil(); String getRecommendedTreatment(); String getRisksAndLimitations(); String getAssumptions();
        String getScopeChangeReason(); String getPaymentTerms(); String getRefundTerms(); String getDisclaimers(); String getIncludedServices();
        String getExcludedServices(); BigDecimal getPatientTotalMinEgp(); BigDecimal getPatientTotalExpectedEgp();
        BigDecimal getPatientTotalMaxEgp(); BigDecimal getFxRate(); LocalDate getFxRateDate(); String getConsultantName(); Instant getReleasedAt();
    }

    @Query("""
            select c.caseNumber as caseNumber, pt.givenName as givenName, pt.familyName as familyName,
                v.documentType as documentType, v.versionNumber as versionNumber, v.currency as currency, v.validUntil as validUntil,
                cr.recommendedTreatment as recommendedTreatment, cr.risksAndLimitations as risksAndLimitations, v.assumptions as assumptions,
                v.scopeChangeReason as scopeChangeReason, v.paymentTerms as paymentTerms, v.refundTerms as refundTerms,
                v.disclaimers as disclaimers, v.includedServices as includedServices, v.excludedServices as excludedServices,
                v.patientTotalMinEgp as patientTotalMinEgp, v.patientTotalExpectedEgp as patientTotalExpectedEgp,
                v.patientTotalMaxEgp as patientTotalMaxEgp, v.fxRate as fxRate, v.fxRateDate as fxRateDate, pp.displayName as consultantName, v.releasedAt as releasedAt
            from ProposalVersion v join Proposal pr on pr.id = v.proposalId join MedicalCase c on c.id = pr.caseId
                left join PatientProfile pt on pt.id = c.patientId
                left join ClinicalReviewVersion cr on cr.id = v.clinicalReviewId left join PractitionerProfile pp on pp.id = cr.practitionerId
            where v.id = :id""")
    java.util.Optional<PatientDocument> findPatientDocument(@Param("id") UUID id);

    /** A version's commercial calculation and the margin policy it was made under (QA #19, Finance only). */
    interface Commercial {
        UUID getId(); String getCurrency(); BigDecimal getFxRate(); LocalDate getFxRateDate(); Boolean getRequiresFinanceApproval();
        BigDecimal getProviderNetEgp(); BigDecimal getMarginRate(); BigDecimal getMarginAmountEgp(); BigDecimal getPatientTotalExpectedEgp();
        Integer getCommercialPolicyVersion(); String getPolicyName(); String getPolicyCareArea();
    }

    @Query("""
            select v.id as id, v.currency as currency, v.fxRate as fxRate, v.fxRateDate as fxRateDate,
                v.requiresFinanceApproval as requiresFinanceApproval, v.providerNetEgp as providerNetEgp, v.marginRate as marginRate,
                v.marginAmountEgp as marginAmountEgp, v.patientTotalExpectedEgp as patientTotalExpectedEgp,
                v.commercialPolicyVersion as commercialPolicyVersion, cp.name as policyName, cp.careCategory as policyCareArea
            from ProposalVersion v left join CommercialPolicy cp on cp.id = v.commercialPolicyId
            where v.id = :id""")
    java.util.Optional<Commercial> findCommercial(@Param("id") UUID id);

    /** The expected patient total (EGP) of the case's latest preliminary estimate: what the deposit is a share of (W-1). */
    @Query("""
            select v.currency as currency, v.fxRate as fxRate, v.fxRateDate as fxRateDate, v.fxSource as fxSource,
                v.patientTotalExpectedEgp as patientTotalExpectedEgp
            from ProposalVersion v join Proposal p on p.id = v.proposalId
            where p.caseId = :caseId and v.documentType = 'PRELIMINARY_ESTIMATE' and v.patientTotalExpectedEgp is not null
            order by v.versionNumber desc""")
    List<FxSnapshot> findLatestEstimate(@Param("caseId") UUID caseId, org.springframework.data.domain.Limit limit);

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

    /** When the version was sent to the patient; empty before release. */
    @Query("select v.releasedAt from ProposalVersion v where v.id = :id")
    java.util.Optional<Instant> findReleasedAt(@Param("id") UUID id);

    /** P1-15: what an admission voucher prices: an accepted version's EGP figures and its frozen rate. */
    interface VoucherBasis {
        UUID getId(); String getDocumentType(); String getCurrency(); BigDecimal getProviderNetEgp(); BigDecimal getMarginAmountEgp();
        BigDecimal getTaxEgp(); BigDecimal getFxRate(); LocalDate getFxRateDate();
    }

    /**
     * The case's accepted versions, the final quote first (FINAL_TREATMENT_QUOTE sorts before PRELIMINARY_ESTIMATE), newest
     * first within each; pass {@code Limit.of(1)} for the one a voucher prices.
     */
    @Query("""
            select v.id as id, v.documentType as documentType, v.currency as currency, v.providerNetEgp as providerNetEgp,
                v.marginAmountEgp as marginAmountEgp, v.taxEgp as taxEgp, v.fxRate as fxRate, v.fxRateDate as fxRateDate
            from ProposalVersion v join Proposal p on p.id = v.proposalId
            where p.caseId = :caseId and v.status = 'ACCEPTED'
            order by v.documentType asc, v.versionNumber desc""")
    List<VoucherBasis> findAcceptedBases(@Param("caseId") UUID caseId, org.springframework.data.domain.Limit limit);

    /** P1-15: the highest provider (medical, non-optional) EGP total of a version: what a hospital's quoted package is checked against. */
    @Query("""
            select coalesce(sum(i.quantity * coalesce(i.unitPriceMaxEgp, i.unitPriceEgp)), 0) from ProposalItem i
            where i.proposalVersionId = :versionId and i.category = 'MEDICAL' and i.optional = false""")
    BigDecimal providerMaximumEgp(@Param("versionId") UUID versionId);

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

    /**
     * P1-10 (A-08): the maximum EGP total of the estimate the patient accepted, latest first; the cap of a final quote. A case without
     * an accepted estimate (data entered outside the journey) is capped by its latest estimate instead ({@link #findLatestEstimateMaximum}).
     */
    @Query("""
            select v.patientTotalMaxEgp from ProposalVersion v join Proposal p on p.id = v.proposalId
            where p.caseId = :caseId and v.documentType = 'PRELIMINARY_ESTIMATE' and v.status = 'ACCEPTED' and v.patientTotalMaxEgp is not null
            order by v.versionNumber desc""")
    List<BigDecimal> findAcceptedEstimateMaximum(@Param("caseId") UUID caseId, org.springframework.data.domain.Limit limit);

    @Query("""
            select v.patientTotalMaxEgp from ProposalVersion v join Proposal p on p.id = v.proposalId
            where p.caseId = :caseId and v.documentType = 'PRELIMINARY_ESTIMATE' and v.patientTotalMaxEgp is not null
            order by v.versionNumber desc""")
    List<BigDecimal> findLatestEstimateMaximum(@Param("caseId") UUID caseId, org.springframework.data.domain.Limit limit);

    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("update ProposalVersion v set v.aboveEstimateMaximum = true where v.id = :id")
    int markAboveEstimateMaximum(@Param("id") UUID id);

    /** P1-10: what decides whether a released final quote may be accepted now (cooling period, FX band). */
    interface AcceptanceTerms {
        String getCurrency(); BigDecimal getFxRate(); Instant getReleasedAt(); Boolean getAboveEstimateMaximum(); String getFxReapprovalStatus();
        BigDecimal getFxReapprovalRate();
    }

    @Query("""
            select v.currency as currency, v.fxRate as fxRate, v.releasedAt as releasedAt, v.aboveEstimateMaximum as aboveEstimateMaximum,
                v.fxReapprovalStatus as fxReapprovalStatus, v.fxReapprovalRate as fxReapprovalRate
            from ProposalVersion v where v.id = :id""")
    java.util.Optional<AcceptanceTerms> findAcceptanceTerms(@Param("id") UUID id);

    /** P1-10 (B-05): validity is fixed at release: the policy's days from release, or the coordinator's earlier date. */
    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("update ProposalVersion v set v.validUntil = :until where v.id = :id")
    int limitValidity(@Param("id") UUID id, @Param("until") Instant until);

    /** P1-10 (B-05): an acceptance outside the FX band opens one Finance re-approval; a pending or confirmed one is left as it is. */
    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("""
            update ProposalVersion v set v.fxReapprovalStatus = 'PENDING', v.fxReapprovalRate = :rate, v.fxReapprovalRequestedAt = :now,
                v.fxReapprovalDecidedBy = null, v.fxReapprovalDecidedAt = null
            where v.id = :id and v.fxReapprovalStatus is null and v.status in ('RELEASED', 'VIEWED')""")
    int requestFxReapproval(@Param("id") UUID id, @Param("rate") BigDecimal rate, @Param("now") Instant now);

    /** Finance keeps the frozen rate: acceptance then proceeds at it without a new band check. */
    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("""
            update ProposalVersion v set v.fxReapprovalStatus = 'CONFIRMED', v.fxReapprovalDecidedBy = :by, v.fxReapprovalDecidedAt = :now
            where v.id = :id and v.fxReapprovalStatus = 'PENDING' and v.status in ('RELEASED', 'VIEWED')""")
    int confirmFxRate(@Param("id") UUID id, @Param("by") String by, @Param("now") Instant now);

    /** Finance re-releases at the day's rate: a new snapshot and document; the request is answered (status cleared). */
    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("""
            update ProposalVersion v set v.fxRate = :fxRate, v.fxRateDate = :fxDate, v.fxSource = 'SNAPSHOT', v.htmlSnapshot = :html,
                v.fxReapprovalStatus = null, v.fxReapprovalDecidedBy = :by, v.fxReapprovalDecidedAt = :now
            where v.id = :id and v.fxReapprovalStatus = 'PENDING' and v.status in ('RELEASED', 'VIEWED')""")
    int repriceAtRate(@Param("id") UUID id, @Param("fxRate") BigDecimal fxRate, @Param("fxDate") LocalDate fxDate, @Param("html") String html,
                      @Param("by") String by, @Param("now") Instant now);

    /** A released (or viewed) version past its validity, with its case. */
    interface Expiring { UUID getVersionId(); UUID getCaseId(); String getDocumentType(); }

    @Query("""
            select v.id as versionId, p.caseId as caseId, v.documentType as documentType from ProposalVersion v join Proposal p on p.id = v.proposalId
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
