package com.rehletshifaa.journey.infrastructure;

import com.rehletshifaa.journey.domain.PatientAccountLinkRequest;
import com.rehletshifaa.shared.persistence.BaseRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import org.springframework.data.domain.Limit;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
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

    /** A request as its continuation link resolves it; expiry and ownership are checked by the caller. */
    interface LinkRequest {
        UUID getId(); UUID getPatientId(); UUID getCaseId(); String getEmail(); String getOrigin(); Instant getExpiresAt();
        String getResolution(); String getResolvedSubject();
    }

    @Query("""
            select r.id as id, r.patientId as patientId, r.caseId as caseId, r.email as email, r.origin as origin,
                r.expiresAt as expiresAt, r.resolution as resolution, r.resolvedSubject as resolvedSubject
            from PatientAccountLinkRequest r where r.tokenHash = :tokenHash""")
    Optional<LinkRequest> findByToken(@Param("tokenHash") String tokenHash);

    /** The addresses of the patient's unanswered requests, newest first (expired ones included). */
    @Query("select r.email from PatientAccountLinkRequest r where r.patientId = :patientId and r.consumedAt is null order by r.createdAt desc")
    List<String> findNewestPendingEmails(@Param("patientId") UUID patientId, Limit limit);

    /** The patient has an unanswered request that has not expired. */
    @Query("""
            select count(r) > 0 from PatientAccountLinkRequest r
            where r.patientId = :patientId and r.consumedAt is null and r.expiresAt > :now""")
    boolean hasLivePendingFor(@Param("patientId") UUID patientId, @Param("now") Instant now);

    /** Unanswered, unexpired requests sent to an address. */
    @Query("select count(r) from PatientAccountLinkRequest r where r.email = :email and r.consumedAt is null and r.expiresAt > :now")
    long countLivePendingTo(@Param("email") String email, @Param("now") Instant now);

    /** Any request, answered or not, for this patient and address. */
    boolean existsByPatientIdAndEmail(UUID patientId, String email);
}
