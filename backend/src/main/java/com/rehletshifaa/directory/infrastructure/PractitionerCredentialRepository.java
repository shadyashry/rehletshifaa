package com.rehletshifaa.directory.infrastructure;

import com.rehletshifaa.directory.domain.PractitionerCredential;
import com.rehletshifaa.shared.persistence.BaseRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;
import java.util.UUID;

public interface PractitionerCredentialRepository extends BaseRepository<PractitionerCredential, UUID> {
    /** Credentials under review that are still current, required before a consultant can be approved. */
    @Query("select count(c) from PractitionerCredential c where c.practitionerId = :id and c.status = 'UNDER_REVIEW' and (c.expiresAt is null or c.expiresAt > :now)")
    long countCurrentUnderReview(@Param("id") UUID practitionerId, @Param("now") Instant now);

    /** At least one verified credential is current (the expiry check of the eligibility rule). */
    @Query("select count(c) > 0 from PractitionerCredential c where c.practitionerId = :id and c.status = 'VERIFIED' and (c.expiresAt is null or c.expiresAt > :now)")
    boolean hasCurrentVerified(@Param("id") UUID practitionerId, @Param("now") Instant now);

    @Query("select c.id from PractitionerCredential c where c.practitionerId = :id and c.status = 'UNDER_REVIEW'")
    java.util.List<UUID> findUnderReviewIds(@Param("id") UUID practitionerId);

    /** Applies the credentialing decision to every credential under review. */
    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("update PractitionerCredential c set c.status = :status, c.verifiedAt = :now, c.verifiedBy = :actor where c.practitionerId = :id and c.status = 'UNDER_REVIEW'")
    int decideUnderReview(@Param("id") UUID practitionerId, @Param("status") String status, @Param("actor") String actor, @Param("now") Instant now);

    interface ExpiringCredential { UUID getCredentialId(); Instant getExpiresAt(); String getEmailEncrypted(); }

    /** Verified credentials expiring in (from, until] whose consultant has an email to remind. */
    @Query("""
            select c.id as credentialId, c.expiresAt as expiresAt, p.emailEncrypted as emailEncrypted
            from PractitionerCredential c join PractitionerProfile p on p.id = c.practitionerId
            where c.status = 'VERIFIED' and c.expiresAt > :from and c.expiresAt <= :until and p.emailEncrypted is not null""")
    java.util.List<ExpiringCredential> findExpiringWithEmail(@Param("from") Instant from, @Param("until") Instant until);

    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("update PractitionerCredential c set c.status = 'EXPIRED' where c.status = 'VERIFIED' and c.expiresAt is not null and c.expiresAt <= :now")
    int expireLapsed(@Param("now") Instant now);
}
