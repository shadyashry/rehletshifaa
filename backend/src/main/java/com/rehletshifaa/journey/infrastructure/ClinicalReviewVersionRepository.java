package com.rehletshifaa.journey.infrastructure;

import com.rehletshifaa.journey.domain.ClinicalReviewVersion;
import com.rehletshifaa.shared.persistence.BaseRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;
import java.util.UUID;

public interface ClinicalReviewVersionRepository extends BaseRepository<ClinicalReviewVersion, UUID> {
    /** A review as the case page lists it. */
    interface ReviewRow {
        UUID getId(); Integer getVersionNumber(); String getStatus(); String getSuitability(); String getRecommendedTreatment();
        String getRisksAndLimitations(); String getProposalCurrency(); Instant getCreatedAt();
    }

    @Query("""
            select r.id as id, r.versionNumber as versionNumber, r.status as status, r.suitability as suitability,
                r.recommendedTreatment as recommendedTreatment, r.risksAndLimitations as risksAndLimitations,
                r.proposalCurrency as proposalCurrency, r.createdAt as createdAt
            from ClinicalReviewVersion r where r.caseId = :caseId order by r.versionNumber desc""")
    java.util.List<ReviewRow> findRowsOf(@Param("caseId") UUID caseId);

    @Query("select coalesce(max(r.versionNumber), 0) + 1 from ClinicalReviewVersion r where r.caseId = :caseId")
    int nextVersionNumber(@Param("caseId") UUID caseId);

    boolean existsByIdAndCaseIdAndStatus(UUID id, UUID caseId, String status);

    @Query("select r.proposalCurrency from ClinicalReviewVersion r where r.id = :id")
    java.util.Optional<String> findProposalCurrency(@Param("id") UUID id);

    /** The currency the case's latest review with one was prepared in (pass {@code Limit.of(1)}). */
    @Query("select r.proposalCurrency from ClinicalReviewVersion r where r.caseId = :caseId and r.proposalCurrency is not null order by r.versionNumber desc")
    java.util.List<String> findLatestProposalCurrency(@Param("caseId") UUID caseId, org.springframework.data.domain.Limit limit);

    /** A new decision supersedes the case reviews still in force (drafts and the approved one). */
    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("update ClinicalReviewVersion r set r.status = 'SUPERSEDED' where r.caseId = :caseId and r.status in ('DRAFT', 'APPROVED')")
    int supersedeCurrent(@Param("caseId") UUID caseId);

    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("update ClinicalReviewVersion r set r.status = 'SUPERSEDED' where r.caseId = :caseId and r.status = 'DRAFT'")
    int supersedeDrafts(@Param("caseId") UUID caseId);

    /** The consultant approves their own draft. */
    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("""
            update ClinicalReviewVersion r set r.status = 'APPROVED', r.approvedBy = :by, r.approvedAt = :now
            where r.id = :id and r.caseId = :caseId and r.practitionerId = :practitionerId and r.status = 'DRAFT'""")
    int approve(@Param("id") UUID id, @Param("caseId") UUID caseId, @Param("practitionerId") UUID practitionerId, @Param("by") String by,
                @Param("now") Instant now);

    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("update ClinicalReviewVersion r set r.status = 'SUPERSEDED' where r.caseId = :caseId and r.id <> :keep and r.status = 'APPROVED'")
    int supersedeOtherApproved(@Param("caseId") UUID caseId, @Param("keep") UUID keep);
}
