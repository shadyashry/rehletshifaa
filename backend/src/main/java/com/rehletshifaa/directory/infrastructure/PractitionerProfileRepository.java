package com.rehletshifaa.directory.infrastructure;

import com.rehletshifaa.directory.domain.PractitionerProfile;
import com.rehletshifaa.shared.persistence.BaseRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

public interface PractitionerProfileRepository extends BaseRepository<PractitionerProfile, UUID> {
    boolean existsByEmailHash(String emailHash);

    boolean existsByExternalSubject(String externalSubject);

    /** {@code external_subject} is unique. */
    java.util.Optional<PractitionerProfile> findByExternalSubject(String externalSubject);

    List<PractitionerProfile> findByExternalSubjectAndPractitionerType(String externalSubject, String practitionerType);

    List<PractitionerProfile> findByPractitionerTypeOrderByDisplayName(String practitionerType);

    java.util.Optional<PractitionerProfile> findFirstByExternalSubjectAndCredentialingStatus(String externalSubject, String credentialingStatus);

    /** An enabled consultant account bound to this identity (authority: CONSULTANT role). */
    @Query("select count(p) > 0 from PractitionerProfile p where p.externalSubject = :subject and p.accountStatus <> 'DISABLED' and p.disabledAt is null")
    boolean isEnabledConsultant(@Param("subject") String subject);

    @Query("select count(p) > 0 from PractitionerProfile p where p.id = :id and p.externalSubject = :subject and p.accountStatus <> 'DISABLED' and p.disabledAt is null")
    boolean ownsEnabledProfile(@Param("id") UUID id, @Param("subject") String subject);

    /** Binds the provisioned identity unless a different identity already holds the profile. */
    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("""
            update PractitionerProfile p set p.externalSubject = :subject, p.updatedAt = :now, p.version = p.version + 1
            where p.id = :id and (p.externalSubject is null or p.externalSubject = :subject)""")
    int bindIdentity(@Param("id") UUID id, @Param("subject") String subject, @Param("now") Instant now);

    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("""
            update PractitionerProfile p set p.accountStatus = 'INVITED', p.invitedAt = :now, p.updatedAt = :now, p.version = p.version + 1
            where p.id = :id and p.disabledAt is null""")
    int markInvited(@Param("id") UUID id, @Param("now") Instant now);

    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("update PractitionerProfile p set p.accountStatus = :status, p.disabledAt = :disabledAt, p.updatedAt = :now, p.version = p.version + 1 where p.id = :id")
    int setAccountStatus(@Param("id") UUID id, @Param("status") String status, @Param("disabledAt") Instant disabledAt, @Param("now") Instant now);

    /** The single credentialing decision on a profile still under review. */
    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("""
            update PractitionerProfile p set p.credentialingStatus = :status, p.suspensionReason = :reason, p.updatedAt = :now,
                p.version = p.version + 1
            where p.id = :id and p.credentialingStatus = 'UNDER_REVIEW'""")
    int decideCredentialing(@Param("id") UUID id, @Param("status") String status, @Param("reason") String reason, @Param("now") Instant now);

    /** Verified consultants without any current verified credential (credential expiry sweep). */
    @Query("""
            select p.id from PractitionerProfile p where p.credentialingStatus = 'VERIFIED' and not exists (
                select 1 from PractitionerCredential c where c.practitionerId = p.id and c.status = 'VERIFIED'
                    and (c.expiresAt is null or c.expiresAt > :now))""")
    List<UUID> findVerifiedWithoutCurrentCredential(@Param("now") Instant now);

    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("""
            update PractitionerProfile p set p.credentialingStatus = 'EXPIRED', p.availabilityStatus = 'UNAVAILABLE', p.updatedAt = :now,
                p.version = p.version + 1
            where p.id = :id and p.credentialingStatus = 'VERIFIED'""")
    int expireCredentialing(@Param("id") UUID id, @Param("now") Instant now);

    /** Consultant-controlled availability, guarded by the version the consultant saw. */
    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("""
            update PractitionerProfile p set p.availabilityStatus = :status, p.updatedAt = :now, p.version = p.version + 1
            where p.id = :id and p.version = :version""")
    int setAvailability(@Param("id") UUID id, @Param("version") long version, @Param("status") String status, @Param("now") Instant now);

    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("""
            update PractitionerProfile p set p.availabilityStatus = :status, p.expectedReviewHours = :hours, p.updatedAt = :now,
                p.version = p.version + 1
            where p.id = :id and p.version = :version""")
    int setAvailabilityAndReviewHours(@Param("id") UUID id, @Param("version") long version, @Param("status") String status,
                                      @Param("hours") Integer hours, @Param("now") Instant now);
}
