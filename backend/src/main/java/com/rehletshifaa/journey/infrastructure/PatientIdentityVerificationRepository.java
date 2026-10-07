package com.rehletshifaa.journey.infrastructure;

import com.rehletshifaa.journey.domain.PatientIdentityVerification;
import com.rehletshifaa.shared.persistence.BaseRepository;
import org.springframework.data.domain.Limit;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface PatientIdentityVerificationRepository extends BaseRepository<PatientIdentityVerification, UUID> {
    /** What the patient and a reviewer see of a check: never the encrypted name/date of birth or the provider reference. */
    interface Row {
        UUID getId(); String getSubjectType(); String getStatus(); String getAssuranceLevel(); String getMethod(); String getProvider();
        String getNationality(); String getDocumentType(); String getIssuingCountry(); String getDocumentReferenceMasked();
        Instant getRequestedAt(); Instant getVerifiedAt(); Instant getExpiresAt(); String getRejectionReason(); Long getVersion();
    }

    String ROW = """
            select v.id as id, v.subjectType as subjectType, v.status as status, v.assuranceLevel as assuranceLevel,
                v.method as method, v.provider as provider, v.nationality as nationality, v.documentType as documentType,
                v.issuingCountry as issuingCountry, v.documentReferenceMasked as documentReferenceMasked,
                v.requestedAt as requestedAt, v.verifiedAt as verifiedAt, v.expiresAt as expiresAt,
                v.rejectionReason as rejectionReason, v.version as version
            from PatientIdentityVerification v
            """;

    @Query(ROW + "where v.id = :id")
    Optional<Row> findRow(@Param("id") UUID id);

    /** The patient's checks, newest first (use with {@code Limit.of(1)} for the latest). */
    @Query(ROW + "where v.patientId = :patientId order by v.createdAt desc")
    List<Row> findNewestRowsOf(@Param("patientId") UUID patientId, Limit limit);

    /** Checks waiting for a reviewer, oldest request first. */
    @Query(ROW + "where v.status in ('PENDING', 'MANUAL_REVIEW') order by v.requestedAt")
    List<Row> findAwaitingReviewRows();

    /** A reviewer's decision target: its status, its onboarding and that onboarding's case (both null without one). */
    interface ReviewTarget { UUID getOnboardingId(); String getStatus(); UUID getCaseId(); }

    @Query("""
            select v.onboardingId as onboardingId, v.status as status, o.caseId as caseId
            from PatientIdentityVerification v left join PatientOnboarding o on o.id = v.onboardingId
            where v.id = :id""")
    Optional<ReviewTarget> findReviewTarget(@Param("id") UUID id);

    /** Patient merge: rows of the folded patient move to the surviving one. */
    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("update PatientIdentityVerification x set x.patientId = :into where x.patientId = :from")
    int moveToPatient(@Param("from") UUID from, @Param("into") UUID into);

    /** The patient holds a verified identity check that has not expired. */
    @Query("select count(v) > 0 from PatientIdentityVerification v where v.patientId = :patientId and v.status = 'VERIFIED' and (v.expiresAt is null or v.expiresAt > :now)")
    boolean hasCurrentVerified(@Param("patientId") UUID patientId, @Param("now") Instant now);

    /** The case's patient has an identity check waiting for the provider or a reviewer. */
    @Query("""
            select count(v) > 0 from PatientIdentityVerification v, MedicalCase c
            where c.id = :caseId and v.patientId = c.patientId and v.status in ('PENDING', 'MANUAL_REVIEW')""")
    boolean isUnderReviewForCase(@Param("caseId") UUID caseId);

    /** A reviewer decides a pending check; an assurance level left out keeps the provider's. */
    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("""
            update PatientIdentityVerification v set v.status = :status, v.assuranceLevel = coalesce(cast(:assurance as String), v.assuranceLevel),
                v.reviewedBy = :reviewer, v.verifiedAt = :verifiedAt, v.expiresAt = :expiresAt, v.rejectionReason = :reason, v.updatedAt = :now,
                v.version = v.version + 1
            where v.id = :id and v.status in ('PENDING', 'MANUAL_REVIEW')""")
    int decide(@Param("id") UUID id, @Param("status") String status, @Param("assurance") String assurance, @Param("reviewer") String reviewer,
               @Param("verifiedAt") Instant verifiedAt, @Param("expiresAt") Instant expiresAt, @Param("reason") String reason,
               @Param("now") Instant now);
}
