package com.rehletshifaa.journey.infrastructure;

import com.rehletshifaa.journey.domain.PatientAccountLinkRequest;
import com.rehletshifaa.shared.persistence.BaseRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;
import java.util.UUID;

public interface PatientAccountLinkRequestRepository extends BaseRepository<PatientAccountLinkRequest, UUID> {
    /** The account owner answered; a request is answered once. */
    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("""
            update PatientAccountLinkRequest r set r.consumedAt = :now, r.resolvedSubject = :subject, r.resolution = :resolution,
                r.relationship = :relationship, r.updatedAt = :now
            where r.id = :id and r.consumedAt is null""")
    int resolve(@Param("id") UUID id, @Param("subject") String subject, @Param("resolution") String resolution,
                @Param("relationship") String relationship, @Param("now") Instant now);

    /** A repeat request rotates the live request's token instead of adding another. */
    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("""
            update PatientAccountLinkRequest r set r.tokenHash = :tokenHash, r.expiresAt = :expiresAt, r.consumedAt = null, r.resolution = null,
                r.resolvedSubject = null, r.caseId = :caseId, r.origin = :origin, r.updatedAt = :now
            where r.patientId = :patientId and r.email = :email and r.consumedAt is null""")
    int rotate(@Param("patientId") UUID patientId, @Param("email") String email, @Param("tokenHash") String tokenHash,
               @Param("expiresAt") Instant expiresAt, @Param("caseId") UUID caseId, @Param("origin") String origin, @Param("now") Instant now);

    /** Patient merge: requests move to the surviving patient unless it already has one for the same email. */
    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("""
            update PatientAccountLinkRequest r set r.patientId = :into
            where r.patientId = :from and r.email not in (select x.email from PatientAccountLinkRequest x where x.patientId = :into)""")
    int moveToSurvivor(@Param("from") UUID from, @Param("into") UUID into);
}
