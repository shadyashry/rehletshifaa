package com.rehletshifaa.journey.infrastructure;

import com.rehletshifaa.journey.domain.ClinicalReviewVersion;
import com.rehletshifaa.shared.persistence.BaseRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;
import java.util.UUID;

public interface ClinicalReviewVersionRepository extends BaseRepository<ClinicalReviewVersion, UUID> {
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
