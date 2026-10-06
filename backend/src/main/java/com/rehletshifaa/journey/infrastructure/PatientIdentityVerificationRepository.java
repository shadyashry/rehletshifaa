package com.rehletshifaa.journey.infrastructure;

import com.rehletshifaa.journey.domain.PatientIdentityVerification;
import com.rehletshifaa.shared.persistence.BaseRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;
import java.util.UUID;

public interface PatientIdentityVerificationRepository extends BaseRepository<PatientIdentityVerification, UUID> {
    /** Patient merge: rows of the folded patient move to the surviving one. */
    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("update PatientIdentityVerification x set x.patientId = :into where x.patientId = :from")
    int moveToPatient(@Param("from") UUID from, @Param("into") UUID into);

    /** The patient holds a verified identity check that has not expired. */
    @Query("select count(v) > 0 from PatientIdentityVerification v where v.patientId = :patientId and v.status = 'VERIFIED' and (v.expiresAt is null or v.expiresAt > :now)")
    boolean hasCurrentVerified(@Param("patientId") UUID patientId, @Param("now") Instant now);

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
